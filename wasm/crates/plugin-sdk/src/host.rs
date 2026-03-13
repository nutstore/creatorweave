//! Host function wrappers for convenient access to CreatorWeave host imports.
//!
//! These functions wrap the raw host imports (bfosa_log, etc.)
//! into ergonomic Rust APIs.

use wasm_bindgen::prelude::*;

// ============================================================================
// Host imports available to plugins
// ============================================================================

#[wasm_bindgen]
extern "C" {
    /// Log a message to the browser console.
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

/// Log a message from the plugin.
///
/// # Example
/// ```rust,ignore
/// host::log_message("Processing file...");
/// ```
pub fn log_message(msg: &str) {
    log(msg);
}

/// Log a formatted message from the plugin.
///
/// # Example
/// ```rust,ignore
/// host::log_fmt(&format!("Processed {} files", count));
/// ```
pub fn log_fmt(msg: &str) {
    log(msg);
}
