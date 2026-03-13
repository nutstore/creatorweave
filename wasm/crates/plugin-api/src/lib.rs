//! CreatorWeave - Plugin API (Phase 2)
//!
//! This crate defines the plugin ABI and types for the dynamic plugin system.
//! Plugins are WASM modules that implement the required exports and can be
//! loaded at runtime to extend file analysis functionality.
//!
//! # Plugin API v2.0.0 - String-based (wasm-bindgen)
//!
//! Plugins use **wasm-bindgen** with String types for automatic memory management.
//! This is safer and simpler than manual pointer management.
//!
//! ## Required Exports
//!
//! All plugins MUST export these functions (using `#[wasm_bindgen]`):
//!
//! - `get_plugin_info() -> String` - Returns plugin metadata as JSON
//! - `process_file(input_json: String) -> String` - Process a single file
//! - `finalize(outputs_json: String) -> String` - Aggregate results
//! - `cleanup()` - Cleanup resources (no-op with wasm-bindgen)
//!
//! ## Optional Streaming Exports
//!
//! - `stream_init()` - Initialize streaming session
//! - `stream_chunk(chunk_json: String) -> String` - Process a chunk
//! - `stream_complete() -> String` - Finalize streaming
//!
//! # Example Plugin
//!
//! ```rust,ignore
//! use wasm_bindgen::prelude::*;
//! use serde_json::json;
//!
//! #[wasm_bindgen]
//! pub fn get_plugin_info() -> String {
//!     let info = json!({
//!         "id": "my-plugin",
//!         "name": "My Plugin",
//!         "version": "1.0.0",
//!         "api_version": "2.0.0",
//!         "description": "Does something cool",
//!         "author": "Your Name",
//!         "capabilities": {
//!             "metadata_only": false,
//!             "requires_content": true,
//!             "supports_streaming": false,
//!             "max_file_size": 10485760,
//!             "file_extensions": [".txt", ".md"]
//!         },
//!         "resource_limits": {
//!             "max_memory": 16777216,
//!             "max_execution_time": 5000,
//!             "worker_count": 1
//!         }
//!     });
//!     info.to_string()
//! }
//!
//! #[wasm_bindgen]
//! pub fn process_file(input_json: String) -> String {
//!     // Parse input JSON
//!     let file_input: FileInput = match serde_json::from_str(&input_json) {
//!         Ok(input) => input,
//!         Err(e) => {
//!             return json!({
//!                 "path": "unknown",
//!                 "status": "Error",
//!                 "data": {},
//!                 "error": format!("JSON parse error: {}", e)
//!             }).to_string();
//!         }
//!     };
//!
//!     // Process file...
//!     let content = file_input.content.unwrap_or_default();
//!     // ... do something with content ...
//!
//!     // Return output as JSON string
//!     json!({
//!         "path": file_input.path,
//!         "status": "Success",
//!         "data": { "result": "some value" },
//!         "error": null
//!     }).to_string()
//! }
//!
//! #[wasm_bindgen]
//! pub fn finalize(outputs_json: String) -> String {
//!     let outputs: Vec<FileOutput> = serde_json::from_str(&outputs_json).unwrap();
//!     json!({
//!         "filesProcessed": outputs.len(),
//!         "filesSkipped": 0,
//!         "filesWithErrors": 0,
//!         "summary": format!("Processed {} files", outputs.len()),
//!         "metrics": {},
//!         "warnings": []
//!     }).to_string()
//! }
//!
//! #[wasm_bindgen]
//! pub fn cleanup() {
//!     // No-op: wasm-bindgen handles memory automatically
//! }
//! ```
//!
//! # Memory Management
//!
//! With wasm-bindgen String types:
//! - **Input strings**: Automatically converted from JavaScript to WASM
//! - **Output strings**: Automatically converted from WASM to JavaScript
//! - **No manual allocation**: No need for `allocate_array()` or similar
//! - **No manual cleanup**: Memory is freed automatically after function returns
//!
//! # Type Definitions
//!
//! See the `types` module for complete type definitions.
//! All types use `#[serde(rename_all = "camelCase")]` for JavaScript compatibility.

// Core types for plugin communication
pub mod types;

// Plugin validation logic
pub mod validator;

// Security validation module
pub mod security;

// ABI constants
pub mod abi;

// Tool ABI (Agent tool interface)
pub mod tool_abi;

// Tool types (schema, input, output)
pub mod tool_types;

// Prelude module for convenient imports
pub mod prelude {
    // Re-export all types
    pub use crate::types::{
        FileInput, FileOutput, PluginCapabilities, PluginInfo, PluginResult, ProcessingStatus,
        ResourceLimits, ValidationResult, BFOSA_API_VERSION, DEFAULT_MAX_EXECUTION_TIME,
        DEFAULT_MAX_MEMORY,
    };

    // Re-export tool types
    pub use crate::tool_types::{
        ToolInput, ToolOutput, ToolParameterSchema, ToolSchema, ToolSchemaBuilder,
        ToolSchemaProperty,
    };
}

// Re-export commonly used types at crate root
pub use types::{
    FileInput, FileOutput, PluginCapabilities, PluginInfo, PluginResult, ProcessingStatus,
    ResourceLimits, ValidationResult,
};

pub use validator::{PluginValidator, RuntimeValidator};

// Tool types re-exports
pub use tool_types::{ToolInput, ToolOutput, ToolSchema, ToolSchemaBuilder};

// Current API version
pub use types::{BFOSA_API_VERSION, DEFAULT_MAX_EXECUTION_TIME, DEFAULT_MAX_MEMORY};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_version_constant() {
        assert_eq!(BFOSA_API_VERSION, "2.0.0");
    }

    #[test]
    fn test_default_limits() {
        assert_eq!(DEFAULT_MAX_MEMORY, 16 * 1024 * 1024); // 16 MB
        assert_eq!(DEFAULT_MAX_EXECUTION_TIME, 5000); // 5000 ms
    }

    #[test]
    fn test_reexports() {
        // Verify that common types are accessible at crate root
        let _info = PluginInfo {
            id: "test".to_string(),
            name: "Test".to_string(),
            version: "1.0.0".to_string(),
            api_version: BFOSA_API_VERSION.to_string(),
            description: "Test".to_string(),
            author: "Test".to_string(),
            capabilities: PluginCapabilities {
                metadata_only: true,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: vec![],
            },
            resource_limits: ResourceLimits {
                max_memory: DEFAULT_MAX_MEMORY,
                max_execution_time: DEFAULT_MAX_EXECUTION_TIME,
                worker_count: 1,
            },
        };

        assert_eq!(_info.id, "test");
    }
}
