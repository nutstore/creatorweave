//! `check_policy` — query the execpolicy decision for a command (stateless).
//!
//! Allows the web layer to ask "would this command be auto/prompt/forbidden?"
//! without opening a streaming connection. Used for UI hints (e.g. showing
//! a lock icon for prompt commands before the user clicks run).

use serde_json::{json, Value};

use super::execpolicy;

pub fn handle(request: &Value) -> Value {
    let command: Vec<String> = match request.get("command").and_then(|v| v.as_array()) {
        Some(arr) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        None => return json!({ "ok": false, "error": "missing or invalid command array" }),
    };

    if command.is_empty() {
        return json!({ "ok": false, "error": "empty command array" });
    }

    let decision = execpolicy::check(&command);
    json!({
        "ok": true,
        "decision": decision.to_string(),
        "command": command,
    })
}
