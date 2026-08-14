//! `stat_file` — file metadata (size, mtime, is_file).

use std::fs;

use serde_json::{json, Value};

use super::resolve_path;

pub fn handle(request: &Value) -> Value {
    let path = match resolve_path(request) {
        Ok(p) => p,
        Err(e) => return e,
    };

    match fs::metadata(&path) {
        Ok(meta) => {
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() * 1000 + d.subsec_millis() as u64)
                .unwrap_or(0);

            json!({
                "ok": true,
                "size": meta.len(),
                "mtime": mtime,
                "is_file": meta.is_file(),
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            json!({ "ok": false, "error": "not found" })
        }
        Err(e) => json!({ "ok": false, "error": format!("stat failed: {e}") }),
    }
}
