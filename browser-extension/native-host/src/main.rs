//! CreatorWeave Native Host — main entry point
//!
//! Chrome Native Messaging protocol:
//!   - Input:  4-byte little-endian length prefix + UTF-8 JSON body
//!   - Output: 4-byte little-endian length prefix + UTF-8 JSON body
//!
//! Two modes:
//!   1. **Stateless** (sendNativeMessage): read one message → respond → exit.
//!      Used for file IO (read_file, write_file, etc.)
//!   2. **Streaming** (connectNative): read messages in a loop → respond to
//!      each → keep running until stdin closes. Used for exec (streaming stdout).
//!
//! Mode detection: if the first message contains `"stream": true`, enter
//! streaming mode; otherwise process as stateless and exit.
//!
//! Security: the host never logs to stdout (that's the NM channel).
//! Diagnostics go to stderr (ignored by Chrome).

use std::io;

mod actions;
mod nm;
mod process_registry;
mod scope;
mod shell_env;
#[cfg(target_os = "windows")]
mod win;

fn main() {
    // Helper mode: `cw-native-host --mcp-stdio` — MCP stdio server for
    // external CLI agents (Codex). Does NOT use the NM protocol on stdio;
    // instead speaks line-delimited JSON-RPC and relays to the loopback
    // bridge daemon started by the extension (see webmcp_bridge.rs).
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp-stdio") {
        std::process::exit(actions::mcp_stdio::run());
    }

    // Read first message from stdin
    let first_bytes = match nm::read_message(&mut io::stdin()) {
        Ok(bytes) => bytes,
        Err(nm::NmError::Eof) => return, // Chrome closed stdin — clean exit
        Err(nm::NmError::Io(e)) => {
            eprintln!("[cw-native-host] stdin read error: {e}");
            return;
        }
        Err(nm::NmError::TooLarge(n)) => {
            eprintln!("[cw-native-host] message too large: {n} bytes");
            return;
        }
    };

    // Parse JSON
    let request: serde_json::Value = match serde_json::from_slice(&first_bytes) {
        Ok(v) => v,
        Err(e) => {
            let resp = serde_json::json!({ "ok": false, "error": format!("invalid JSON: {e}") });
            let _ = nm::write_message(&mut io::stdout(), &resp);
            return;
        }
    };

    // Check if this is a streaming request
    let is_stream = request
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if is_stream {
        // ── Streaming mode (connectNative) ──
        run_streaming_loop(request);
    } else {
        // ── Stateless mode (sendNativeMessage) ──
        let response = actions::dispatch(&request);
        if let Err(e) = nm::write_message(&mut io::stdout(), &response) {
            eprintln!("[cw-native-host] stdout write error: {e}");
        }
        // Exit after single response
    }
}

/// Streaming event loop for connectNative.
///
/// Processes the first message, then keeps reading subsequent messages
/// until stdin closes (port disconnect).
fn run_streaming_loop(first_request: serde_json::Value) {
    let mut stdout = io::stdout();
    let mut stdin = io::stdin();

    // Process first message
    process_stream_message(&first_request, &mut stdout);

    // Keep reading until EOF
    loop {
        let msg_bytes = match nm::read_message(&mut stdin) {
            Ok(bytes) => bytes,
            Err(nm::NmError::Eof) => break,     // Port disconnected — exit
            Err(nm::NmError::Io(_)) => break,    // I/O error — exit
            Err(nm::NmError::TooLarge(n)) => {
                eprintln!("[cw-native-host] stream message too large: {n} bytes");
                let _ = nm::write_message(&mut stdout, &serde_json::json!({
                    "type": "error",
                    "error": format!("message too large: {n} bytes")
                }));
                continue;
            }
        };

        let request: serde_json::Value = match serde_json::from_slice(&msg_bytes) {
            Ok(v) => v,
            Err(e) => {
                let _ = nm::write_message(&mut stdout, &serde_json::json!({
                    "type": "error",
                    "error": format!("invalid JSON: {e}")
                }));
                continue;
            }
        };

        process_stream_message(&request, &mut stdout);
    }
}

/// Process a single streaming message and write response(s) to stdout.
fn process_stream_message(request: &serde_json::Value, stdout: &mut impl io::Write) {
    let action = request
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match action {
        "exec" => {
            actions::exec::handle_stream(request, stdout);
        }
        "webmcp_bridge" => {
            // Takes over the process: runs the loopback TCP daemon until
            // the NM port disconnects (stdin EOF).
            actions::webmcp_bridge::run(request);
        }
        _ => {
            let _ = nm::write_message(stdout, &serde_json::json!({
                "type": "error",
                "error": format!("unknown streaming action: {action}")
            }));
        }
    }
}
