//! `ping` — link self-test. Returns host version.

use serde_json::{json, Value};

pub fn handle(_request: &Value) -> Value {
    json!({
        "ok": true,
        "pong": true,
        "version": env!("CARGO_PKG_VERSION"),
    })
}
