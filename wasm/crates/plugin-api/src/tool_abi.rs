//! Tool ABI definitions for WASM Agent tools.
//!
//! Plugins that want to act as Agent tools must export these additional
//! functions alongside the standard plugin ABI.

//=============================================================================
// Tool Exports (optional, in addition to standard plugin exports)
//=============================================================================

/// Optional exports for Agent tool functionality.
/// Plugins that export these become available as Agent tools.
pub const TOOL_EXPORTS: &[&str] = &["get_tool_schema", "execute_tool"];

/// Export: Get tool schema definition
///
/// Returns a JSON-encoded `ToolSchema` describing the tool's
/// name, description, and parameters.
///
/// ```rust,ignore
/// #[wasm_bindgen]
/// pub fn get_tool_schema() -> String {
///     let schema = ToolSchemaBuilder::new("my_tool", "Does something useful")
///         .string_param("path", "File path", true)
///         .build();
///     serde_json::to_string(&schema).unwrap()
/// }
/// ```
///
/// # Returns
/// JSON string encoding a `ToolSchema`
pub const GET_TOOL_SCHEMA: &str = "get_tool_schema";

/// Export: Execute the tool with given input
///
/// Receives a JSON-encoded `ToolInput` and returns a JSON-encoded `ToolOutput`.
///
/// ```rust,ignore
/// #[wasm_bindgen]
/// pub fn execute_tool(input_json: String) -> String {
///     let input: ToolInput = serde_json::from_str(&input_json).unwrap();
///     // ... perform tool logic ...
///     let output = ToolOutput::ok("result".to_string());
///     serde_json::to_string(&output).unwrap()
/// }
/// ```
///
/// # Arguments
/// * `input_json` - JSON-encoded `ToolInput`
///
/// # Returns
/// JSON-encoded `ToolOutput`
pub const EXECUTE_TOOL: &str = "execute_tool";

//=============================================================================
// Host Imports for Tools (available to tool plugins)
//=============================================================================

/// Import: Read a file from the user's project directory
///
/// ```rust,ignore
/// extern "C" {
///     fn bfosa_read_file(path_ptr: u32, path_len: u32) -> u32;
/// }
/// ```
///
/// # Arguments
/// * Path string in WASM memory
///
/// # Returns
/// Pointer to JSON-encoded result: `{ "content": "...", "size": N }`
/// or `{ "error": "..." }` on failure
pub const BFOSA_READ_FILE: &str = "bfosa_read_file";

/// Import: Write a file to the user's project directory
///
/// ```rust,ignore
/// extern "C" {
///     fn bfosa_write_file(input_ptr: u32, input_len: u32) -> u32;
/// }
/// ```
///
/// # Arguments
/// * JSON-encoded `{ "path": "...", "content": "..." }` in WASM memory
///
/// # Returns
/// Pointer to JSON-encoded result: `{ "success": true }` or `{ "error": "..." }`
pub const BFOSA_WRITE_FILE: &str = "bfosa_write_file";

/// Import: List directory contents
///
/// ```rust,ignore
/// extern "C" {
///     fn bfosa_list_dir(path_ptr: u32, path_len: u32) -> u32;
/// }
/// ```
///
/// # Arguments
/// * Path string in WASM memory
///
/// # Returns
/// Pointer to JSON-encoded result: `{ "entries": [{ "name": "...", "type": "file"|"directory", "size": N }] }`
pub const BFOSA_LIST_DIR: &str = "bfosa_list_dir";

//=============================================================================
// Detection
//=============================================================================

/// Check if a WASM module exports are tool-capable.
///
/// A module is tool-capable if it exports both `get_tool_schema` and `execute_tool`.
pub fn is_tool_capable(export_names: &[&str]) -> bool {
    TOOL_EXPORTS.iter().all(|name| export_names.contains(name))
}

//=============================================================================
// Tests
//=============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_exports_defined() {
        assert_eq!(TOOL_EXPORTS.len(), 2);
        assert!(TOOL_EXPORTS.contains(&"get_tool_schema"));
        assert!(TOOL_EXPORTS.contains(&"execute_tool"));
    }

    #[test]
    fn test_is_tool_capable() {
        let exports = vec![
            "get_plugin_info",
            "process_file",
            "finalize",
            "cleanup",
            "get_tool_schema",
            "execute_tool",
        ];
        assert!(is_tool_capable(&exports));

        let no_tool = vec!["get_plugin_info", "process_file", "finalize", "cleanup"];
        assert!(!is_tool_capable(&no_tool));

        let partial = vec!["get_tool_schema"];
        assert!(!is_tool_capable(&partial));
    }

    #[test]
    fn test_host_import_names() {
        assert_eq!(BFOSA_READ_FILE, "bfosa_read_file");
        assert_eq!(BFOSA_WRITE_FILE, "bfosa_write_file");
        assert_eq!(BFOSA_LIST_DIR, "bfosa_list_dir");
    }
}
