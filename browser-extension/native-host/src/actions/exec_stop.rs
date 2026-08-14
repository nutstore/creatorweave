//! `exec_stop` — terminate a background process (whole process group).
//!
//! STATUS.md §17.2: SIGTERM the group (-pgid) first; `force: true` escalates
//! to SIGKILL. Marks the registry record as stopped.

use serde_json::{json, Value};

use crate::process_registry::{self, ProcState};

pub fn handle(request: &Value) -> Value {
    let process_id = request.get("process_id").and_then(|v| v.as_str()).unwrap_or("");
    let name = request.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let scope_id = request.get("scope_id").and_then(|v| v.as_str()).unwrap_or("");
    let force = request.get("force").and_then(|v| v.as_bool()).unwrap_or(false);

    process_registry::reap_dead();
    let file = process_registry::load();
    let rec = match process_registry::find(&file, process_id, name, scope_id) {
        Some(r) => r,
        None => {
            return json!({ "ok": false, "error": format!(
                "process not found (process_id: {process_id:?}, name: {name:?})"
            ) })
        }
    };

    // Already dead → just report.
    if !matches!(rec.state, ProcState::Running) {
        return json!({
            "ok": true,
            "process_id": rec.process_id,
            "signaled": false,
            "state": match rec.state { ProcState::Running => "running", ProcState::Exited => "exited", ProcState::Stopped => "stopped" },
            "note": "process was not running",
        });
    }

    // ── signal the whole process group ──
    let sig = if force { 9 } else { 15 }; // SIGKILL / SIGTERM
    let signaled = kill_group(rec.pgid, sig);

    if !signaled {
        // Group may already be gone; re-check pid directly.
        if !process_registry::pid_alive(rec.pid) {
            let _ = process_registry::mark(&rec.process_id, ProcState::Stopped, None);
            return json!({ "ok": true, "process_id": rec.process_id, "signaled": false, "state": "stopped" });
        }
        return json!({ "ok": false, "error": format!("failed to signal pgid {}", rec.pgid) });
    }

    // Wait briefly for the group to die; force-mark stopped either way.
    if force {
        let _ = process_registry::mark(&rec.process_id, ProcState::Stopped, None);
    } else {
        // Give it up to 3s to exit gracefully.
        for _ in 0..30 {
            if !process_registry::pid_alive(rec.pid) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        if process_registry::pid_alive(rec.pid) {
            // Still alive after SIGTERM grace — report partial success so the
            // caller knows to escalate with force.
            return json!({
                "ok": true,
                "process_id": rec.process_id,
                "signaled": true,
                "state": "running",
                "note": "SIGTERM sent but process still alive; retry with force",
            });
        }
        let _ = process_registry::mark(&rec.process_id, ProcState::Stopped, None);
    }

    json!({ "ok": true, "process_id": rec.process_id, "signaled": true, "state": "stopped" })
}

/// Signal a process group. Returns true when the signal was delivered.
fn kill_group(pgid: u32, sig: i32) -> bool {
    #[cfg(unix)]
    {
        extern "C" {
            fn kill(pgid: i32, sig: i32) -> i32;
        }
        unsafe { kill(-(pgid as i32), sig) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = (pgid, sig);
        false
    }
}
