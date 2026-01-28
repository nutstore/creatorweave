//! File analyzer WASM bindings
//!
//! Exports file analyzer interface to JavaScript

use browser_fs_analyzer_core::Accumulator;
use wasm_bindgen::prelude::*;

/// File analyzer
///
/// Maintains file size statistics and provides accumulation and query functions
#[wasm_bindgen]
pub struct FileAnalyzer {
    accumulator: Accumulator,
}

impl Default for FileAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl FileAnalyzer {
    /// Create a new file analyzer
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new() -> Self {
        Self {
            accumulator: Accumulator::new(),
        }
    }

    /// Add a single file size
    ///
    /// # Arguments
    /// * `size` - File size in bytes
    #[wasm_bindgen]
    pub fn add_file(&mut self, size: u64) {
        self.accumulator.add(size);
    }

    /// Add file sizes in batch
    ///
    /// # Arguments
    /// * `sizes` - Array of file sizes in bytes
    #[wasm_bindgen]
    pub fn add_files(&mut self, sizes: &[u64]) {
        self.accumulator.add_batch(sizes);
    }

    /// Get total size
    ///
    /// # Returns
    /// Total size in bytes
    #[wasm_bindgen]
    pub fn get_total(&self) -> u64 {
        self.accumulator.total()
    }

    /// Get file count
    ///
    /// # Returns
    /// File count
    #[wasm_bindgen]
    pub fn get_count(&self) -> u64 {
        self.accumulator.count()
    }

    /// Get average file size
    ///
    /// # Returns
    /// Average file size in bytes
    #[wasm_bindgen]
    pub fn get_average(&self) -> f64 {
        self.accumulator.average()
    }

    /// Reset analyzer state
    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.accumulator.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_analyzer() {
        let mut analyzer = FileAnalyzer::new();

        analyzer.add_file(1024);
        assert_eq!(analyzer.get_total(), 1024);
        assert_eq!(analyzer.get_count(), 1);

        analyzer.add_files(&[2048, 4096]);
        assert_eq!(analyzer.get_total(), 7168);
        assert_eq!(analyzer.get_count(), 3);

        analyzer.reset();
        assert_eq!(analyzer.get_total(), 0);
        assert_eq!(analyzer.get_count(), 0);
    }
}
