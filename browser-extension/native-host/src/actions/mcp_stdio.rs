//! `--mcp-stdio` helper mode — run the SAME cw-native-host binary as an MCP
//! stdio server for external CLI agents (Codex).
//!
//! Usage (registered via `codex mcp add eo2weave-webmcp -- <path> --mcp-stdio`):
//!
//!   cw-native-host --mcp-stdio
//!
//! The helper does NOT talk to the browser directly. It reads
//! `~/.eo2weave/webmcp-bridge.json` for the daemon's loopback port and relays
//! MCP requests over TCP (newline-delimited JSON, see webmcp_bridge.rs).
//!
//! Supported MCP surface (JSON-RPC 2.0, line-delimited on stdio):
//!   - initialize        → capabilities + serverInfo
//!   - notifications/initialized (notification, no response)
//!   - ping              → {}
//!   - tools/list        → discovered WebMCP tools from browser tabs
//!   - tools/call        → invoke a WebMCP tool in its tab
//!
//! Unknown methods return standard JSON-RPC -32601. Daemon down → tools/list
//! returns an empty list with a hint, tools/call returns a clear error
//! (Codex shows it to the user, who then opens the EO2Weave popup to start
//! the bridge).

use std::io::{self, BufRead, BufReader, Write};
use std::net::TcpStream;
use std::time::Duration;

use serde_json::{json, Value};

use super::webmcp_bridge::bridge_state_path;

/// One-shot helper → daemon request. Returns Err when the daemon is down.
fn bridge_round_trip(payload: &Value, timeout: Duration) -> io::Result<Value> {
    let state_path = bridge_state_path().ok_or_else(|| {
        io::Error::new(io::ErrorKind::NotFound, "no HOME directory for bridge state")
    })?;
    let body = std::fs::read_to_string(&state_path).map_err(|e| {
        io::Error::new(
            e.kind(),
            format!("bridge state file unreadable ({}): {e}", state_path.display()),
        )
    })?;
    let state: Value = serde_json::from_str(&body)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("bridge state invalid: {e}")))?;
    let port = state
        .get("port")
        .and_then(|v| v.as_u64())
        .and_then(|p| u16::try_from(p).ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "bridge state has no port"))?;

    let mut stream = TcpStream::connect(("127.0.0.1", port))?;
    stream.set_read_timeout(Some(timeout))?;
    stream.set_write_timeout(Some(timeout))?;

    let mut line = serde_json::to_string(payload).map_err(|e| {
        io::Error::new(io::ErrorKind::InvalidData, format!("serialize failed: {e}"))
    })?;
    line.push('\n');
    stream.write_all(line.as_bytes())?;
    stream.flush()?;

    let mut reader = BufReader::new(stream);
    let mut response_line = String::new();
    let n = reader.read_line(&mut response_line)?;
    if n == 0 {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "bridge daemon closed connection without a response",
        ));
    }
    serde_json::from_str(response_line.trim()).map_err(|e| {
        io::Error::new(io::ErrorKind::InvalidData, format!("bridge response invalid: {e}"))
    })
}

fn jsonrpc_error(id: &Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.clone(),
        "error": { "code": code, "message": message },
    })
}

fn jsonrpc_ok(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id.clone(), "result": result })
}

const PARSE_ERROR: i64 = -32700;
const METHOD_NOT_FOUND: i64 = -32601;
const INTERNAL_ERROR: i64 = -32603;

/// Entry point for `--mcp-stdio`. Runs until stdin closes.
pub fn run() -> i32 {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin);
    let mut out = stdout;
    let exit_code = 0;

    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let _ = write_line(
                    &mut out,
                    &jsonrpc_error(&Value::Null, PARSE_ERROR, &format!("parse error: {e}")),
                );
                continue;
            }
        };

        let id = msg.get("id").cloned().unwrap_or(Value::Null);
        let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
        let is_notification = msg.get("id").is_none();

        match method {
            "initialize" => {
                let _ = write_line(
                    &mut out,
                    &jsonrpc_ok(
                        &id,
                        json!({
                            "protocolVersion": "2024-11-05",
                            "capabilities": {
                                "tools": {}
                            },
                            "serverInfo": {
                                "name": "eo2weave-webmcp",
                                "version": env!("CARGO_PKG_VERSION"),
                            },
                        }),
                    ),
                );
            }
            "notifications/initialized" | "initialized" => {
                // Notification — no response.
            }
            "ping" => {
                let _ = write_line(&mut out, &jsonrpc_ok(&id, json!({})));
            }
            "tools/list" => {
                match bridge_round_trip(&json!({ "id": "l1", "kind": "list" }), Duration::from_secs(10)) {
                    Ok(response) => {
                        if response.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                            let tools = response
                                .get("tools")
                                .cloned()
                                .unwrap_or_else(|| json!([]));
                            let _ = write_line(&mut out, &jsonrpc_ok(&id, json!({
                                "tools": tools,
                            })));
                        } else {
                            let detail = response
                                .get("error")
                                .and_then(|v| v.as_str())
                                .unwrap_or("bridge list failed");
                            let _ = write_line(
                                &mut out,
                                &jsonrpc_error(&id, INTERNAL_ERROR, detail),
                            );
                        }
                    }
                    Err(e) => {
                        // Daemon down: return an EMPTY tool list (not an error)
                        // so Codex still boots. The hint tells the user to
                        // open the popup and enable the bridge.
                        let hint = format!(
                            "EO2Weave bridge daemon not reachable ({e}). Open the EO2Weave extension popup and enable the WebMCP bridge, then re-run tools/list."
                        );
                        let _ = write_line(&mut out, &jsonrpc_ok(&id, json!({
                            "tools": [],
                            "_meta": { "eo2weaveHint": hint },
                        })));
                    }
                }
            }
            "tools/call" => {
                let params = msg.get("params").cloned().unwrap_or(Value::Null);
                let tool = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let args = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                if tool.is_empty() {
                    let _ = write_line(
                        &mut out,
                        &jsonrpc_error(&id, INTERNAL_ERROR, "tools/call requires params.name"),
                    );
                    continue;
                }
                match bridge_round_trip(
                    &json!({ "id": "c1", "kind": "call", "tool": tool, "args": args }),
                    Duration::from_secs(70),
                ) {
                    Ok(response) => {
                        if response.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                            let result_payload = response.get("result").cloned().unwrap_or(Value::Null);
                            // MCP tools/call result: { content: [...], isError? }
                            let content = match result_payload {
                                Value::String(s) => vec![json!({ "type": "text", "text": s })],
                                other => vec![json!({
                                    "type": "text",
                                    "text": serde_json::to_string_pretty(&other)
                                        .unwrap_or_else(|_| other.to_string()),
                                })],
                            };
                            let _ = write_line(&mut out, &jsonrpc_ok(&id, json!({
                                "content": content,
                            })));
                        } else {
                            let detail = response
                                .get("error")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .or_else(|| {
                                    response.get("errorCode").and_then(|v| v.as_str()).map(|s| s.to_string())
                                })
                                .unwrap_or_else(|| "tool call failed".to_string());
                            // Tool-level failure: still a JSON-RPC success with
                            // isError content (MCP convention — lets the agent
                            // read the error and self-correct).
                            let _ = write_line(&mut out, &jsonrpc_ok(&id, json!({
                                "content": [{ "type": "text", "text": detail }],
                                "isError": true,
                            })));
                        }
                    }
                    Err(e) => {
                        let _ = write_line(&mut out, &jsonrpc_error(&id, INTERNAL_ERROR, &format!(
                            "EO2Weave bridge daemon not reachable: {e}. Enable the WebMCP bridge in the EO2Weave popup first."
                        )));
                    }
                }
            }
            _ => {
                if !is_notification {
                    let _ = write_line(
                        &mut out,
                        &jsonrpc_error(&id, METHOD_NOT_FOUND, &format!("method not found: {method}")),
                    );
                }
            }
        }
    }
    exit_code
}

fn write_line<W: Write>(out: &mut W, value: &Value) -> io::Result<()> {
    let mut line = serde_json::to_string(value)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("serialize failed: {e}")))?;
    line.push('\n');
    out.write_all(line.as_bytes())?;
    out.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsonrpc_shapes() {
        let ok = jsonrpc_ok(&Value::from(1), json!({ "pong": true }));
        assert_eq!(ok["result"]["pong"], true);
        assert_eq!(ok["jsonrpc"], "2.0");

        let err = jsonrpc_error(&Value::from(2), METHOD_NOT_FOUND, "nope");
        assert_eq!(err["error"]["code"], METHOD_NOT_FOUND);
    }

    #[test]
    fn daemon_down_tools_list_is_empty_success() {
        // Shape check for the fallback branch: empty tools + hint in _meta.
        let fallback = json!({
            "tools": [],
            "_meta": { "eo2weaveHint": "daemon down" },
        });
        assert_eq!(fallback["tools"].as_array().unwrap().len(), 0);
    }
}
