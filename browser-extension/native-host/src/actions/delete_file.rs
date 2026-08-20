//! `delete_file` — delete a file or empty directory.
//!
//! Idempotent: returns ok even if the path doesn't exist.

use std::fs;

use serde_json::{json, Value};

use super::resolve_path;

pub fn handle(request: &Value) -> Value {
    let path = match resolve_path(request) {
        Ok(p) => p,
        Err(e) => return e,
    };

    // Try removing as a file first, then as a directory
    match fs::remove_file(&path) {
        Ok(()) => return json!({ "ok": true }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Already gone — idempotent success
            return json!({ "ok": true });
        }
        Err(_) => {} // might be a directory, try below
    }

    match fs::remove_dir(&path) {
        Ok(()) => json!({ "ok": true }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            json!({ "ok": true })
        }
        Err(e) => {
            // Directory not empty — use recursive removal if explicitly requested
            let recursive = request
                .get("recursive")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if recursive {
                match fs::remove_dir_all(&path) {
                    Ok(()) => json!({ "ok": true }),
                    Err(e2) => json!({ "ok": false, "error": format!("remove_dir_all failed: {e2}") }),
                }
            } else {
                json!({ "ok": false, "error": format!("delete failed (directory not empty?): {e}") })
            }
        }
    }
}
