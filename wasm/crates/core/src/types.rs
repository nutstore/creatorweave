//! Type definitions

use serde::{Deserialize, Serialize};

/// File entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// File name
    pub name: String,
    /// File path
    pub path: String,
    /// File size in bytes
    pub size: u64,
    /// File type (MIME type)
    pub file_type: Option<String>,
    /// Last modified timestamp
    pub last_modified: u64,
}

/// Analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    /// Total file count
    pub file_count: u64,
    /// Total directory count
    pub dir_count: u64,
    /// Total size in bytes
    pub total_size: u64,
    /// Average file size
    pub avg_file_size: f64,
    /// Largest file
    pub largest_file: Option<FileEntry>,
    /// File type distribution
    pub file_types: Vec<FileTypeStat>,
}

/// File type statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTypeStat {
    /// File extension
    pub extension: String,
    /// Count
    pub count: u64,
    /// Total size
    pub total_size: u64,
}
