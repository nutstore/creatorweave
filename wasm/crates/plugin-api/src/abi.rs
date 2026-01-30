//! Plugin ABI (Application Binary Interface) definitions
//!
//! Defines the interface between host (browser) and plugin (WASM):
//! - Required exports that plugins must provide
//! - Optional exports for streaming large files
//! - Host imports available to plugins

//=============================================================================
// Required Plugin Exports
//=============================================================================

/// List of function names that MUST be exported by every plugin
pub const REQUIRED_EXPORTS: &[&str] = &[
    "bfosa_plugin_info",
    "bfosa_process_file",
    "bfosa_finalize",
    "bfosa_cleanup",
];

/// Export: Plugin metadata
///
/// Plugins must implement:
/// ```rust,ignore
/// #[no_mangle]
/// pub extern "C" fn bfosa_plugin_info() -> PluginInfo {
///     PluginInfo { ... }
/// }
/// ```
///
/// # Returns
/// Pointer to JSON-encoded `PluginInfo` in WASM memory
pub const BFOSA_PLUGIN_INFO: &str = "bfosa_plugin_info";

/// Export: Process a single file
///
/// Plugins must implement:
/// ```rust,ignore
/// #[no_mangle]
/// pub extern "C" fn bfosa_process_file(input_ptr: u32, input_len: u32) -> u32 {
///     // 1. Read FileInput from WASM memory at input_ptr
///     // 2. Process the file
///     // 3. Write FileOutput to WASM memory
///     // 4. Return pointer to output
/// }
/// ```
///
/// # Arguments
/// * `input_ptr` - Pointer to JSON-encoded `FileInput` in WASM memory
/// * `input_len` - Length of the input data
///
/// # Returns
/// Pointer to JSON-encoded `FileOutput` in WASM memory
pub const BFOSA_PROCESS_FILE: &str = "bfosa_process_file";

/// Export: Finalize and aggregate results
///
/// Called after all files have been processed.
///
/// ```rust,ignore
/// #[no_mangle]
/// pub extern "C" fn bfosa_finalize(outputs_ptr: u32, outputs_len: u32) -> u32 {
///     // 1. Read array of FileOutput from WASM memory
///     // 2. Aggregate results
///     // 3. Write PluginResult to WASM memory
///     // 4. Return pointer to result
/// }
/// ```
///
/// # Arguments
/// * `outputs_ptr` - Pointer to JSON-encoded array of `FileOutput`
/// * `outputs_len` - Length of the array
///
/// # Returns
/// Pointer to JSON-encoded `PluginResult` in WASM memory
pub const BFOSA_FINALIZE: &str = "bfosa_finalize";

/// Export: Cleanup resources
///
/// Called before plugin is unloaded.
///
/// ```rust,ignore
/// #[no_mangle]
/// pub extern "C" fn bfosa_cleanup() {
///     // Free any allocated memory
///     // Close any open resources
/// }
/// ```
pub const BFOSA_CLEANUP: &str = "bfosa_cleanup";

//=============================================================================
// Optional Tool Exports (Agent Tool ABI)
//=============================================================================

/// Optional exports for Agent tool functionality.
/// See `tool_abi` module for full documentation.
pub const OPTIONAL_TOOL_EXPORTS: &[&str] = &["get_tool_schema", "execute_tool"];

//=============================================================================
// Optional Streaming Exports
//=============================================================================

/// Optional exports for streaming large files
pub const OPTIONAL_STREAM_EXPORTS: &[&str] = &[
    "bfosa_init_file",
    "bfosa_process_chunk",
    "bfosa_finalize_file",
];

/// Export: Initialize streaming for a large file
///
/// ```rust,ignore
/// #[no_mangle]
/// pub extern "C" fn bfosa_init_file(input_ptr: u32, input_len: u32) -> u32 {
///     // Return a context handle for this file
/// }
/// ```
pub const BFOSA_INIT_FILE: &str = "bfosa_init_file";

/// Export: Process a chunk of file data
///
/// ```rust,ignore
/// #[no_mangle]
/// pub extern "C" fn bfosa_process_chunk(
///     ctx: u32,
///     chunk_ptr: u32,
///     chunk_len: u32,
///     offset: u64,
/// ) {
///     // Process chunk at given offset
/// }
/// ```
pub const BFOSA_PROCESS_CHUNK: &str = "bfosa_process_chunk";

/// Export: Finalize streaming for a file
///
/// ```rust,ignore
/// #[no_mangle]
/// pub extern "C" fn bfosa_finalize_file(ctx: u32) -> u32 {
///     // Return FileOutput for the completed file
/// }
/// ```
pub const BFOSA_FINALIZE_FILE: &str = "bfosa_finalize_file";

//=============================================================================
// Host Imports (available to plugins)
//=============================================================================

/// Import: Log a message from the plugin
///
/// Plugins can call:
/// ```rust
/// extern "C" {
///     fn bfosa_log(ptr: u32, len: u32);
/// }
/// ```
///
/// # Arguments
/// * `ptr` - Pointer to message string in WASM memory
/// * `len` - Length of the message
pub const BFOSA_LOG: &str = "bfosa_log";

/// Import: Get the host BFOSA API version
///
/// ```rust
/// extern "C" {
///     fn bfosa_get_version() -> u32;
/// }
/// ```
///
/// # Returns
/// API version as a number (e.g., 200 for "2.0.0")
pub const BFOSA_GET_VERSION: &str = "bfosa_get_version";

/// Import: Allocate memory in host for returning data
///
/// ```rust
/// extern "C" {
///     fn bfosa_allocate(size: u32) -> u32;
/// }
/// ```
///
/// # Arguments
/// * `size` - Number of bytes to allocate
///
/// # Returns
/// Pointer to allocated memory in WASM linear memory
pub const BFOSA_ALLOCATE: &str = "bfosa_allocate";

/// Import: Report processing progress
///
/// ```rust
/// extern "C" {
///     fn bfosa_report_progress(current: u32, total: u32);
/// }
/// ```
///
/// # Arguments
/// * `current` - Current progress (e.g., files processed)
/// * `total` - Total target (e.g., total files)
pub const BFOSA_REPORT_PROGRESS: &str = "bfosa_report_progress";

/// Import: Get current timestamp
///
/// ```rust
/// extern "C" {
///     fn bfosa_get_timestamp() -> u64;
/// }
/// ```
///
/// # Returns
/// Current Unix timestamp in milliseconds
pub const BFOSA_GET_TIMESTAMP: &str = "bfosa_get_timestamp";

//=============================================================================
// Suspicious Imports (blocked for security)
//=============================================================================

/// Imports that plugins are NOT allowed to use
/// These would give plugins access to browser/network APIs
pub const BLOCKED_IMPORTS: &[&str] = &[
    "fetch",
    "XMLHttpRequest",
    "fetch_wrap",
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "IndexedDB",
    "WebSocket",
    "WebRTC",
    "WebGL",
    "Canvas",
    "AudioContext",
    "MutationObserver",
    "IntersectionObserver",
    "ResizeObserver",
    "Performance",
    "navigator",
    "location",
    "history",
];

//=============================================================================
// ABI Version
//=============================================================================

/// Current Plugin API version
pub const PLUGIN_API_VERSION: &str = "2.0.0";

/// Convert version string to comparable number
/// Example: "2.0.0" -> 20000
pub fn version_to_number(version: &str) -> Result<u32, String> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() < 2 {
        return Err(format!("Invalid version format: {}", version));
    }

    let major: u32 = parts[0]
        .parse()
        .map_err(|_| format!("Invalid major version: {}", parts[0]))?;
    let minor: u32 = parts[1]
        .parse()
        .map_err(|_| format!("Invalid minor version: {}", parts[1]))?;

    Ok(major * 10000 + minor * 100)
}

/// Check if plugin version is compatible with host
pub fn is_version_compatible(plugin_version: &str, host_version: &str) -> bool {
    let plugin_num = version_to_number(plugin_version).unwrap_or(0);
    let host_num = version_to_number(host_version).unwrap_or(0);

    // Compatible if major version matches
    (plugin_num / 10000) == (host_num / 10000)
}

//=============================================================================
// Tests
//=============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(clippy::const_is_empty)]
    fn test_required_exports_defined() {
        assert!(!REQUIRED_EXPORTS.is_empty());
        assert_eq!(REQUIRED_EXPORTS.len(), 4);
        assert!(REQUIRED_EXPORTS.contains(&"bfosa_plugin_info"));
        assert!(REQUIRED_EXPORTS.contains(&"bfosa_process_file"));
        assert!(REQUIRED_EXPORTS.contains(&"bfosa_finalize"));
        assert!(REQUIRED_EXPORTS.contains(&"bfosa_cleanup"));
    }

    #[test]
    fn test_version_conversion() {
        assert_eq!(version_to_number("2.0.0").unwrap(), 20000);
        assert_eq!(version_to_number("1.5.0").unwrap(), 10500);
        assert_eq!(version_to_number("0.1.0").unwrap(), 100);
    }

    #[test]
    fn test_version_compatibility() {
        // Same major version = compatible
        assert!(is_version_compatible("2.0.0", "2.1.0"));
        assert!(is_version_compatible("2.5.0", "2.0.0"));

        // Different major version = incompatible
        assert!(!is_version_compatible("3.0.0", "2.0.0"));
        assert!(!is_version_compatible("1.0.0", "2.0.0"));
    }

    #[test]
    fn test_blocked_imports_defined() {
        assert!(BLOCKED_IMPORTS.contains(&"fetch"));
        assert!(BLOCKED_IMPORTS.contains(&"XMLHttpRequest"));
        assert!(BLOCKED_IMPORTS.contains(&"window"));
        assert!(BLOCKED_IMPORTS.contains(&"document"));
    }

    #[test]
    fn test_optional_stream_exports() {
        assert_eq!(OPTIONAL_STREAM_EXPORTS.len(), 3);
        assert!(OPTIONAL_STREAM_EXPORTS.contains(&"bfosa_init_file"));
        assert!(OPTIONAL_STREAM_EXPORTS.contains(&"bfosa_process_chunk"));
        assert!(OPTIONAL_STREAM_EXPORTS.contains(&"bfosa_finalize_file"));
    }
}
