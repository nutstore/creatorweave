//! `exec_sync` — stateless command execution (no streaming).
//!
//! Alternative to the streaming `exec` action that returns all output in a
//! single JSON response. Used when the streaming relay (connectNative) is
//! unavailable or unreliable.
//!
//! Request: `{ action: "exec_sync", scope_id, command: [...], env?, timeout? }`
//! Response: `{ ok: true, decision, stdout, stderr, exit_code, signal? }`
//!     or: `{ ok: false, error }`

use std::process::{Command, Stdio};
use std::time::Duration;

use serde_json::{json, Value};

use crate::scope;
use crate::shell_env;
use super::execpolicy;

pub fn handle(request: &Value) -> Value {
    // ── Parse scope_id ──
    let scope_id = match request.get("scope_id").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return json!({ "ok": false, "error": "missing scope_id" }),
    };

    // ── Parse command ──
    let command: Vec<String> = match request.get("command").and_then(|v| v.as_array()) {
        Some(arr) => arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect(),
        None => return json!({ "ok": false, "error": "missing or invalid command array" }),
    };
    if command.is_empty() {
        return json!({ "ok": false, "error": "empty command array" });
    }

    // ── Resolve scope root (cwd) ──
    let mut cwd = match scope::resolve_scope_path(scope_id) {
        Some(p) => p,
        None => return json!({ "ok": false, "error": format!("unknown scope_id: {scope_id}") }),
    };

    // ── Optional relative cwd (joined onto scope root, traversal-checked) ──
    if let Some(rel_cwd) = request.get("cwd").and_then(|v| v.as_str()) {
        if !rel_cwd.is_empty() {
            let safe = match scope::resolve_safe_relative(scope_id, rel_cwd) {
                Ok(p) => p,
                Err(e) => return json!({ "ok": false, "error": e }),
            };
            if !safe.is_dir() {
                return json!({ "ok": false, "error": format!("cwd is not a directory: {rel_cwd}") });
            }
            cwd = safe;
        }
    }

    // ── Check execpolicy ──
    let decision = execpolicy::check(&command);
    let decision_str = decision.to_string();

    if decision == execpolicy::Decision::Forbidden {
        return json!({
            "ok": false,
            "error": format!("command forbidden by execpolicy: {}", command.join(" ")),
            "decision": decision_str,
        });
    }

    // ── Parse optional timeout ──
    let timeout_secs = request
        .get("timeout")
        .and_then(|v| v.as_u64())
        .unwrap_or(120);

    // ── Build and spawn command ──
    #[cfg(windows)]
    let command = {
        // STATUS.md §8.2 (6): PATH×PATHEXT resolution AFTER policy check.
        let mut resolved = command.clone();
        resolved[0] = crate::win::resolve_command(&resolved[0]);
        resolved
    };
    let mut cmd = Command::new(&command[0]);
    cmd.args(&command[1..]);
    cmd.current_dir(&cwd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use crate::win::CommandExtNoWindow;
        cmd.creation_flags_no_window();
    }

    // Inherit the user's login-shell environment (PATH with nvm/mise/homebrew
    // etc.) so toolchain binaries are directly reachable. Request-provided
    // `env` below is applied AFTER, so explicit env entries still win.
    shell_env::apply_shell_env(&mut cmd);

    // Optional env vars
    if let Some(env) = request.get("env").and_then(|v| v.as_object()) {
        for (k, v) in env {
            if let Some(val) = v.as_str() {
                cmd.env(k, val);
            }
        }
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let error_msg = if e.kind() == std::io::ErrorKind::NotFound {
                format!("command not found: {}", command[0])
            } else {
                format!("failed to spawn: {e}")
            };
            return json!({ "ok": false, "error": error_msg, "decision": decision_str });
        }
    };

    // ── Wait with timeout ──
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
    let mut timed_out = false;

    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if std::time::Instant::now() > deadline {
                    timed_out = true;
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                return json!({ "ok": false, "error": format!("wait failed: {e}"), "decision": decision_str });
            }
        }
    }

    // ── Collect output ──
    use std::io::Read;
    let mut stdout_str = String::new();
    let mut stderr_str = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut stdout_str);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr_str);
    }

    // Cap output to ~800KB to stay within NM 1MB limit
    const MAX_OUT: usize = 800_000;
    let truncated = stdout_str.len() + stderr_str.len() > MAX_OUT;
    if stdout_str.len() > MAX_OUT {
        stdout_str.truncate(MAX_OUT);
    }
    if stderr_str.len() > MAX_OUT {
        stderr_str.truncate(MAX_OUT);
    }

    if timed_out {
        return json!({
            "ok": true,
            "decision": decision_str,
            "timed_out": true,
            "stdout": stdout_str,
            "stderr": stderr_str,
            "exit_code": null,
            "error": format!("command timed out after {timeout_secs}s"),
            "truncated": truncated,
        });
    }

    // ── Get exit status ──
    // Re-read the status (child already waited in the loop)
    let status = child.wait(); // should return immediately since process exited
    let (exit_code, signal) = match status {
        Ok(s) => {
            let code = s.code();
            #[cfg(unix)]
            let sig = {
                use std::os::unix::process::ExitStatusExt;
                s.signal()
            };
            #[cfg(not(unix))]
            let sig: Option<i32> = None;
            (code, sig)
        }
        Err(_) => (None, None),
    };

    json!({
        "ok": true,
        "decision": decision_str,
        "stdout": stdout_str,
        "stderr": stderr_str,
        "exit_code": exit_code,
        "signal": signal,
        "truncated": truncated,
    })
}
