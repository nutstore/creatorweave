//! `exec_status` — check whether a background process is alive, and
//! optionally probe a localhost port for readiness.
//!
//! STATUS.md §17.2: stateless primitive used by the web executor's internal
//! readiness loop (the LLM never polls this directly).

use serde_json::{json, Value};

use crate::process_registry::{self, ProcState};

use super::exec_logs;

pub fn handle(request: &Value) -> Value {
    let process_id = request.get("process_id").and_then(|v| v.as_str()).unwrap_or("");
    let name = request.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let scope_id = request.get("scope_id").and_then(|v| v.as_str()).unwrap_or("");

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

    // Optional port readiness probe (TCP connect to localhost).
    let port_ready = request
        .get("probe_port")
        .and_then(|v| v.as_u64())
        .filter(|p| *p > 0 && *p <= 65535)
        .map(|p| tcp_probe(p as u16));

    let state_str = match rec.state {
        ProcState::Running => "running",
        ProcState::Exited => "exited",
        ProcState::Stopped => "stopped",
    };

    let mut resp = json!({
        "ok": true,
        "process_id": rec.process_id,
        "name": rec.name,
        "state": state_str,
        "exit_code": rec.exit_code,
        "started_at": rec.started_at,
        "ended_at": rec.ended_at,
    });
    if let Some(ready) = port_ready {
        resp["port_ready"] = json!(ready);
    }
    resp
}

/// Try a TCP connect to 127.0.0.1:port with a short timeout.
fn tcp_probe(port: u16) -> bool {
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("127.0.0.1:{port}");
    match addr.parse::<std::net::SocketAddr>() {
        Ok(sock) => TcpStream::connect_timeout(&sock, Duration::from_millis(300)).is_ok(),
        Err(_) => false,
    }
}

// Silence unused import when compiled without tail-read helper usage here.
#[allow(unused)]
fn _unused() {
    let _ = exec_logs::handle;
}
