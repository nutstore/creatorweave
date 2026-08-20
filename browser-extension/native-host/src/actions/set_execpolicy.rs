//! `set_execpolicy` — write a new exec policy to disk (stateless).
//!
//! Request: `{ "action": "set_execpolicy", "policy": { rules: [...], default: "..." } }`
//! Response: `{ "ok": true }` or `{ "ok": false, "error": "..." }`
//!
//! The policy is validated before writing: invalid rules are rejected.

use serde_json::{json, Value};

use super::execpolicy;

pub fn handle(request: &Value) -> Value {
    let policy_value = match request.get("policy") {
        Some(v) => v,
        None => return json!({ "ok": false, "error": "missing policy field" }),
    };

    // Deserialize to validate structure
    let policy: execpolicy::Policy = match serde_json::from_value(policy_value.clone()) {
        Ok(p) => p,
        Err(e) => {
            return json!({
                "ok": false,
                "error": format!("invalid policy format: {e}")
            });
        }
    };

    // Basic validation: each rule must have a non-empty command
    for rule in &policy.rules {
        if rule.command.is_empty() {
            return json!({
                "ok": false,
                "error": "each rule must have a non-empty command"
            });
        }
    }

    // Write to disk
    let json_str = match serde_json::to_string_pretty(&policy) {
        Ok(s) => s,
        Err(e) => return json!({ "ok": false, "error": format!("serialization failed: {e}") }),
    };

    let path = execpolicy::policy_file_path();
    if let Err(e) = std::fs::create_dir_all(path.parent().unwrap_or(&path)) {
        return json!({ "ok": false, "error": format!("failed to create dir: {e}") });
    }

    if let Err(e) = std::fs::write(&path, &json_str) {
        return json!({ "ok": false, "error": format!("failed to write file: {e}") });
    }

    json!({ "ok": true })
}
