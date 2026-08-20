//! `read_file_at` — chunked read for large files.
//!
//! Reads up to `length` bytes starting at `offset`. Returns base64-encoded
//! chunk + eof flag. Stateless: each call opens, seeks, reads, closes.

use std::fs;
use std::io::{Read, Seek, SeekFrom};

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

    let length = request
        .get("length")
        .and_then(|v| v.as_u64())
        .unwrap_or(crate::nm::MAX_MESSAGE_SIZE as u64) as usize;

    // Cap length to avoid exceeding NM limit after base64 encoding
    // base64 expands by 4/3, so max raw = 1MB * 3/4 ≈ 786KB.
    // We use 512KB as the safe chunk size (STATUS.md §4.1).
    let max_chunk = 512 * 1024;
    let length = length.min(max_chunk);

    let mut file = match fs::File::open(&path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return json!({ "ok": false, "error": "file not found" });
        }
        Err(e) => return json!({ "ok": false, "error": format!("open failed: {e}") }),
    };

    let file_size = match file.metadata() {
        Ok(m) => m.len(),
        Err(e) => return json!({ "ok": false, "error": format!("metadata failed: {e}") }),
    };

    // Seek to offset
    if let Err(e) = file.seek(SeekFrom::Start(offset)) {
        return json!({ "ok": false, "error": format!("seek failed: {e}") });
    }

    // Read up to `length` bytes
    let mut buf = vec![0u8; length];
    let bytes_read = match file.read(&mut buf) {
        Ok(n) => n,
        Err(e) => return json!({ "ok": false, "error": format!("read failed: {e}") }),
    };
    buf.truncate(bytes_read);

    let eof = bytes_read < length || offset + bytes_read as u64 >= file_size;

    json!({
        "ok": true,
        "data": base64::encode(&buf),
        "encoding": "base64",
        "bytes_read": bytes_read,
        "offset": offset,
        "eof": eof,
    })
}
