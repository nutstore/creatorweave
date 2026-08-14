//! `list_scopes` — list all authorized directories.

use serde_json::{json, Value};

use crate::scope;

pub fn handle(_request: &Value) -> Value {
    let scopes = scope::load_scopes();
    let entries: Vec<Value> = scopes
        .scopes
        .iter()
        .map(|s| {
            json!({
                "scope_id": s.scope_id,
                "display_name": s.display_name,
            })
        })
        .collect();

    json!({ "ok": true, "scopes": entries })
}
