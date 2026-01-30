//! Security validation tests for WASM plugins
//!
//! These tests verify that the security validator properly:
//! - Rejects oversized plugins
//! - Detects dangerous imports
//! - Enforces memory limits
//! - Validates allowed imports

use browser_fs_analyzer_plugin_api::security::{MemoryUsage, SecurityValidator, TimeoutEnforcer};

//=============================================================================
// Size Validation Tests
//=============================================================================

#[test]
fn test_reject_oversized_plugin() {
    let validator = SecurityValidator::new();
    let oversized = vec![0u8; 11 * 1024 * 1024]; // 11MB
    let result = validator.check_size(&oversized);
    assert!(!result.is_valid);
}

#[test]
fn test_accept_normal_sized_plugin() {
    let validator = SecurityValidator::new();
    let normal = vec![0u8; 1024 * 1024]; // 1MB
    let result = validator.check_size(&normal);
    assert!(result.is_valid);
}

#[test]
fn test_custom_max_size() {
    let validator = SecurityValidator::with_max_size(2048);
    let valid = vec![0u8; 1024];
    let invalid = vec![0u8; 4096];

    assert!(validator.check_size(&valid).is_valid);
    assert!(!validator.check_size(&invalid).is_valid);
}

#[test]
fn test_max_size_property() {
    let validator = SecurityValidator::new();
    assert_eq!(validator.max_size(), 10 * 1024 * 1024);
}

//=============================================================================
// Dangerous Import Detection Tests
//=============================================================================

#[test]
fn test_detect_eval_import() {
    let validator = SecurityValidator::new();
    // Create WASM with "eval" string embedded
    let mut wasm_with_eval = vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];
    wasm_with_eval.extend_from_slice(b"eval");
    let result = validator.check_dangerous_imports(&wasm_with_eval);
    assert!(!result.is_valid);
}

#[test]
fn test_detect_fetch_import() {
    let validator = SecurityValidator::new();
    let mut wasm_with_fetch = vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];
    wasm_with_fetch.extend_from_slice(b"fetch");
    let result = validator.check_dangerous_imports(&wasm_with_fetch);
    assert!(!result.is_valid);
}

#[test]
fn test_detect_syscall_import() {
    let validator = SecurityValidator::new();
    let mut wasm_with_syscall = vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];
    wasm_with_syscall.extend_from_slice(b"syscall");
    let result = validator.check_dangerous_imports(&wasm_with_syscall);
    assert!(!result.is_valid);
}

#[test]
fn test_clean_wasm_passes_dangerous_check() {
    let validator = SecurityValidator::new();
    let clean_wasm = vec![
        0x00, 0x61, 0x73, 0x6D, // Magic number
        0x01, 0x00, 0x00, 0x00, // Version
    ];
    let result = validator.check_dangerous_imports(&clean_wasm);
    assert!(result.is_valid);
}

//=============================================================================
// Allowed Import Tests
//=============================================================================

#[test]
fn test_bfosa_imports_allowed() {
    let validator = SecurityValidator::new();
    assert!(validator.is_import_allowed("bfosa_log"));
    assert!(validator.is_import_allowed("bfosa_get_version"));
    assert!(validator.is_import_allowed("bfosa_allocate"));
    assert!(validator.is_import_allowed("bfosa_report_progress"));
    assert!(validator.is_import_allowed("bfosa_stream_chunk"));
    assert!(validator.is_import_allowed("bfosa_stream_complete"));
}

#[test]
fn test_internal_wasm_imports_allowed() {
    let validator = SecurityValidator::new();
    assert!(validator.is_import_allowed("__heap_base"));
    assert!(validator.is_import_allowed("__data_end"));
    assert!(validator.is_import_allowed("__indirect_function_table"));
}

#[test]
fn test_unknown_imports_not_allowed() {
    let validator = SecurityValidator::new();
    assert!(!validator.is_import_allowed("unknown_function"));
    assert!(!validator.is_import_allowed("external_api"));
}

#[test]
fn test_blocked_imports() {
    let validator = SecurityValidator::new();
    assert!(validator.is_import_blocked("eval"));
    assert!(validator.is_import_blocked("fetch"));
    assert!(validator.is_import_blocked("syscall"));
    assert!(validator.is_import_blocked("worker"));
}

//=============================================================================
// Full Validation Tests
//=============================================================================

#[test]
fn test_full_validation_clean_plugin() {
    let validator = SecurityValidator::new();
    let clean_wasm = vec![
        0x00, 0x61, 0x73, 0x6D, // Magic number
        0x01, 0x00, 0x00, 0x00, // Version
    ];
    let result = validator.validate(&clean_wasm);
    assert!(result.is_valid);
    assert!(result.errors.is_empty());
}

#[test]
fn test_full_validation_oversized_fails() {
    let validator = SecurityValidator::new();
    let oversized = vec![0u8; 11 * 1024 * 1024];
    let result = validator.validate(&oversized);
    assert!(!result.is_valid);
}

#[test]
fn test_full_validation_dangerous_import_fails() {
    let validator = SecurityValidator::new();
    let mut wasm_with_dangerous = vec![0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];
    wasm_with_dangerous.extend_from_slice(b"eval");
    let result = validator.validate(&wasm_with_dangerous);
    assert!(!result.is_valid);
}

//=============================================================================
// Memory Usage Tracker Tests
//=============================================================================

#[test]
fn test_memory_usage_initialization() {
    let tracker = MemoryUsage::new(10, 100);
    assert_eq!(tracker.initial_pages, 10);
    assert_eq!(tracker.current_pages, 10);
    assert_eq!(tracker.max_pages, 100);
    assert_eq!(tracker.peak_pages, 10);
}

#[test]
fn test_memory_usage_update() {
    let mut tracker = MemoryUsage::new(10, 100);
    tracker.update(50);
    assert_eq!(tracker.current_pages, 50);
    assert_eq!(tracker.peak_pages, 50);
}

#[test]
fn test_memory_usage_peak_tracking() {
    let mut tracker = MemoryUsage::new(10, 100);
    tracker.update(50);
    tracker.update(30);
    tracker.update(70);
    assert_eq!(tracker.current_pages, 70);
    assert_eq!(tracker.peak_pages, 70);
}

#[test]
fn test_memory_exceeds_limit() {
    let mut tracker = MemoryUsage::new(10, 100);
    tracker.update(50);
    assert!(!tracker.exceeds_limit());
    tracker.update(150);
    assert!(tracker.exceeds_limit());
}

#[test]
fn test_memory_bytes_calculation() {
    let tracker = MemoryUsage::new(10, 100);
    assert_eq!(tracker.current_bytes(), 10 * 65536);
    assert_eq!(tracker.peak_bytes(), 10 * 65536);
    assert_eq!(tracker.limit_bytes(), 100 * 65536);
}

#[test]
fn test_memory_usage_percentage() {
    let mut tracker = MemoryUsage::new(50, 100);
    assert_eq!(tracker.usage_percentage(), 50.0);
    tracker.update(75);
    assert_eq!(tracker.usage_percentage(), 75.0);
}

#[test]
fn test_memory_percentage_edge_cases() {
    let tracker = MemoryUsage::new(0, 100);
    assert_eq!(tracker.usage_percentage(), 0.0);

    let tracker = MemoryUsage::new(100, 100);
    assert_eq!(tracker.usage_percentage(), 100.0);
}

//=============================================================================
// Timeout Enforcer Tests
//=============================================================================

#[test]
fn test_timeout_enforcer_initialization() {
    let enforcer = TimeoutEnforcer::new(5000);
    assert_eq!(enforcer.timeout_ms, 5000);
    assert!(!enforcer.was_triggered());
}

#[test]
fn test_timeout_remaining() {
    let enforcer = TimeoutEnforcer::new(1000);
    // The actual elapsed time depends on the clock implementation
    // This test verifies the method exists and returns a valid type
    let remaining = enforcer.remaining();
    assert!(remaining <= 1000);
}

#[test]
fn test_timeout_elapsed() {
    let enforcer = TimeoutEnforcer::new(1000);
    let elapsed = enforcer.elapsed();
    let _ = elapsed; // verify method exists and returns u64
}

//=============================================================================
// Default Implementation Tests
//=============================================================================

#[test]
fn test_security_validator_default() {
    let validator = SecurityValidator::default();
    assert_eq!(validator.max_size(), 10 * 1024 * 1024);
}

//=============================================================================
// Integration Tests
//=============================================================================

#[test]
fn test_security_validation_workflow() {
    let validator = SecurityValidator::new();

    // Step 1: Check size
    let test_plugin = vec![
        0x00, 0x61, 0x73, 0x6D, // Magic number
        0x01, 0x00, 0x00, 0x00, // Version
    ];
    assert!(validator.check_size(&test_plugin).is_valid);

    // Step 2: Check dangerous imports
    assert!(validator.check_dangerous_imports(&test_plugin).is_valid);

    // Step 3: Check allowed imports
    let allowed_result = validator.check_allowed_imports_only(&test_plugin);
    assert!(allowed_result.is_valid);

    // Step 4: Full validation
    let full_result = validator.validate(&test_plugin);
    assert!(full_result.is_valid);
}

#[test]
fn test_memory_tracking_workflow() {
    let mut tracker = MemoryUsage::new(10, 100);

    // Simulate memory usage during plugin execution
    for i in 1..=5 {
        tracker.update(10 * i);
        assert!(!tracker.exceeds_limit());
    }

    // Verify peak was tracked
    assert_eq!(tracker.peak_pages, 50);

    // Verify percentage
    assert_eq!(tracker.usage_percentage(), 50.0);
}
