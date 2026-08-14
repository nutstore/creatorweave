//! Minimal base64 encode/decode — avoids adding the `base64` crate.
//!
//! Standard (RFC 4648) alphabet, no padding needed for our use case
//! but we include it for safety.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Encode bytes to a base64 string.
pub fn encode(input: &[u8]) -> String {
    let mut result = String::with_capacity((input.len() * 4 + 2) / 3);
    let chunks = input.chunks(3);
    for chunk in chunks {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(ALPHABET[((triple >> 18) & 0x3F) as usize] as char);
        result.push(ALPHABET[((triple >> 12) & 0x3F) as usize] as char);

        if chunk.len() > 1 {
            result.push(ALPHABET[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(ALPHABET[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Decode a base64 string to bytes.
pub fn decode(input: &str) -> Result<Vec<u8>, String> {
    let input = input.trim();
    let input_bytes = input.as_bytes();

    // Build reverse lookup table
    let mut lookup = [255u8; 256];
    for (i, &c) in ALPHABET.iter().enumerate() {
        lookup[c as usize] = i as u8;
    }

    let mut result = Vec::with_capacity(input.len() * 3 / 4);

    // Process in groups of 4 characters
    let mut i = 0;
    while i + 3 < input_bytes.len() + 1 {
        let c0 = input_bytes.get(i).copied().unwrap_or(b'=');
        let c1 = input_bytes.get(i + 1).copied().unwrap_or(b'=');
        let c2 = input_bytes.get(i + 2).copied().unwrap_or(b'=');
        let c3 = input_bytes.get(i + 3).copied().unwrap_or(b'=');

        let v0 = lookup[c0 as usize];
        let v1 = lookup[c1 as usize];

        if v0 == 255 || v1 == 255 {
            return Err(format!("invalid base64 character at offset {i}"));
        }

        let triple = ((v0 as u32) << 18) | ((v1 as u32) << 12);
        result.push((triple >> 16) as u8);

        if c2 != b'=' {
            let v2 = lookup[c2 as usize];
            if v2 == 255 {
                return Err(format!("invalid base64 character at offset {}", i + 2));
            }
            let triple = triple | ((v2 as u32) << 6);
            result.push((triple >> 8) as u8);

            if c3 != b'=' {
                let v3 = lookup[c3 as usize];
                if v3 == 255 {
                    return Err(format!("invalid base64 character at offset {}", i + 3));
                }
                let triple = triple | (v3 as u32);
                result.push(triple as u8);
            }
        }

        i += 4;
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_text() {
        let original = b"Hello, World!";
        let encoded = encode(original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn roundtrip_binary() {
        let original: Vec<u8> = (0..=255).collect();
        let encoded = encode(&original);
        let decoded = decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }

    #[test]
    fn roundtrip_empty() {
        let encoded = encode(b"");
        assert_eq!(encoded, "");
        let decoded = decode("").unwrap();
        assert!(decoded.is_empty());
    }

    #[test]
    fn known_values() {
        assert_eq!(encode(b"Hello"), "SGVsbG8=");
        assert_eq!(encode(b"Hi"), "SGk=");
        assert_eq!(encode(b"A"), "QQ==");
    }
}
