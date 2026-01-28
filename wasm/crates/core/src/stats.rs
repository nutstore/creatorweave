//! Statistical computations

/// File statistics
#[derive(Debug, Clone, Default)]
pub struct FileStats {
    /// Total file count
    pub file_count: u64,
    /// Total directory count
    pub dir_count: u64,
    /// Total size
    pub total_size: u64,
}

/// Size distribution
#[derive(Debug, Clone, Default)]
pub struct SizeDistribution {
    /// Small files (< 1MB)
    pub small: u64,
    /// Medium files (1MB - 100MB)
    pub medium: u64,
    /// Large files (> 100MB)
    pub large: u64,
}

impl SizeDistribution {
    /// Create a new distribution
    #[must_use]
    pub const fn new() -> Self {
        Self {
            small: 0,
            medium: 0,
            large: 0,
        }
    }

    /// Add a file size
    pub fn add(&mut self, size: u64) {
        const MB: u64 = 1024 * 1024;

        if size < MB {
            self.small += 1;
        } else if size < 100 * MB {
            self.medium += 1;
        } else {
            self.large += 1;
        }
    }

    /// Add file sizes in batch
    pub fn add_batch(&mut self, sizes: &[u64]) {
        for &size in sizes {
            self.add(size);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_size_distribution() {
        let mut dist = SizeDistribution::new();

        dist.add(512 * 1024); // 512KB - small
        dist.add(5 * 1024 * 1024); // 5MB - medium
        dist.add(200 * 1024 * 1024); // 200MB - large

        assert_eq!(dist.small, 1);
        assert_eq!(dist.medium, 1);
        assert_eq!(dist.large, 1);
    }

    #[test]
    fn test_add_batch() {
        let mut dist = SizeDistribution::new();
        dist.add_batch(&[512 * 1024, 256 * 1024]); // 2 small files

        assert_eq!(dist.small, 2);
    }
}
