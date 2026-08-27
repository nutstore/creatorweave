//! `delete_file` — delete a file or directory.
//!
//! Non-empty directories require `recursive: true`. Idempotent: returns ok
//! even if the path doesn't exist. The authorized scope root is never deletable.

use std::fs;

use serde_json::{json, Value};

use super::resolve_path;
use crate::scope;

pub fn handle(request: &Value) -> Value {
    let scope_id = match request.get("scope_id").and_then(|v| v.as_str()) {
        Some(value) => value,
        None => return json!({ "ok": false, "error": "missing scope_id" }),
    };
    let relative_path = match request.get("relative_path").and_then(|v| v.as_str()) {
        Some(value) if !value.trim().is_empty() && value != "." => value,
        _ => return json!({ "ok": false, "error": "refusing to delete scope root" }),
    };
    let path = match resolve_path(request) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let root = match scope::resolve_safe_relative(scope_id, "") {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    if path == root || relative_path.split(['/', '\\']).all(|part| part.is_empty() || part == ".") {
        return json!({ "ok": false, "error": "refusing to delete scope root" });
    }

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
                    Err(e2) if e2.kind() == std::io::ErrorKind::NotFound => json!({ "ok": true }),
                    Err(e2) => json!({ "ok": false, "error": format!("remove_dir_all failed: {e2}") }),
                }
            } else {
                json!({ "ok": false, "error": format!("delete failed (directory not empty?): {e}") })
            }
        }
    }
}
