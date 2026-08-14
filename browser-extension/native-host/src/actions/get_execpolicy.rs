//! `get_execpolicy` — return the current exec policy (stateless).
//!
//! Request: `{ "action": "get_execpolicy" }`
//! Response: `{ "ok": true, "policy": { rules: [...], default: "prompt" } }`

use serde_json::{json, Value};

use super::execpolicy;

pub fn handle(_request: &Value) -> Value {
    let policy = execpolicy::load_policy();
    // Serialize the policy — serde will produce { "rules": [...], "default": "..." }
    match serde_json::to_value(&policy) {
        Ok(policy_json) => json!({ "ok": true, "policy": policy_json }),
        Err(e) => json!({ "ok": false, "error": format!("failed to serialize policy: {e}") }),
    }
}
