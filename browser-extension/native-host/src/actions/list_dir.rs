//! `list_dir` — non-recursive listing of a directory's direct children.

use std::fs;

use serde_json::{json, Value};

use super::resolve_path;

pub fn handle(request: &Value) -> Value {
    let path = match resolve_path(request) {
        Ok(p) => p,
        Err(e) => return e,
    };

    let read_dir = match fs::read_dir(&path) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return json!({ "ok": false, "error": "directory not found" });
        }
        Err(e) => {
            return json!({ "ok": false, "error": format!("read_dir failed: {e}") });
        }
    };

    let mut entries: Vec<Value> = Vec::new();

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // skip unreadable entries
        };

        let name = entry.file_name().to_string_lossy().into_owned();
        let ft = entry.file_type();

        let (kind, mtime, size) = if let Ok(meta) = entry.metadata() {
            let m = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() * 1000 + d.subsec_millis() as u64)
                .unwrap_or(0);
            let k = if ft.as_ref().map(|t| t.is_dir()).unwrap_or(false) {
                "directory"
            } else {
                "file"
            };
            (k, m, meta.len())
        } else {
            ("file", 0, 0)
        };

        let entry_json = if kind == "file" {
            json!({ "name": name, "kind": kind, "size": size, "mtime": mtime })
        } else {
            json!({ "name": name, "kind": kind })
        };
        entries.push(entry_json);
    }

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|a, b| {
        let ka = a.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        let kb = b.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        match (ka, kb) {
            ("directory", "file") => std::cmp::Ordering::Less,
            ("file", "directory") => std::cmp::Ordering::Greater,
            _ => na.cmp(nb),
        }
    });

    json!({ "ok": true, "entries": entries })
}
