//! `remove_scope` — revoke an authorized directory.

use serde_json::{json, Value};

use crate::scope;

pub fn handle(request: &Value) -> Value {
    let scope_id = match request.get("scope_id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return json!({ "ok": false, "error": "missing scope_id" }),
    };

    match scope::remove_scope(scope_id) {
        Ok(removed) => json!({ "ok": true, "removed": removed }),
        Err(e) => json!({ "ok": false, "error": format!("failed to remove scope: {e}") }),
    }
}
