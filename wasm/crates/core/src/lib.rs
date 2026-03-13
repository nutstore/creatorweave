//! CreatorWeave - Core Library
//!
//! Core computation logic library for the file system analyzer.
//! Provides pure Rust implementation with no WASM dependency.

mod accumulator;
mod stats;
mod types;

pub use accumulator::Accumulator;
pub use stats::{FileStats, SizeDistribution};
pub use types::{AnalysisResult, FileEntry};

/// Analyzer result type
pub type Result<T> = std::result::Result<T, Error>;

/// Analyzer errors
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_accumulator() {
        let mut acc = Accumulator::new();
        acc.add(1024);
        acc.add(2048);
        assert_eq!(acc.total(), 3072);
        assert_eq!(acc.count(), 2);
    }
}
