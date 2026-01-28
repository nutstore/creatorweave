//! File size accumulator
//!
//! Accumulates file sizes and maintains statistical state.

/// File size accumulator
#[derive(Debug, Clone)]
pub struct Accumulator {
    /// Total size in bytes
    total: u64,
    /// File count
    count: u64,
}

impl Default for Accumulator {
    fn default() -> Self {
        Self::new()
    }
}

impl Accumulator {
    /// Create a new accumulator
    #[must_use]
    pub const fn new() -> Self {
        Self { total: 0, count: 0 }
    }

    /// Add a single file size
    pub fn add(&mut self, size: u64) {
        self.total += size;
        self.count += 1;
    }

    /// Add file sizes in batch
    pub fn add_batch(&mut self, sizes: &[u64]) {
        self.total += sizes.iter().sum::<u64>();
        self.count += sizes.len() as u64;
    }

    /// Get total size
    #[must_use]
    pub const fn total(&self) -> u64 {
        self.total
    }

    /// Get file count
    #[must_use]
    pub const fn count(&self) -> u64 {
        self.count
    }

    /// Get average file size
    #[must_use]
    pub fn average(&self) -> f64 {
        if self.count == 0 {
            return 0.0;
        }
        self.total as f64 / self.count as f64
    }

    /// Reset the accumulator
    pub fn reset(&mut self) {
        self.total = 0;
        self.count = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let acc = Accumulator::new();
        assert_eq!(acc.total(), 0);
        assert_eq!(acc.count(), 0);
    }

    #[test]
    fn test_add() {
        let mut acc = Accumulator::new();
        acc.add(100);
        assert_eq!(acc.total(), 100);
        assert_eq!(acc.count(), 1);

        acc.add(200);
        assert_eq!(acc.total(), 300);
        assert_eq!(acc.count(), 2);
    }

    #[test]
    fn test_add_batch() {
        let mut acc = Accumulator::new();
        acc.add_batch(&[100, 200, 300]);
        assert_eq!(acc.total(), 600);
        assert_eq!(acc.count(), 3);
    }

    #[test]
    fn test_average() {
        let mut acc = Accumulator::new();
        assert_eq!(acc.average(), 0.0);

        acc.add_batch(&[100, 200, 300]);
        assert!((acc.average() - 200.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_reset() {
        let mut acc = Accumulator::new();
        acc.add_batch(&[100, 200]);
        acc.reset();
        assert_eq!(acc.total(), 0);
        assert_eq!(acc.count(), 0);
    }
}
