//! `read_file` — read a file (small files, single NM message).
//!
//! No max_bytes truncation: WorkspaceRuntime always needs
//! full content. The caller (NativeHostExecutor) decides small vs chunked
//! based on stat size before calling this action.

use std::fs;
use std::io::Read;

use serde_json::{json, Value};

use super::resolve_path;
use super::base64;

pub fn handle(request: &Value) -> Value {
    let path = match resolve_path(request) {
        Ok(p) => p,
        Err(e) => return e,
    };

    let mut file = match fs::File::open(&path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return json!({ "ok": false, "error": "file not found" });
        }
        Err(e) => return json!({ "ok": false, "error": format!("open failed: {e}") }),
    };

    let meta = match file.metadata() {
        Ok(m) => m,
        Err(e) => return json!({ "ok": false, "error": format!("metadata failed: {e}") }),
    };

    let size = meta.len() as usize;
    let mut buf = Vec::with_capacity(size);
    if let Err(e) = file.read_to_end(&mut buf) {
        return json!({ "ok": false, "error": format!("read failed: {e}") });
    }

    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() * 1000 + d.subsec_millis() as u64)
        .unwrap_or(0);

    json!({
        "ok": true,
        "content": base64::encode(&buf),
        "encoding": "base64",
        "size": size,
        "mtime": mtime,
    })
}
