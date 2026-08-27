//! `exec_logs` — read background-process log output (offset-paged).
//!
//! Same chunking protocol as read_file_at. Reads the log
//! file recorded in processes.json.

use std::io::{Read, Seek, SeekFrom};

use serde_json::{json, Value};

use crate::process_registry;

use super::base64;

pub fn handle(request: &Value) -> Value {
    // ── resolve process (process_id or name+scope_id) ──
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

    // ── tail mode: read the last N bytes ──
    let offset: u64;
    let length: usize;
    if let Some(tail) = request.get("tail").and_then(|v| v.as_u64()) {
        let mut f = match std::fs::File::open(&rec.log_path) {
            Ok(f) => f,
            Err(_) => return json!({ "ok": false, "error": "log file not available" }),
        };
        let size = f.metadata().map(|m| m.len()).unwrap_or(0);
        let tail = tail.min(1_000_000); // cap tail at 1MB of raw bytes
        let start = size.saturating_sub(tail);
        if let Err(e) = f.seek(SeekFrom::Start(start)) {
            return json!({ "ok": false, "error": format!("seek failed: {e}") });
        }
        offset = start;
        length = (size - start) as usize;
    } else {
        offset = request.get("offset").and_then(|v| v.as_u64()).unwrap_or(0);
        let raw_len = request
            .get("length")
            .and_then(|v| v.as_u64())
            .unwrap_or(512 * 1024) as usize;
        // Cap to the NM-safe chunk size (same as read_file_at).
        length = raw_len.min(512 * 1024);
    }

    let mut f = match std::fs::File::open(&rec.log_path) {
        Ok(f) => f,
        Err(_) => return json!({ "ok": false, "error": "log file not available" }),
    };
    let file_size = match f.metadata() {
        Ok(m) => m.len(),
        Err(e) => return json!({ "ok": false, "error": format!("metadata failed: {e}") }),
    };
    if let Err(e) = f.seek(SeekFrom::Start(offset)) {
        return json!({ "ok": false, "error": format!("seek failed: {e}") });
    }

    let mut buf = vec![0u8; length];
    let bytes_read = match f.read(&mut buf) {
        Ok(n) => n,
        Err(e) => return json!({ "ok": false, "error": format!("read failed: {e}") }),
    };
    buf.truncate(bytes_read);

    let eof = bytes_read < length || offset + bytes_read as u64 >= file_size;

    json!({
        "ok": true,
        "process_id": rec.process_id,
        "data": base64::encode(&buf),
        "encoding": "base64",
        "bytes_read": bytes_read,
        "offset": offset,
        "eof": eof,
        "size": file_size,
    })
}
