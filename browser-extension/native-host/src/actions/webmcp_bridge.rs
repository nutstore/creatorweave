//! `webmcp_bridge` — streaming action that turns the native host into a
//! loopback TCP daemon bridging external CLI agents (Codex) to WebMCP tools
//! exposed in browser tabs.
//!
//! Lifecycle:
//!   1. Extension calls `connectNative` and sends
//!      `{ action: "webmcp_bridge", stream: true }`.
//!   2. Host binds 127.0.0.1:0 (OS-assigned port), writes a state file
//!      `~/.eo2weave/webmcp-bridge.json` (port/pid/binary path), and emits
//!      `{ type: "webmcp_bridge_ready", port, pid, binaryPath }` on the NM
//!      channel.
//!   3. Helper mode (`cw-native-host --mcp-stdio`, see mcp_stdio.rs) reads
//!      the state file, connects to the port, and relays MCP requests.
//!   4. Daemon forwards client requests to the extension as
//!      `{ type: "webmcp_bridge_request", reqId, kind, ... }` NM messages;
//!      the extension answers `{ type: "webmcp_bridge_response", reqId, ... }`.
//!   5. When the NM stdin closes (port disconnect / toggle off / browser
//!      exit), the daemon exits and removes the state file.
//!
//! Client wire protocol (TCP, newline-delimited JSON, one object per line):
//!   → {"id":"1","kind":"ping"}
//!   ← {"id":"1","ok":true,"pong":true}
//!   → {"id":"2","kind":"list"}
//!   ← {"id":"2","ok":true,"tools":[{name,description,inputSchema,...}]}
//!   → {"id":"3","kind":"call","tool":"<fullName>","args":{...}}
//!   ← {"id":"3","ok":true,"result":...} | {"id":"3","ok":false,"error":"..."}
//!
//! Threading model (no async runtime — keep the binary small):
//!   - main thread: owns stdin (NM responses) + the pending-request map
//!   - accept thread: spawns one reader+writer pair per TCP client
//!   - per client: reader thread (lines → NM requests) + writer thread
//!     (mpsc channel → socket lines)

use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use crate::nm;

/// Where the helper looks for the daemon's coordinates.
pub fn bridge_state_path() -> Option<PathBuf> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()?;
    if home.is_empty() {
        return None;
    }
    Some(PathBuf::from(home).join(".eo2weave").join("webmcp-bridge.json"))
}

fn write_bridge_state(port: u16, pid: u32) {
    let Some(path) = bridge_state_path() else {
        eprintln!("[cw-native-host] webmcp_bridge: no HOME, cannot write state file");
        return;
    };
    let binary_path = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let state = json!({
        "version": 1,
        "port": port,
        "pid": pid,
        "binaryPath": binary_path,
        "startedAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    });
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match serde_json::to_string_pretty(&state) {
        Ok(body) => {
            if let Err(e) = std::fs::write(&path, body) {
                eprintln!("[cw-native-host] webmcp_bridge: cannot write state file: {e}");
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
        }
        Err(e) => eprintln!("[cw-native-host] webmcp_bridge: state serialize failed: {e}"),
    }
}

fn remove_bridge_state() {
    if let Some(path) = bridge_state_path() {
        let _ = std::fs::remove_file(path);
    }
}

/// Shared daemon context handed to client threads.
struct BridgeCtx {
    /// NM stdout writer shared by all client reader threads.
    nm_writer: Arc<Mutex<io::Stdout>>,
    /// daemon reqId → (client response channel, client-original id)
    pending: Arc<Mutex<HashMap<String, (mpsc::Sender<Value>, String)>>>,
    /// Monotonic request counter for globally-unique reqIds.
    counter: Mutex<u64>,
}

impl BridgeCtx {
    fn next_req_id(&self, client_id: u64, client_msg: u64, original: &str) -> String {
        let mut guard = self.counter.lock().unwrap();
        *guard += 1;
        format!("b{}_c{}_m{}_{}", guard, client_id, client_msg, original)
    }

    fn send_nm(&self, value: &Value) -> bool {
        let mut writer = match self.nm_writer.lock() {
            Ok(w) => w,
            Err(_) => return false,
        };
        nm::write_message(&mut *writer, value).is_ok()
    }
}

/// Entry point for the streaming `webmcp_bridge` action.
/// Takes over the whole process: runs until NM stdin closes, then returns.
pub fn run(request: &Value) {
    let _ = request; // reserved for future options (e.g. fixed port)

    let pid = std::process::id();
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[cw-native-host] webmcp_bridge: bind failed: {e}");
            let mut out = io::stdout();
            let _ = nm::write_message(
                &mut out,
                &json!({ "type": "webmcp_bridge_error", "error": format!("bind failed: {e}") }),
            );
            return;
        }
    };
    let port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(_) => {
            eprintln!("[cw-native-host] webmcp_bridge: no local addr");
            return;
        }
    };

    write_bridge_state(port, pid);

    let ctx = Arc::new(BridgeCtx {
        nm_writer: Arc::new(Mutex::new(io::stdout())),
        pending: Arc::new(Mutex::new(HashMap::new())),
        counter: Mutex::new(0),
    });

    // Tell the extension the daemon is up (port + where our binary lives, so
    // the popup can render a ready-to-paste `codex mcp add` command).
    let binary_path = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    if !ctx.send_nm(&json!({
        "type": "webmcp_bridge_ready",
        "port": port,
        "pid": pid,
        "binaryPath": binary_path,
    })) {
        remove_bridge_state();
        return;
    }

    // Accept loop in a background thread; main thread keeps reading NM stdin.
    {
        let ctx = Arc::clone(&ctx);
        std::thread::spawn(move || {
            let mut next_client_id: u64 = 0;
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        next_client_id += 1;
                        let ctx = Arc::clone(&ctx);
                        std::thread::spawn(move || serve_client(stream, next_client_id, ctx));
                    }
                    Err(e) => {
                        eprintln!("[cw-native-host] webmcp_bridge: accept error: {e}");
                        break;
                    }
                }
            }
        });
    }

    // Main loop: NM responses from the extension.
    let mut stdin = io::stdin();
    loop {
        let msg = match nm::read_message(&mut stdin) {
            Ok(bytes) => bytes,
            Err(nm::NmError::Eof) => break,
            Err(nm::NmError::Io(_)) => break,
            Err(nm::NmError::TooLarge(n)) => {
                eprintln!("[cw-native-host] webmcp_bridge: NM message too large: {n}");
                continue;
            }
        };
        let value: Value = match serde_json::from_slice(&msg) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[cw-native-host] webmcp_bridge: invalid NM JSON: {e}");
                continue;
            }
        };
        match value.get("type").and_then(|v| v.as_str()).unwrap_or("") {
            "webmcp_bridge_response" => {
                let Some(req_id) = value.get("reqId").and_then(|v| v.as_str()) else {
                    continue;
                };
                let entry = ctx.pending.lock().unwrap().remove(req_id);
                let Some((client_tx, original_id)) = entry else {
                    continue; // client gone — drop silently
                };
                // Strip the daemon envelope, restore the client's own id.
                let mut payload = value.clone();
                if let Some(obj) = payload.as_object_mut() {
                    obj.remove("type");
                    obj.remove("reqId");
                    obj.insert("id".into(), Value::String(original_id));
                }
                let _ = client_tx.send(payload);
            }
            "webmcp_bridge_ping" => {
                let _ = ctx.send_nm(&json!({ "type": "webmcp_bridge_pong" }));
            }
            _ => {
                // Unknown NM message — ignore (forward compatibility).
            }
        }
    }

    remove_bridge_state();
    // Process exit closes the listener + all client sockets.
}

/// Serve one TCP client: reader thread + writer thread around one socket.
fn serve_client(stream: TcpStream, client_id: u64, ctx: Arc<BridgeCtx>) {
    let read_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[cw-native-host] webmcp_bridge: client clone failed: {e}");
            return;
        }
    };
    let write_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[cw-native-host] webmcp_bridge: client clone failed: {e}");
            return;
        }
    };

    let (tx, rx) = mpsc::channel::<Value>();

    // Writer: channel → socket lines.
    std::thread::spawn(move || {
        let mut out = write_stream;
        for value in rx {
            let mut line = match serde_json::to_string(&value) {
                Ok(s) => s,
                Err(_) => continue,
            };
            line.push('\n');
            if out.write_all(line.as_bytes()).is_err() || out.flush().is_err() {
                break;
            }
        }
    });

    // Reader (this thread): socket lines → NM requests / local replies.
    let mut reader = BufReader::new(read_stream);
    let mut msg_seq: u64 = 0;
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break, // client closed
            Ok(_) => {}
            Err(_) => break,
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let _ = tx.send(json!({
                    "id": Value::Null,
                    "ok": false,
                    "error": format!("invalid JSON line: {e}"),
                }));
                continue;
            }
        };
        let original_id = value
            .get("id")
            .cloned()
            .unwrap_or(Value::Null);
        let kind = value.get("kind").and_then(|v| v.as_str()).unwrap_or("");

        if kind == "ping" {
            // Answer locally — health check without an extension round-trip.
            let _ = tx.send(json!({ "id": original_id, "ok": true, "pong": true }));
            continue;
        }
        if kind != "list" && kind != "call" {
            let _ = tx.send(json!({
                "id": original_id,
                "ok": false,
                "error": format!("unknown kind: {kind}"),
            }));
            continue;
        }

        msg_seq += 1;
        let req_id = ctx.next_req_id(
            client_id,
            msg_seq,
            match original_id.as_str() {
                Some(s) => s,
                None => "-",
            },
        );

        // Register before sending so a fast response cannot race us.
        {
            let mut pending = ctx.pending.lock().unwrap();
            pending.insert(req_id.clone(), (tx.clone(), original_id.to_string()));
        }

        let mut nm_request = json!({
            "type": "webmcp_bridge_request",
            "reqId": req_id,
            "kind": kind,
        });
        if let Some(obj) = nm_request.as_object_mut() {
            if kind == "call" {
                if let Some(tool) = value.get("tool").and_then(|v| v.as_str()) {
                    obj.insert("tool".into(), Value::String(tool.to_string()));
                }
                if let Some(args) = value.get("args") {
                    if args.is_object() {
                        obj.insert("args".into(), args.clone());
                    }
                }
            }
        }
        if !ctx.send_nm(&nm_request) {
            // NM channel is dead — fail everything and stop reading.
            ctx.pending.lock().unwrap().remove(
                nm_request
                    .get("reqId")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            );
            let _ = tx.send(json!({
                "id": original_id,
                "ok": false,
                "error": "bridge daemon lost connection to the browser extension",
            }));
            break;
        }
    }
    // Drop remaining pending entries owned by this client so responses
    // arriving after disconnect are cleaned up on lookup-miss.
    drop(tx);
}

/// Test helper: parse a state-file body into (port, pid).
#[cfg(test)]
pub(crate) fn parse_state_body(body: &str) -> Option<(u16, u32)> {
    let value: Value = serde_json::from_str(body).ok()?;
    let port = value.get("port").and_then(|v| v.as_u64())? as u16;
    let pid = value.get("pid").and_then(|v| v.as_u64())? as u32;
    Some((port, pid))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_state_body_round_trip() {
        let body = serde_json::to_string(&json!({
            "version": 1,
            "port": 54321,
            "pid": 999,
            "binaryPath": "/usr/local/bin/cw-native-host",
            "startedAt": 1700000000000u64,
        }))
        .unwrap();
        assert_eq!(parse_state_body(&body), Some((54321, 999)));
        assert_eq!(parse_state_body("not json"), None);
        assert_eq!(parse_state_body("{\"port\": 1}"), None);
    }
}
