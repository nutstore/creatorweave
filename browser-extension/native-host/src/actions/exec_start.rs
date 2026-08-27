//! `exec_start` — spawn a detached background process (dev server etc).
//!
//! Stateless. Spawns the command in its own session
//! (`setsid` → own process group), redirects stdout/stderr to a log file,
//! registers it in processes.json, and returns immediately. The child keeps
//! running after the host process exits.
//!
//! Request: `{ action, scope_id, command: [...], name?, cwd?, env? }`
//! Response: `{ ok: true, process_id, log_path }`

use std::process::{Command, Stdio};

use serde_json::{json, Value};

use crate::process_registry::{self, logs_dir, StartParams};
use crate::scope;
use crate::shell_env;

pub fn handle(request: &Value) -> Value {
    // ── scope_id (required) ──
    let scope_id = match request.get("scope_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return json!({ "ok": false, "error": "missing scope_id" }),
    };

    // ── command (argv array, required) ──
    let command: Vec<String> = match request.get("command").and_then(|v| v.as_array()) {
        Some(arr) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        None => return json!({ "ok": false, "error": "missing or invalid command array" }),
    };
    if command.is_empty() {
        return json!({ "ok": false, "error": "empty command array" });
    }

    // NOTE: exec_start ALWAYS requires user approval on the
    // web side. The web executor gates this action behind ExecAuthModal and
    // never consults execpolicy for auto-approval. Long-running processes are
    // one risk tier above one-shot commands.

    // ── resolve cwd (scope root + optional relative cwd) ──
    let mut cwd = match scope::resolve_scope_path(&scope_id) {
        Some(p) => p,
        None => return json!({ "ok": false, "error": format!("unknown scope_id: {scope_id}") }),
    };
    if let Some(rel) = request.get("cwd").and_then(|v| v.as_str()) {
        if !rel.is_empty() {
            let safe = match scope::resolve_safe_relative(&scope_id, rel) {
                Ok(p) => p,
                Err(e) => return json!({ "ok": false, "error": e }),
            };
            if !safe.is_dir() {
                return json!({ "ok": false, "error": format!("cwd is not a directory: {rel}") });
            }
            cwd = safe;
        }
    }

    // ── registry cap check happens in register(); prepare log file first ──
    let name = request.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
    let log_dir = logs_dir();
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        return json!({ "ok": false, "error": format!("create logs dir: {e}") });
    }

    // Build the command.
    #[cfg(windows)]
    let command = {
        // resolve bare names through PATH×PATHEXT AFTER
        // policy/approval checks (execpolicy matched the user-facing name).
        let mut resolved = command.clone();
        resolved[0] = crate::win::resolve_command(&resolved[0]);
        resolved
    };
    let mut cmd = Command::new(&command[0]);
    cmd.args(&command[1..]);
    cmd.current_dir(&cwd);
    cmd.stdin(Stdio::null());
    shell_env::apply_shell_env(&mut cmd);
    if let Some(env) = request.get("env").and_then(|v| v.as_object()) {
        for (k, v) in env {
            if let Some(val) = v.as_str() {
                cmd.env(k, val);
            }
        }
    }

    // Spawn first, then register with the real pid. The log file gets a
    // temporary name (subsec nanos) and is renamed to the process_id after
    // registration succeeds.
    let tmp_id = format!(
        "proc_{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0)
    );
    let log_path = log_dir.join(format!("{tmp_id}.log"));
    let log_path_str = log_path.to_string_lossy().into_owned();

    // Open log file and wire stdout/stderr to it.
    let log_file = match std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&log_path)
    {
        Ok(f) => f,
        Err(e) => return json!({ "ok": false, "error": format!("open log file: {e}") }),
    };
    let stdout_log = match log_file.try_clone() {
        Ok(f) => f,
        Err(e) => return json!({ "ok": false, "error": format!("clone log handle: {e}") }),
    };
    cmd.stdout(stdout_log);
    cmd.stderr(log_file);

    // ── detached spawn ──
    // Unix: new session (setsid) → own process group, pgid == pid.
    // Windows: CREATE_NEW_PROCESS_GROUP + CREATE_NO_WINDOW
    // (detached + no console window); pgid unused (taskkill /T walks the tree by pid).
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0); // setsid semantics: child leads a new pgroup
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use crate::win::{CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW};
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let msg = if e.kind() == std::io::ErrorKind::NotFound {
                format!("command not found: {}", command[0])
            } else {
                format!("failed to spawn: {e}")
            };
            return json!({ "ok": false, "error": msg });
        }
    };
    let pid = child.id();
    // With process_group(0), pgid == pid (Unix). Windows tree-kill is
    // pid-based; record pgid = pid for format compatibility.
    let pgid = pid;
    // Reap the zombie immediately; the child is fully detached now.
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    // ── register (enforces cap + name uniqueness) ──
    let process_id = match process_registry::register(StartParams {
        pid,
        pgid,
        command: command.clone(),
        scope_id: scope_id.clone(),
        name: name.clone(),
        log_path: log_path_str.clone(),
    }) {
        Ok(id) => id,
        Err(e) => {
            // Roll back: kill what we just spawned.
            kill_group(pgid);
            return json!({ "ok": false, "error": e });
        }
    };

    // Rename the log file to match the registered process_id.
    let final_log = log_dir.join(format!("{process_id}.log"));
    if std::fs::rename(&log_path, &final_log).is_ok() {
        let final_str = final_log.to_string_lossy().into_owned();
        // Patch the registry record's log_path via mark-less update.
        if let Err(e) = process_registry::update_log_path(&process_id, &final_str) {
            eprintln!("[cw-native-host] log path update failed: {e}");
        }
        return json!({ "ok": true, "process_id": process_id, "log_path": final_str });
    }

    json!({ "ok": true, "process_id": process_id, "log_path": log_path_str })
}

/// Terminate the whole process tree (best-effort rollback).
/// Unix: SIGTERM the group (-pgid). Windows: taskkill /T.
fn kill_group(pgid: u32) {
    #[cfg(unix)]
    {
        extern "C" {
            fn kill(pgid: i32, sig: i32) -> i32;
        }
        unsafe {
            kill(-(pgid as i32), 15); // -pgid, SIGTERM
        }
    }
    #[cfg(windows)]
    {
        let _ = crate::win::kill_tree(pgid, false);
    }
}
