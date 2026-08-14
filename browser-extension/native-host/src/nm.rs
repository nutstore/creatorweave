//! Native Messaging I/O — length-prefixed message framing.
//!
//! Chrome NM protocol: each message is preceded by a 4-byte little-endian
//! unsigned int giving the byte length of the payload that follows.
//! Maximum message size is 1 MB (1,048,576 bytes).

use std::io::{self, Read, Write};

/// Chrome NM hard limit.
pub const MAX_MESSAGE_SIZE: usize = 1_048_576;

/// Errors from the NM framing layer.
#[derive(Debug)]
pub enum NmError {
    /// stdin reached EOF (Chrome closed the pipe).
    Eof,
    /// Underlying I/O error.
    Io(io::Error),
    /// Message exceeded the 1 MB limit.
    TooLarge(usize),
}

impl From<io::Error> for NmError {
    fn from(e: io::Error) -> Self {
        if e.kind() == io::ErrorKind::UnexpectedEof {
            NmError::Eof
        } else {
            NmError::Io(e)
        }
    }
}

/// Read a single NM message from `reader`.
///
/// Returns the raw message bytes (without the length prefix).
pub fn read_message<R: Read>(reader: &mut R) -> Result<Vec<u8>, NmError> {
    // Read 4-byte length prefix
    let mut len_buf = [0u8; 4];
    match reader.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Err(NmError::Eof),
        Err(e) => return Err(NmError::Io(e)),
    }

    let length = u32::from_le_bytes(len_buf) as usize;
    if length == 0 {
        return Ok(Vec::new());
    }
    if length > MAX_MESSAGE_SIZE {
        return Err(NmError::TooLarge(length));
    }

    let mut buf = vec![0u8; length];
    reader.read_exact(&mut buf)?;
    Ok(buf)
}

/// Write a single NM message to `writer`.
///
/// `value` is serialized to JSON and prefixed with its byte length.
pub fn write_message<W: Write>(writer: &mut W, value: &serde_json::Value) -> io::Result<()> {
    let json = serde_json::to_vec(value)?;
    let len = json.len();
    if len > MAX_MESSAGE_SIZE {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("response too large: {len} bytes (max {MAX_MESSAGE_SIZE})"),
        ));
    }
    writer.write_all(&(len as u32).to_le_bytes())?;
    writer.write_all(&json)?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_message() {
        let payload = serde_json::json!({ "action": "ping" });
        let mut buf = Vec::new();
        write_message(&mut buf, &payload).unwrap();

        let mut cursor = io::Cursor::new(buf);
        let received = read_message(&mut cursor).unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&received).unwrap();
        assert_eq!(parsed, payload);
    }

    #[test]
    fn eof_on_empty_input() {
        let mut empty = io::empty();
        let result = read_message(&mut empty);
        assert!(matches!(result, Err(NmError::Eof)));
    }
}
