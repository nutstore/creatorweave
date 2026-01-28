//! Plugin API (Phase 2)
//!
//! Dynamic plugin system, allowing users to upload external WASM plugins
//! to extend analysis functionality.

#![allow(unused)] // Disable until Phase 2

/// Plugin trait definition
pub trait AnalyzerPlugin {
    /// Analyze file data
    fn analyze(&self, data: &[u8]) -> Result<AnalysisReport, String>;
}

/// Analysis report
pub struct AnalysisReport {
    pub summary: String,
    pub metrics: Vec<(String, f64)>,
}

// Phase 2: Implement dynamic plugin loader
