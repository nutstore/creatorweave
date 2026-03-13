//! Plugin validation module
//!
//! Validates WASM plugins before loading:
//! - WASM format validation
//! - Required export checking
//! - API version compatibility
//! - Suspicious import detection
//! - Resource limit validation

use crate::abi::{BLOCKED_IMPORTS, REQUIRED_EXPORTS};
use crate::types::{PluginInfo, ValidationResult, BFOSA_API_VERSION};
use serde_json::Value;

//=============================================================================
// Plugin Validator
//=============================================================================

/// Plugin validation entry point
pub struct PluginValidator;

impl PluginValidator {
    /// Validate a WASM plugin from raw bytes
    ///
    /// # Arguments
    /// * `wasm_bytes` - Raw WASM file content
    ///
    /// # Returns
    /// `ValidationResult` indicating validity and any errors
    pub fn validate(wasm_bytes: &[u8]) -> ValidationResult {
        let mut errors = Vec::new();

        // 1. Check WASM magic number
        if !Self::is_valid_wasm(wasm_bytes) {
            errors.push("InvalidWasmFormat: Invalid WASM magic number".to_string());
            return ValidationResult {
                is_valid: false,
                errors,
            };
        }

        // 2. Check required exports (parse from WASM)
        let missing_exports = Self::check_required_exports(wasm_bytes);
        for export in missing_exports {
            errors.push(format!(
                "MissingExport: Required export '{}' not found",
                export
            ));
        }

        // 3. Check for suspicious/blocked imports
        let blocked = Self::check_blocked_imports(wasm_bytes);
        for import in blocked {
            errors.push(format!(
                "SuspiciousImport: Blocked import '{}' detected",
                import
            ));
        }

        // Note: We can't fully validate PluginInfo without instantiating
        // the WASM module, which happens in the host (JavaScript).
        // This validator does basic WASM structure checking.

        ValidationResult {
            is_valid: errors.is_empty(),
            errors,
        }
    }

    /// Validate plugin info returned by bfosa_plugin_info
    ///
    /// # Arguments
    /// * `info` - PluginInfo from plugin
    ///
    /// # Returns
    /// `ValidationResult` with any errors
    pub fn validate_plugin_info(info: &PluginInfo) -> ValidationResult {
        let mut errors = Vec::new();

        // Check API version compatibility
        if !crate::abi::is_version_compatible(&info.api_version, BFOSA_API_VERSION) {
            errors.push(format!(
                "ApiVersionMismatch: Plugin requires '{}', host has '{}'",
                info.api_version, BFOSA_API_VERSION
            ));
        }

        // Validate resource limits
        if info.resource_limits.max_memory == 0 {
            errors.push("InvalidResourceLimit: max_memory cannot be zero".to_string());
        }
        if info.resource_limits.max_memory > crate::types::MAX_ALLOWED_MEMORY {
            errors.push(format!(
                "InvalidResourceLimit: max_memory {} exceeds limit {}",
                info.resource_limits.max_memory,
                crate::types::MAX_ALLOWED_MEMORY
            ));
        }

        if info.resource_limits.max_execution_time == 0 {
            errors.push("InvalidResourceLimit: max_execution_time cannot be zero".to_string());
        }
        if info.resource_limits.max_execution_time > crate::types::MAX_ALLOWED_EXECUTION_TIME {
            errors.push(format!(
                "InvalidResourceLimit: max_execution_time {}ms exceeds limit {}ms",
                info.resource_limits.max_execution_time,
                crate::types::MAX_ALLOWED_EXECUTION_TIME
            ));
        }

        // Validate capabilities consistency
        if info.capabilities.metadata_only && info.capabilities.requires_content {
            errors.push("InvalidResourceLimit: Cannot have both metadata_only=true and requires_content=true".to_string());
        }

        // Check for empty required fields
        if info.id.is_empty() {
            errors.push("MissingMetadata: id field is empty".to_string());
        }
        if info.name.is_empty() {
            errors.push("MissingMetadata: name field is empty".to_string());
        }
        if info.description.is_empty() {
            errors.push("MissingMetadata: description field is empty".to_string());
        }

        ValidationResult {
            is_valid: errors.is_empty(),
            errors,
        }
    }

    /// Check if bytes have valid WASM magic number
    fn is_valid_wasm(bytes: &[u8]) -> bool {
        if bytes.len() < 8 {
            return false;
        }
        // WASM magic: 00 61 73 6D 01 00 00 00
        //              \0  a  s  m  ...
        let magic = [0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00];
        bytes[..8] == magic
    }

    /// Check for required exports in WASM
    ///
    /// This is a simplified check - a full implementation would
    /// parse the WASM binary format. For now, we do basic checks.
    fn check_required_exports(_wasm_bytes: &[u8]) -> Vec<String> {
        // In a real implementation, this would:
        // 1. Parse WASM binary format
        // 2. Find the export section
        // 3. Check for required export names
        //
        // For now, we return empty - validation happens at runtime
        // when the host tries to instantiate the module
        Vec::new()
    }

    /// Check for blocked/suspicious imports
    ///
    /// This is a simplified check - full implementation would
    /// parse the import section of the WASM binary.
    fn check_blocked_imports(_wasm_bytes: &[u8]) -> Vec<String> {
        // In a real implementation, this would parse the
        // import section and check against BLOCKED_IMPORTS
        //
        // For now, we return empty - validation happens at runtime
        Vec::new()
    }

    /// Parse plugin info from JSON bytes
    ///
    /// Used by host to decode bfosa_plugin_info result
    pub fn parse_plugin_info(json: &[u8]) -> Result<PluginInfo, String> {
        serde_json::from_slice(json).map_err(|e| format!("Failed to parse PluginInfo: {}", e))
    }

    /// Parse file output from JSON bytes
    pub fn parse_file_output(json: &[u8]) -> Result<crate::types::FileOutput, String> {
        serde_json::from_slice(json).map_err(|e| format!("Failed to parse FileOutput: {}", e))
    }

    /// Parse plugin result from JSON bytes
    pub fn parse_plugin_result(json: &[u8]) -> Result<crate::types::PluginResult, String> {
        serde_json::from_slice(json).map_err(|e| format!("Failed to parse PluginResult: {}", e))
    }
}

//=============================================================================
// Runtime Validation (for host-side checks)
//=============================================================================

/// Runtime validation during WASM instantiation
pub struct RuntimeValidator;

impl RuntimeValidator {
    /// Check exports from actual WASM instance
    pub fn check_exports(exports: &Value) -> Result<(), Vec<String>> {
        let mut missing = Vec::new();

        if let Some(obj) = exports.as_object() {
            for required in REQUIRED_EXPORTS {
                if !obj.contains_key(*required) {
                    missing.push(required.to_string());
                }
            }
        } else {
            // If exports is not an object, all are missing
            missing = REQUIRED_EXPORTS.iter().map(|s| s.to_string()).collect();
        }

        if missing.is_empty() {
            Ok(())
        } else {
            Err(missing)
        }
    }

    /// Check imports from actual WASM instance
    pub fn check_imports(imports: &Value) -> Result<(), Vec<String>> {
        let mut blocked = Vec::new();

        if let Some(obj) = imports.as_object() {
            for blocked_import in BLOCKED_IMPORTS {
                // Check if any import module matches blocked names
                for module_name in obj.keys() {
                    if module_name.contains(blocked_import) {
                        blocked.push(format!("{} (contains blocked import)", module_name));
                    }
                }
            }
        }

        if blocked.is_empty() {
            Ok(())
        } else {
            Err(blocked)
        }
    }
}

//=============================================================================
// Tests
//=============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_magic_number_valid() {
        let valid_wasm = [
            0x00, 0x61, 0x73, 0x6D, // \0asm
            0x01, 0x00, 0x00, 0x00, // version
        ];
        assert!(PluginValidator::is_valid_wasm(&valid_wasm));
    }

    #[test]
    fn test_wasm_magic_number_invalid() {
        let invalid = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        assert!(!PluginValidator::is_valid_wasm(&invalid));
    }

    #[test]
    fn test_wasm_magic_number_too_short() {
        let too_short = [0x00, 0x61, 0x73];
        assert!(!PluginValidator::is_valid_wasm(&too_short));
    }

    #[test]
    fn test_validate_empty_bytes() {
        let result = PluginValidator::validate(&[]);
        assert!(!result.is_valid);
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_validate_plugin_info_valid() {
        let info = PluginInfo {
            id: "test".to_string(),
            name: "Test".to_string(),
            version: "1.0.0".to_string(),
            api_version: BFOSA_API_VERSION.to_string(),
            description: "Test plugin".to_string(),
            author: "CreatorWeave Team".to_string(),
            capabilities: crate::types::PluginCapabilities {
                metadata_only: true,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: vec![],
            },
            resource_limits: crate::types::ResourceLimits {
                max_memory: 1024 * 1024,
                max_execution_time: 1000,
                worker_count: 1,
            },
        };

        let result = PluginValidator::validate_plugin_info(&info);
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_validate_plugin_info_incompatible_version() {
        let info = PluginInfo {
            id: "test".to_string(),
            name: "Test".to_string(),
            version: "1.0.0".to_string(),
            api_version: "3.0.0".to_string(), // Wrong major version
            description: "Test plugin".to_string(),
            author: "CreatorWeave Team".to_string(),
            capabilities: crate::types::PluginCapabilities {
                metadata_only: true,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: vec![],
            },
            resource_limits: crate::types::ResourceLimits {
                max_memory: 1024 * 1024,
                max_execution_time: 1000,
                worker_count: 1,
            },
        };

        let result = PluginValidator::validate_plugin_info(&info);
        assert!(!result.is_valid);
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_validate_plugin_info_conflicting_capabilities() {
        let info = PluginInfo {
            id: "test".to_string(),
            name: "Test".to_string(),
            version: "1.0.0".to_string(),
            api_version: BFOSA_API_VERSION.to_string(),
            description: "Test plugin".to_string(),
            author: "CreatorWeave Team".to_string(),
            capabilities: crate::types::PluginCapabilities {
                metadata_only: true,    // Conflicts with:
                requires_content: true, // this
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: vec![],
            },
            resource_limits: crate::types::ResourceLimits {
                max_memory: 1024 * 1024,
                max_execution_time: 1000,
                worker_count: 1,
            },
        };

        let result = PluginValidator::validate_plugin_info(&info);
        assert!(!result.is_valid);
    }

    #[test]
    fn test_validate_plugin_info_missing_fields() {
        let info = PluginInfo {
            id: "".to_string(), // Empty!
            name: "".to_string(),
            version: "1.0.0".to_string(),
            api_version: BFOSA_API_VERSION.to_string(),
            description: "".to_string(),
            author: "CreatorWeave Team".to_string(),
            capabilities: crate::types::PluginCapabilities {
                metadata_only: true,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: vec![],
            },
            resource_limits: crate::types::ResourceLimits {
                max_memory: 1024 * 1024,
                max_execution_time: 1000,
                worker_count: 1,
            },
        };

        let result = PluginValidator::validate_plugin_info(&info);
        assert!(!result.is_valid);
        assert!(result.errors.len() >= 3); // id, name, description
    }

    #[test]
    fn test_validate_plugin_info_invalid_limits() {
        let info = PluginInfo {
            id: "test".to_string(),
            name: "Test".to_string(),
            version: "1.0.0".to_string(),
            api_version: BFOSA_API_VERSION.to_string(),
            description: "Test plugin".to_string(),
            author: "CreatorWeave Team".to_string(),
            capabilities: crate::types::PluginCapabilities {
                metadata_only: true,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: vec![],
            },
            resource_limits: crate::types::ResourceLimits {
                max_memory: 0, // Invalid!
                max_execution_time: 1000,
                worker_count: 1,
            },
        };

        let result = PluginValidator::validate_plugin_info(&info);
        assert!(!result.is_valid);
    }

    #[test]
    fn test_parse_plugin_info_valid_json() {
        let json = r#"{
            "id": "test",
            "name": "Test",
            "version": "1.0.0",
            "api_version": "2.0.0",
            "description": "Test plugin",
            "author": "CreatorWeave Team",
            "capabilities": {
                "metadata_only": true,
                "requires_content": false,
                "supports_streaming": false,
                "max_file_size": 0,
                "file_extensions": []
            },
            "resource_limits": {
                "max_memory": 1048576,
                "max_execution_time": 1000,
                "worker_count": 1
            }
        }"#;

        let result = PluginValidator::parse_plugin_info(json.as_bytes());
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.id, "test");
        assert_eq!(info.api_version, "2.0.0");
    }

    #[test]
    fn test_parse_plugin_info_invalid_json() {
        let json = r#"{"id": "test", invalid}"#;
        let result = PluginValidator::parse_plugin_info(json.as_bytes());
        assert!(result.is_err());
    }

    #[test]
    fn test_runtime_check_exports_valid() {
        let exports = serde_json::json!({
            "bfosa_plugin_info": true,
            "bfosa_process_file": true,
            "bfosa_finalize": true,
            "bfosa_cleanup": true,
        });

        let result = RuntimeValidator::check_exports(&exports);
        assert!(result.is_ok());
    }

    #[test]
    fn test_runtime_check_exports_missing() {
        let exports = serde_json::json!({
            "bfosa_plugin_info": true,
            // Missing bfosa_process_file
            "bfosa_finalize": true,
            "bfosa_cleanup": true,
        });

        let result = RuntimeValidator::check_exports(&exports);
        assert!(result.is_err());
        let missing = result.unwrap_err();
        assert!(missing.contains(&"bfosa_process_file".to_string()));
    }
}
