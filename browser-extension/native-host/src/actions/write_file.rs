//! `write_file` — write a small file in a single NM message.
//!
//! Creates parent directories if needed. Overwrites existing file.

use std::fs;
use std::io::Write;
use std::path::Path;

use serde_json::{json, Value};

use super::resolve_path;
use super::base64;

pub fn handle(request: &Value) -> Value {
    let path = match resolve_path(request) {
        Ok(p) => p,
        Err(e) => return e,
    };

    let data_b64 = match request.get("data").and_then(|v| v.as_str()) {
        Some(d) => d,
        None => return json!({ "ok": false, "error": "missing data field" }),
    };

    let bytes = match base64::decode(data_b64) {
        Ok(b) => b,
        Err(e) => return json!({ "ok": false, "error": format!("base64 decode: {e}") }),
    };

    // Create parent directories
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return json!({ "ok": false, "error": format!("create_dir_all failed: {e}") });
            }
        }
    }

    // Write file
    match write_atomic(&path, &bytes) {
        Ok(()) => {
            // Read back metadata
            let meta = match fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => {
                    return json!({ "ok": true, "size": bytes.len() });
                }
            };
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
            })
        }
        Err(e) => json!({ "ok": false, "error": format!("write failed: {e}") }),
    }
}

/// Write bytes to a file, truncating any existing content.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = fs::File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
