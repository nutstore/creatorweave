//! Line Counter Plugin
//!
//! This plugin counts lines, characters, and blank lines in text files.
//! Uses wasm-bindgen automatic type conversion for safer memory management.

use serde::{Deserialize, Serialize};
use serde_json::json;
use wasm_bindgen::prelude::*;

// =============================================================================
// Types (local to avoid complex dependencies)
// =============================================================================

/// Plugin metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub api_version: String,
    pub description: String,
    pub author: String,
    #[serde(default)]
    pub capabilities: PluginCapabilities,
    #[serde(default)]
    pub resource_limits: ResourceLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginCapabilities {
    #[serde(default)]
    pub metadata_only: bool,
    #[serde(default)]
    pub requires_content: bool,
    #[serde(default)]
    pub supports_streaming: bool,
    #[serde(default)]
    pub max_file_size: u64,
    #[serde(default)]
    pub file_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResourceLimits {
    #[serde(default)]
    pub max_memory: u64,
    #[serde(default)]
    pub max_execution_time: u64,
    #[serde(default)]
    pub worker_count: u32,
}

/// Input data for a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInput {
    pub name: String,
    pub path: String,
    pub size: u64,
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
    #[serde(rename = "lastModified")]
    pub last_modified: u64,
    pub content: Option<Vec<u8>>,
}

/// Output result for a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOutput {
    pub path: String,
    pub status: String, // "Success", "Skipped", "Error"
    pub data: serde_json::Value,
    #[serde(default)]
    pub error: Option<String>,
}

/// Final plugin result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginResult {
    #[serde(rename = "filesProcessed")]
    pub files_processed: u64,
    #[serde(rename = "filesSkipped")]
    pub files_skipped: u64,
    #[serde(rename = "filesWithErrors")]
    pub files_with_errors: u64,
    pub summary: String,
    pub metrics: serde_json::Value,
    pub warnings: Vec<String>,
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/// Get plugin metadata - returns JSON string
#[wasm_bindgen]
pub fn get_plugin_info() -> String {
    let info = PluginInfo {
        id: "line-counter".to_string(),
        name: "Line Counter".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        api_version: "2.0.0".to_string(),
        description: "Count lines and characters in text files".to_string(),
        author: "CreatorWeave Team".to_string(),
        capabilities: PluginCapabilities {
            metadata_only: false,
            requires_content: true,
            supports_streaming: true,
            max_file_size: 50 * 1024 * 1024,
            file_extensions: vec![
                ".txt", ".md", ".js", ".ts", ".jsx", ".tsx", ".rs", ".go", ".py", ".java", ".c",
                ".cpp", ".h", ".hpp",
            ]
            .into_iter()
            .map(|s| s.to_string())
            .collect(),
        },
        resource_limits: ResourceLimits {
            max_memory: 8 * 1024 * 1024,
            max_execution_time: 10000,
            worker_count: 1,
        },
    };
    serde_json::to_string(&info).unwrap_or_default()
}

/// Process a file - receives JSON string, returns JSON string
/// Using String types lets wasm-bindgen handle memory automatically
#[wasm_bindgen]
pub fn process_file(input_json: String) -> String {
    // Parse input
    let file_input: FileInput = match serde_json::from_str(&input_json) {
        Ok(input) => input,
        Err(e) => {
            let error_output = FileOutput {
                path: "unknown".to_string(),
                status: "Error".to_string(),
                data: json!({}),
                error: Some(format!("JSON parse error: {}", e)),
            };
            return serde_json::to_string(&error_output).unwrap_or_default();
        }
    };

    // Get content and count lines
    let content_bytes = file_input.content.unwrap_or_default();
    let content = String::from_utf8_lossy(&content_bytes);

    let mut total_lines = 0;
    let mut blank_lines = 0;
    let mut chars_no_spaces = 0;
    let chars_with_spaces = content.chars().count();

    for line in content.lines() {
        total_lines += 1;
        if line.trim().is_empty() {
            blank_lines += 1;
        }
        for c in line.chars() {
            if !c.is_whitespace() {
                chars_no_spaces += 1;
            }
        }
    }

    let non_blank_lines = total_lines - blank_lines;

    // Create output
    let output = FileOutput {
        path: file_input.path,
        status: "Success".to_string(),
        data: json!({
            "totalLines": total_lines,
            "blankLines": blank_lines,
            "nonBlankLines": non_blank_lines,
            "charsWithSpaces": chars_with_spaces,
            "charsNoSpaces": chars_no_spaces,
            "fileName": file_input.name,
            "fileSize": file_input.size,
        }),
        error: None,
    };

    serde_json::to_string(&output).unwrap_or_default()
}

/// Finalize and aggregate results
#[wasm_bindgen]
pub fn finalize(outputs_json: String) -> String {
    let outputs: Vec<FileOutput> = match serde_json::from_str(&outputs_json) {
        Ok(o) => o,
        Err(e) => {
            let error_result = PluginResult {
                files_processed: 0,
                files_skipped: 0,
                files_with_errors: 1,
                summary: format!("JSON parse error: {}", e),
                metrics: json!({}),
                warnings: vec![],
            };
            return serde_json::to_string(&error_result).unwrap_or_default();
        }
    };

    // Aggregate counts
    let mut total_lines = 0;
    let mut total_blank = 0;
    let mut total_chars = 0;

    for output in &outputs {
        if output.status == "Success" {
            if let Some(data) = output.data.as_object() {
                total_lines += data.get("totalLines").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                total_blank += data.get("blankLines").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                total_chars += data
                    .get("charsWithSpaces")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
            }
        }
    }

    let result = PluginResult {
        files_processed: outputs.len() as u64,
        files_skipped: outputs.iter().filter(|o| o.status == "Skipped").count() as u64,
        files_with_errors: outputs.iter().filter(|o| o.status == "Error").count() as u64,
        summary: format!(
            "Counted {} lines across {} files",
            total_lines,
            outputs.len()
        ),
        metrics: json!({
            "total_lines": total_lines,
            "total_blank_lines": total_blank,
            "total_chars": total_chars,
            "total_files": outputs.len(),
        }),
        warnings: vec![],
    };

    serde_json::to_string(&result).unwrap_or_default()
}

/// Cleanup - no-op with wasm-bindgen automatic memory management
#[wasm_bindgen]
pub fn cleanup() {
    // wasm-bindgen handles memory automatically
}

/// Stream init - initialize streaming state
#[wasm_bindgen]
pub fn stream_init() {
    // Initialize streaming state if needed
}

/// Stream chunk - process a chunk during streaming
#[wasm_bindgen]
pub fn stream_chunk(_chunk_json: String) -> String {
    // For line counting, we don't need streaming for now
    // Return empty result
    "null".to_string()
}

/// Stream complete - finalize streaming
#[wasm_bindgen]
pub fn stream_complete() -> String {
    // Return empty result
    "null".to_string()
}
