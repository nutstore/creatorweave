//! BFOSA Plugin SDK — Template for building plugins and Agent tools.
//!
//! This crate provides a complete template for creating WASM plugins
//! that work with the Browser File System Analyzer.
//!
//! # Features
//!
//! - **File Analysis Plugin**: Implement `process_file` to analyze files
//! - **Agent Tool**: Implement `get_tool_schema` + `execute_tool` to act as an AI tool
//! - **Host Functions**: Access browser APIs via the `host` module
//!
//! # Quick Start
//!
//! 1. Copy this crate as your project base
//! 2. Update `Cargo.toml` with your plugin name
//! 3. Implement the required exports below
//! 4. Build with `wasm-pack build --target web`
//!
//! # Example: File Analysis Plugin
//!
//! ```rust,ignore
//! use browser_fs_analyzer_plugin_api::prelude::*;
//!
//! #[wasm_bindgen]
//! pub fn get_plugin_info() -> String {
//!     serde_json::json!({
//!         "id": "my-analyzer",
//!         "name": "My File Analyzer",
//!         // ... see below for full example
//!     }).to_string()
//! }
//! ```
//!
//! # Example: Agent Tool
//!
//! ```rust,ignore
//! use browser_fs_analyzer_plugin_api::prelude::*;
//!
//! #[wasm_bindgen]
//! pub fn get_tool_schema() -> String {
//!     let schema = ToolSchemaBuilder::new("my_tool", "Does something useful")
//!         .string_param("input", "Input text", true)
//!         .build();
//!     serde_json::to_string(&schema).unwrap()
//! }
//! ```

pub mod host;

// Re-export the plugin API for convenience
pub use browser_fs_analyzer_plugin_api as api;
pub use browser_fs_analyzer_plugin_api::prelude::*;

use serde_json::json;
use wasm_bindgen::prelude::*;

// ============================================================================
// Required Plugin Exports
// ============================================================================

/// Return plugin metadata as JSON.
#[wasm_bindgen]
pub fn get_plugin_info() -> String {
    json!({
        "id": "plugin-sdk-template",
        "name": "Plugin SDK Template",
        "version": "0.1.0",
        "api_version": "2.0.0",
        "description": "A template plugin built with the BFOSA Plugin SDK",
        "author": "BFOSA Team",
        "capabilities": {
            "metadata_only": false,
            "requires_content": true,
            "supports_streaming": false,
            "max_file_size": 10_485_760u64,  // 10 MB
            "file_extensions": []             // all files
        },
        "resource_limits": {
            "max_memory": 16_777_216u64,      // 16 MB
            "max_execution_time": 5000u32,    // 5 seconds
            "worker_count": 1u32
        }
    })
    .to_string()
}

/// Process a single file.
#[wasm_bindgen]
pub fn process_file(input_json: String) -> String {
    let input: api::FileInput = match serde_json::from_str(&input_json) {
        Ok(v) => v,
        Err(e) => {
            return json!({
                "path": "unknown",
                "status": "Error",
                "data": {},
                "error": format!("Parse error: {}", e)
            })
            .to_string();
        }
    };

    host::log_fmt(&format!("Processing: {}", input.path));

    // --- Your file processing logic here ---
    let content_size = input.content.as_ref().map_or(0, |c| c.len());

    json!({
        "path": input.path,
        "status": "Success",
        "data": {
            "fileName": input.name,
            "fileSize": input.size,
            "contentSize": content_size
        }
    })
    .to_string()
}

/// Aggregate results after all files are processed.
#[wasm_bindgen]
pub fn finalize(outputs_json: String) -> String {
    let outputs: Vec<api::FileOutput> = match serde_json::from_str(&outputs_json) {
        Ok(v) => v,
        Err(e) => {
            return json!({
                "summary": format!("Finalize parse error: {}", e),
                "filesProcessed": 0,
                "filesSkipped": 0,
                "filesWithErrors": 0,
                "metrics": {},
                "warnings": []
            })
            .to_string();
        }
    };

    let processed = outputs
        .iter()
        .filter(|o| o.status == api::ProcessingStatus::Success)
        .count();
    let skipped = outputs
        .iter()
        .filter(|o| o.status == api::ProcessingStatus::Skipped)
        .count();
    let errors = outputs
        .iter()
        .filter(|o| o.status == api::ProcessingStatus::Error)
        .count();

    json!({
        "summary": format!("Processed {} files ({} skipped, {} errors)", processed, skipped, errors),
        "filesProcessed": processed,
        "filesSkipped": skipped,
        "filesWithErrors": errors,
        "metrics": {
            "totalFiles": outputs.len()
        },
        "warnings": []
    })
    .to_string()
}

/// Cleanup resources.
#[wasm_bindgen]
pub fn cleanup() {
    // No-op with wasm-bindgen — memory is managed automatically
}

// ============================================================================
// Optional: Agent Tool Exports
// ============================================================================

/// Return the tool schema for Agent integration.
///
/// Uncomment and customize to make this plugin available as an Agent tool.
#[wasm_bindgen]
pub fn get_tool_schema() -> String {
    let schema = api::ToolSchemaBuilder::new(
        "sdk_template_tool",
        "A template tool that demonstrates the BFOSA Tool ABI",
    )
    .string_param("message", "A message to echo back", true)
    .boolean_param("uppercase", "Convert to uppercase", false)
    .build();

    serde_json::to_string(&schema).unwrap()
}

/// Execute the tool with structured input.
#[wasm_bindgen]
pub fn execute_tool(input_json: String) -> String {
    let input: api::ToolInput = match serde_json::from_str(&input_json) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::to_string(&api::ToolOutput::err(format!("Parse error: {}", e)))
                .unwrap();
        }
    };

    let message = input
        .args
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("(empty)");
    let uppercase = input
        .args
        .get("uppercase")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let result = if uppercase {
        message.to_uppercase()
    } else {
        message.to_string()
    };

    serde_json::to_string(&api::ToolOutput::ok(result)).unwrap()
}
