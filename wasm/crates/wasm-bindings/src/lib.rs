//! Browser File System Analyzer - WASM Bindings
//!
//! Entry point for the WASM module, exporting Rust functionality to JavaScript.

use wasm_bindgen::prelude::*;

// Export core module types
pub use accumulator::FileAnalyzer;

mod accumulator;

// Initialize panic hook for better error messages in browser
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Utility function: Calculate the sum of file sizes
///
/// # Arguments
/// * `sizes` - Array of file sizes in bytes
///
/// # Returns
/// Total size in bytes
#[wasm_bindgen]
pub fn calculate_total_size(sizes: &[u64]) -> u64 {
    sizes.iter().sum()
}

/// Utility function: Calculate the average of file sizes
///
/// # Arguments
/// * `sizes` - Array of file sizes in bytes
///
/// # Returns
/// Average file size in bytes, or 0 if array is empty
#[wasm_bindgen]
pub fn calculate_average_size(sizes: &[u64]) -> f64 {
    if sizes.is_empty() {
        return 0.0;
    }
    let sum: u64 = sizes.iter().sum();
    sum as f64 / sizes.len() as f64
}
