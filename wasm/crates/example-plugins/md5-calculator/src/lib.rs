//! MD5 Calculator Plugin
//!
//! This plugin calculates MD5 hashes for files.
//! Uses wasm-bindgen automatic type conversion for safer memory management.

use hex::encode;
use md5::{Digest, Md5};
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
        id: "md5-calculator".to_string(),
        name: "MD5 Calculator".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        api_version: "2.0.0".to_string(),
        description: "Calculate MD5 hash of files".to_string(),
        author: "CreatorWeave Team".to_string(),
        capabilities: PluginCapabilities {
            metadata_only: false,
            requires_content: true,
            supports_streaming: false,
            max_file_size: 100 * 1024 * 1024, // 100MB
            file_extensions: vec!["*".to_string()],
        },
        resource_limits: ResourceLimits {
            max_memory: 16 * 1024 * 1024,
            max_execution_time: 30000,
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

    // Calculate MD5
    let content = file_input.content.unwrap_or_default();
    let mut hasher = Md5::new();
    hasher.update(&content);
    let result = hasher.finalize();
    let md5_hex = encode(result);

    // Create output
    let output = FileOutput {
        path: file_input.path,
        status: "Success".to_string(),
        data: json!({
            "md5": md5_hex,
            "algorithm": "MD5",
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

    let result = PluginResult {
        files_processed: outputs.len() as u64,
        files_skipped: outputs.iter().filter(|o| o.status == "Skipped").count() as u64,
        files_with_errors: outputs.iter().filter(|o| o.status == "Error").count() as u64,
        summary: format!("Calculated {} MD5 hashes", outputs.len()),
        metrics: json!({
            "total_files": outputs.len(),
            "algorithm": "MD5",
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
    // For MD5, we don't need streaming for now
    // Return empty result
    "null".to_string()
}

/// Stream complete - finalize streaming
#[wasm_bindgen]
pub fn stream_complete() -> String {
    // Return empty result
    "null".to_string()
}
