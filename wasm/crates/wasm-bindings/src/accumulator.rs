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

    #[test]
    fn test_file_analyzer_default() {
        let analyzer = FileAnalyzer::default();
        assert_eq!(analyzer.get_total(), 0);
        assert_eq!(analyzer.get_count(), 0);
        assert_eq!(analyzer.get_average(), 0.0);
    }

    #[test]
    fn test_add_file_zero() {
        let mut analyzer = FileAnalyzer::new();
        analyzer.add_file(0);
        assert_eq!(analyzer.get_total(), 0);
        assert_eq!(analyzer.get_count(), 1);
        assert_eq!(analyzer.get_average(), 0.0);
    }

    #[test]
    fn test_add_file_large() {
        let mut analyzer = FileAnalyzer::new();
        let large_size = u64::MAX / 2;
        analyzer.add_file(large_size);
        assert_eq!(analyzer.get_total(), large_size);
        assert_eq!(analyzer.get_count(), 1);
        assert_eq!(analyzer.get_average(), large_size as f64);
    }

    #[test]
    fn test_add_files_empty() {
        let mut analyzer = FileAnalyzer::new();
        analyzer.add_files(&[]);
        assert_eq!(analyzer.get_total(), 0);
        assert_eq!(analyzer.get_count(), 0);
    }

    #[test]
    fn test_add_files_single() {
        let mut analyzer = FileAnalyzer::new();
        analyzer.add_files(&[42]);
        assert_eq!(analyzer.get_total(), 42);
        assert_eq!(analyzer.get_count(), 1);
    }

    #[test]
    fn test_add_files_batch() {
        let mut analyzer = FileAnalyzer::new();
        analyzer.add_files(&[1024, 2048, 4096, 8192]);
        assert_eq!(analyzer.get_total(), 15360);
        assert_eq!(analyzer.get_count(), 4);
        assert_eq!(analyzer.get_average(), 3840.0);
    }

    #[test]
    fn test_mixed_operations() {
        let mut analyzer = FileAnalyzer::new();

        // Single adds
        analyzer.add_file(100);
        analyzer.add_file(200);
        assert_eq!(analyzer.get_total(), 300);
        assert_eq!(analyzer.get_count(), 2);

        // Batch add
        analyzer.add_files(&[50, 150]);
        assert_eq!(analyzer.get_total(), 500);
        assert_eq!(analyzer.get_count(), 4);

        // More single adds
        analyzer.add_file(500);
        assert_eq!(analyzer.get_total(), 1000);
        assert_eq!(analyzer.get_count(), 5);

        // Verify average
        assert_eq!(analyzer.get_average(), 200.0);
    }

    #[test]
    fn test_reset_multiple_times() {
        let mut analyzer = FileAnalyzer::new();

        analyzer.add_files(&[1, 2, 3]);
        assert_eq!(analyzer.get_total(), 6);
        assert_eq!(analyzer.get_count(), 3);

        analyzer.reset();
        assert_eq!(analyzer.get_total(), 0);
        assert_eq!(analyzer.get_count(), 0);

        analyzer.add_files(&[10, 20]);
        assert_eq!(analyzer.get_total(), 30);
        assert_eq!(analyzer.get_count(), 2);

        analyzer.reset();
        assert_eq!(analyzer.get_total(), 0);
        assert_eq!(analyzer.get_count(), 0);
    }

    #[test]
    fn test_average_edge_cases() {
        let mut analyzer = FileAnalyzer::new();

        // Empty analyzer
        assert_eq!(analyzer.get_average(), 0.0);

        // Single file
        analyzer.add_file(1024);
        assert_eq!(analyzer.get_average(), 1024.0);

        // Multiple files with same size
        analyzer.add_files(&[1024, 1024, 1024]);
        assert_eq!(analyzer.get_average(), 1024.0);

        // Multiple files with different sizes
        analyzer.reset();
        analyzer.add_files(&[0, 1024, 2048]);
        assert_eq!(analyzer.get_average(), 1024.0);
    }

    #[test]
    fn test_large_batch_operations() {
        let mut analyzer = FileAnalyzer::new();
        let sizes: Vec<u64> = (1..=1000).map(|i| i * 1024).collect();
        let expected_total: u64 = (1..=1000).map(|i| i * 1024).sum();

        analyzer.add_files(&sizes);
        assert_eq!(analyzer.get_total(), expected_total);
        assert_eq!(analyzer.get_count(), 1000);
    }

    #[test]
    fn test_real_world_scenario() {
        let mut analyzer = FileAnalyzer::new();

        // Simulate analyzing a directory with various file sizes
        // Small files (1KB - 10KB)
        analyzer.add_files(&[1024, 2048, 4096, 8192, 10240]);

        // Medium files (100KB - 1MB)
        analyzer.add_files(&[102400, 256000, 512000, 1024000]);

        // Large files (10MB - 100MB)
        analyzer.add_files(&[10485760, 52428800, 104857600]);

        assert_eq!(analyzer.get_count(), 12);

        // Verify total is correct
        let expected_total: u64 = [
            1024, 2048, 4096, 8192, 10240, // Small files
            102400, 256000, 512000, 1024000, // Medium files
            10485760, 52428800, 104857600, // Large files
        ]
        .iter()
        .sum();

        assert_eq!(analyzer.get_total(), expected_total);

        // Verify average is reasonable
        let avg = analyzer.get_average();
        assert!(avg > 1000.0, "Average should be > 1KB");
        assert!(avg < 20000000.0, "Average should be < 20MB");
    }
}
