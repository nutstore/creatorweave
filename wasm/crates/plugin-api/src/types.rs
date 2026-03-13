//! Plugin API types for Phase 2 Dynamic Plugin System
//!
//! Defines all data structures used for plugin communication:
//! - Plugin metadata (PluginInfo)
//! - Plugin capabilities (PluginCapabilities)
//! - Resource limits (ResourceLimits)
//! - File I/O (FileInput, FileOutput)
//! - Results (PluginResult, ProcessingStatus)

use serde::{Deserialize, Serialize};

//=============================================================================
// Plugin Metadata
//=============================================================================

/// Information about a plugin, returned by `bfosa_plugin_info`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginInfo {
    /// Unique plugin identifier (e.g., "md5-calculator")
    pub id: String,

    /// Human-readable plugin name
    pub name: String,

    /// Plugin version (semver)
    pub version: String,

    /// Required CreatorWeave API version
    pub api_version: String,

    /// Short description of what the plugin does
    pub description: String,

    /// Plugin author/maintainer
    pub author: String,

    /// Plugin capabilities and requirements
    pub capabilities: PluginCapabilities,

    /// Resource limits requested by the plugin
    pub resource_limits: ResourceLimits,
}

/// What a plugin can do and what it needs
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginCapabilities {
    /// true = plugin only needs file metadata (name, size, type)
    /// false = plugin needs file content
    pub metadata_only: bool,

    /// true = plugin requires file content to be provided
    pub requires_content: bool,

    /// true = plugin supports chunked/streaming for large files
    pub supports_streaming: bool,

    /// Maximum file size plugin can handle (0 = unlimited)
    pub max_file_size: u64,

    /// File extensions this plugin handles (empty = all files)
    /// e.g., [".rs", ".ts", ".js"] for a code counter
    pub file_extensions: Vec<String>,
}

/// Resource limits to prevent plugin abuse
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResourceLimits {
    /// Maximum memory allocation in bytes
    pub max_memory: u64,

    /// Maximum execution time per file in milliseconds
    pub max_execution_time: u32,

    /// Number of Web Workers plugin requests (1 = single worker)
    pub worker_count: u32,
}

//=============================================================================
// File I/O Types
//=============================================================================

/// Input data passed from host to plugin for each file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInput {
    /// File name (e.g., "App.tsx")
    pub name: String,

    /// Full file path (e.g., "/project/src/App.tsx")
    pub path: String,

    /// File size in bytes
    pub size: u64,

    /// MIME type if available (e.g., "application/json")
    pub mime_type: Option<String>,

    /// Last modified timestamp (Unix milliseconds)
    pub last_modified: u64,

    /// File content as bytes (null if metadata_only=true)
    /// For large files with streaming, this may be chunked
    pub content: Option<Vec<u8>>,
}

/// Output data returned from plugin for each file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOutput {
    /// File path (matches input)
    pub path: String,

    /// Processing status
    pub status: ProcessingStatus,

    /// Plugin-specific result data (JSON object)
    /// Example for MD5: { "hash": "d41d8cd98f00b204..." }
    /// Example for line counter: { "code_lines": 100, "comment_lines": 20 }
    pub data: serde_json::Value,

    /// Error message if status is Error
    pub error: Option<String>,
}

/// Status of file processing
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProcessingStatus {
    /// File processed successfully
    #[serde(rename = "Success")]
    Success,

    /// File was skipped (e.g., wrong extension)
    #[serde(rename = "Skipped")]
    Skipped,

    /// File processing failed
    #[serde(rename = "Error")]
    Error,
}

//=============================================================================
// Result Aggregation
//=============================================================================

/// Final result returned by `bfosa_finalize`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginResult {
    /// Human-readable summary of results
    pub summary: String,

    /// Number of files successfully processed
    pub files_processed: u64,

    /// Number of files skipped
    pub files_skipped: u64,

    /// Number of files with errors
    pub files_with_errors: u64,

    /// Plugin-specific metrics (JSON object)
    /// Example: { "total_hashes": 10000, "unique_hashes": 9876 }
    pub metrics: serde_json::Value,

    /// Any warnings generated during processing
    pub warnings: Vec<String>,
}

//=============================================================================
// Plugin Validation
//=============================================================================

/// Result of plugin validation
#[derive(Debug, Clone)]
pub struct ValidationResult {
    /// Whether validation passed
    pub is_valid: bool,

    /// Validation errors (empty if valid)
    pub errors: Vec<String>,
}

impl ValidationResult {
    /// Create a successful validation result
    pub fn ok() -> Self {
        Self {
            is_valid: true,
            errors: Vec::new(),
        }
    }

    /// Create an error validation result
    pub fn error(message: String) -> Self {
        Self {
            is_valid: false,
            errors: vec![message],
        }
    }

    /// Create a warning validation result (valid but with warnings)
    pub fn warning(message: String) -> Self {
        Self {
            is_valid: true,
            errors: vec![format!("WARNING: {}", message)],
        }
    }
}

//=============================================================================
// Constants
//=============================================================================

/// Current CreatorWeave Plugin API version
pub const BFOSA_API_VERSION: &str = "2.0.0";

/// Default maximum memory limit (16 MB)
pub const DEFAULT_MAX_MEMORY: u64 = 16 * 1024 * 1024;

/// Default maximum execution time per file (5 seconds)
pub const DEFAULT_MAX_EXECUTION_TIME: u32 = 5000;

/// Maximum allowed memory limit (100 MB)
pub const MAX_ALLOWED_MEMORY: u64 = 100 * 1024 * 1024;

/// Maximum allowed execution time (60 seconds)
pub const MAX_ALLOWED_EXECUTION_TIME: u32 = 60_000;

//=============================================================================
// Tests
//=============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_processing_status_serialization() {
        // Ensure status enum serializes correctly
        let success = ProcessingStatus::Success;
        let json = serde_json::to_string(&success).unwrap();
        // serde_json serializes enum variants as strings with quotes
        assert!(json.contains("Success"));

        let skipped = ProcessingStatus::Skipped;
        let json = serde_json::to_string(&skipped).unwrap();
        assert!(json.contains("Skipped"));

        // Also test deserialization
        let deserialized: ProcessingStatus = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized, ProcessingStatus::Skipped));
    }

    #[test]
    fn test_file_input_serialization() {
        let input = FileInput {
            name: "test.txt".to_string(),
            path: "/path/test.txt".to_string(),
            size: 1024,
            mime_type: Some("text/plain".to_string()),
            last_modified: 1704067200000,
            content: None,
        };

        let json = serde_json::to_string(&input).unwrap();
        let deserialized: FileInput = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.name, input.name);
        assert_eq!(deserialized.path, input.path);
    }

    #[test]
    fn test_plugin_info_serialization() {
        let info = PluginInfo {
            id: "test-plugin".to_string(),
            name: "Test Plugin".to_string(),
            version: "1.0.0".to_string(),
            api_version: BFOSA_API_VERSION.to_string(),
            description: "A test plugin".to_string(),
            author: "CreatorWeave Team".to_string(),
            capabilities: PluginCapabilities {
                metadata_only: false,
                requires_content: true,
                supports_streaming: false,
                max_file_size: 10 * 1024 * 1024,
                file_extensions: vec![".txt".to_string(), ".md".to_string()],
            },
            resource_limits: ResourceLimits {
                max_memory: DEFAULT_MAX_MEMORY,
                max_execution_time: DEFAULT_MAX_EXECUTION_TIME,
                worker_count: 1,
            },
        };

        let json = serde_json::to_string(&info).unwrap();
        let deserialized: PluginInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, info.id);
        assert_eq!(deserialized.api_version, BFOSA_API_VERSION);
    }

    #[test]
    fn test_constants() {
        assert_eq!(BFOSA_API_VERSION, "2.0.0");
        assert_eq!(DEFAULT_MAX_MEMORY, 16 * 1024 * 1024);
        assert_eq!(DEFAULT_MAX_EXECUTION_TIME, 5000);
        assert_eq!(MAX_ALLOWED_MEMORY, 100 * 1024 * 1024);
        assert_eq!(MAX_ALLOWED_EXECUTION_TIME, 60_000);
    }
}
