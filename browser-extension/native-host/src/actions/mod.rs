//! Action dispatcher — routes incoming JSON requests to action handlers.

use serde_json::{json, Value};

use crate::scope;

mod check_policy;
mod delete_file;
mod exec_sync;
mod exec_list;
mod exec_logs;
mod exec_start;
mod exec_status;
mod exec_stop;
pub mod exec;
pub mod execpolicy;
mod get_execpolicy;
mod list_dir;
mod list_scopes;
mod pick_folder;
mod ping;
mod read_file;
mod read_file_at;
mod remove_scope;
mod set_execpolicy;
mod stat_file;
mod write_file;
mod write_file_at;
pub mod base64;

/// Dispatch a parsed JSON request to the appropriate action handler.
///
/// Request format: `{ "action": "<name>", ...params }`
/// Response format: `{ "ok": true, ...result }` or `{ "ok": false, "error": "..." }`
pub fn dispatch(request: &Value) -> Value {
    let action = request
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match action {
        "ping" => ping::handle(request),
        "list_scopes" => list_scopes::handle(request),
        "pick_folder" => pick_folder::handle(request),
        "remove_scope" => remove_scope::handle(request),
        "stat_file" => stat_file::handle(request),
        "list_dir" => list_dir::handle(request),
        "read_file" => read_file::handle(request),
        "read_file_at" => read_file_at::handle(request),
        "write_file" => write_file::handle(request),
        "write_file_at" => write_file_at::handle(request),
        "delete_file" => delete_file::handle(request),
        "check_policy" => check_policy::handle(request),
        "exec_sync" => exec_sync::handle(request),
        "exec_start" => exec_start::handle(request),
        "exec_logs" => exec_logs::handle(request),
        "exec_status" => exec_status::handle(request),
        "exec_stop" => exec_stop::handle(request),
        "exec_list" => exec_list::handle(request),
        "get_execpolicy" => get_execpolicy::handle(request),
        "set_execpolicy" => set_execpolicy::handle(request),
        _ => json!({ "ok": false, "error": format!("unknown action: {action}") }),
    }
}

// —— Helper utilities used by action modules ——

/// Extract `scope_id` and `relative_path` from the request, then resolve
/// to a safe absolute path. Returns `Err(json)` on failure for direct return.
pub(crate) fn resolve_path(request: &Value) -> Result<std::path::PathBuf, Value> {
    let scope_id = request
        .get("scope_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| json!({ "ok": false, "error": "missing scope_id" }))?;

    let relative_path = request
        .get("relative_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| json!({ "ok": false, "error": "missing relative_path" }))?;

    scope::resolve_safe_relative(scope_id, relative_path).map_err(|e| {
        json!({ "ok": false, "error": e })
    })
}
