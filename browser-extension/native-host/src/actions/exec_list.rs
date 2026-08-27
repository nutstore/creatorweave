//! `exec_list` — list managed background processes (optionally per scope).
//!
//! Lets a new session discover processes left over from a
//! previous one, and powers the UI "running processes" panel.

use serde_json::{json, Value};

use crate::process_registry;

pub fn handle(request: &Value) -> Value {
    let scope_filter = request.get("scope_id").and_then(|v| v.as_str());

    process_registry::reap_dead();
    let file = process_registry::load();

    let procs: Vec<Value> = file
        .processes
        .iter()
        .rev() // newest first
        .filter(|p| scope_filter.map_or(true, |s| p.scope_id == s))
        .map(|p| {
            json!({
                "process_id": p.process_id,
                "pid": p.pid,
                "command": p.command,
                "scope_id": p.scope_id,
                "name": p.name,
                "state": match p.state {
                    process_registry::ProcState::Running => "running",
                    process_registry::ProcState::Exited => "exited",
                    process_registry::ProcState::Stopped => "stopped",
                },
                "started_at": p.started_at,
                "ended_at": p.ended_at,
                "log_path": p.log_path,
            })
        })
        .collect();

    json!({ "ok": true, "processes": procs })
}
