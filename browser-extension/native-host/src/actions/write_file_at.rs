//! `write_file_at` — chunked write for large files.
//!
//! Supports `truncate` (first chunk overwrites) and `finalize` (last chunk
//! fsync + return metadata). Each call is stateless: open, seek, write, close.

use std::fs;
use std::io::{Seek, SeekFrom, Write};
use std::path::Path;

use serde_json::{json, Value};

use super::resolve_path;
use super::base64;

pub fn handle(request: &Value) -> Value {
    let path = match resolve_path(request) {
        Ok(p) => p,
        Err(e) => return e,
    };

    let offset = request
        .get("offset")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let truncate = request
        .get("truncate")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let finalize = request
        .get("finalize")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let data_b64 = match request.get("data").and_then(|v| v.as_str()) {
        Some(d) => d,
        None => return json!({ "ok": false, "error": "missing data field" }),
    };

    let bytes = match base64::decode(data_b64) {
        Ok(b) => b,
        Err(e) => return json!({ "ok": false, "error": format!("base64 decode: {e}") }),
    };

    // Create parent directories if needed
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return json!({ "ok": false, "error": format!("create_dir_all: {e}") });
            }
        }
    }

    let bytes_written = bytes.len();

    // Open file: truncate=true → create+truncate, else open for write
    let write_result = if truncate {
        // First chunk: create/truncate + write
        write_truncated(&path, offset, &bytes)
    } else {
        // Subsequent chunks: open existing (or create) + seek + write
        write_append(&path, offset, &bytes)
    };

    if let Err(e) = write_result {
        return json!({ "ok": false, "error": format!("write failed: {e}") });
    }

    if finalize {
        // fsync and return metadata
        if let Ok(meta) = fs::metadata(&path) {
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() * 1000 + d.subsec_millis() as u64)
                .unwrap_or(0);

            return json!({
                "ok": true,
                "bytes_written": bytes_written,
                "offset": offset,
                "size": meta.len(),
                "mtime": mtime,
            });
        }
    }

    json!({
        "ok": true,
        "bytes_written": bytes_written,
        "offset": offset,
    })
}

/// First chunk: create/truncate file, seek to offset, write.
fn write_truncated(path: &Path, offset: u64, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)?;
    if offset > 0 {
        file.seek(SeekFrom::Start(offset))?;
    }
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

/// Subsequent chunk: open existing (or create), seek to offset, write.
fn write_append(path: &Path, offset: u64, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
