# Browser File System Analyzer - Phase 2 Direction A
# Dynamic Plugin System Architecture

## Document Information

| Project | Content |
|---------|---------|
| Product Name | Browser File System Analyzer |
| Phase | Phase 2 - Direction A: Dynamic Plugin System |
| Version | v2.0.0-arch |
| Created | 2026-01-28 |
| Status | ✅ Implemented |
| Author | System Architecture Team |

---

## Executive Summary

### Overview

This document defines the technical architecture for implementing a **Dynamic Plugin System** that allows users to extend the Browser File System Analyzer with custom analysis capabilities. Users can upload external WASM plugin files to perform specific file analysis operations (MD5 calculation, code line counting, duplicate file detection, etc.) without modifying the core application.

### Key Design Principles

| Principle | Description |
|-----------|-------------|
| **Sandbox Security** | All plugins execute in an isolated WASM sandbox with no access to host system resources |
| **Stable ABI** | Well-defined plugin interface that remains compatible across versions |
| **Hot Loading** | Plugins can be loaded/unloaded at runtime without application restart |
| **Progressive Enhancement** | Core functionality works without plugins; plugins enhance capabilities |
| **Developer Friendly** | Plugin development follows standard Rust/WASM patterns with minimal boilerplate |

### Architecture Goals

1. **Security First**: Prevent malicious code execution through comprehensive sandboxing
2. **Performance**: Support analyzing 10,000+ files with plugin overhead <20%
3. **Extensibility**: Enable plugin authors to implement any file analysis operation
4. **Usability**: Non-technical users can install and use plugins easily

---

## 1. Plugin Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User Interface Layer                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Plugin Management UI                                             │  │
│  │  - Upload Plugin (drag & drop / file picker)                     │  │
│  │  - Plugin List (installed, active, version)                      │  │
│  │  - Plugin Detail (description, permissions, author)              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        Plugin Management Layer                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Plugin Manager Service                                           │  │
│  │  - loadPlugin(wasmBytes) → Promise<PluginInstance>               │  │
│  │  - unloadPlugin(pluginId) → void                                  │  │
│  │  - executePlugin(pluginId, files) → Promise<PluginResult>        │  │
│  │  - validatePlugin(wasmBytes) → Promise<ValidationResult>         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Plugin Store (IndexedDB)                                         │  │
│  │  - Persist installed plugins                                     │  │
│  │  - Cache plugin metadata                                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                          Plugin Runtime Layer                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Plugin Sandbox (WASM Instance)                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  Host Imports (Controlled)                                  │  │  │
│  │  │  - bfosa_log(message: string)                               │  │  │
│  │  │  - bfosa_get_version() → string                             │  │  │
│  │  │  - bfosa_allocate(size: number) → number                    │  │  │
│  │  │  - bfosa_deallocate(ptr: number) → void                     │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  Plugin Exports (Required)                                  │  │  │
│  │  │  - bfosa_plugin_info() → PluginInfo                         │  │  │
│  │  │  - bfosa_process_file(file: FileInput) → FileOutput         │  │  │
│  │  │  - bfosa_finalize(results: FileOutput[]) → PluginResult      │  │  │
│  │  │  - bfosa_cleanup() → void                                    │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                           Core Analysis Layer                           │
│  - File traversal (existing)                                           │
│  - Metadata collection                                                 │
│  - Progress tracking                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Plugin Interface Specification (ABI)

#### 1.2.1 Plugin Metadata Structure

The plugin must export a `bfosa_plugin_info` function that returns plugin metadata:

```rust
// Rust side - plugin implementation
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct PluginInfo {
    /// Plugin identifier (e.g., "md5-calculator")
    pub id: String,

    /// Human-readable name
    pub name: String,

    /// Plugin version (semver)
    pub version: String,

    /// BFOSA core version required (semver range)
    pub api_version: String,

    /// Plugin description
    pub description: String,

    /// Plugin author
    pub author: String,

    /// Plugin capabilities
    pub capabilities: PluginCapabilities,

    /// Resource limits requested
    pub resource_limits: ResourceLimits,
}

#[derive(Serialize, Deserialize)]
pub struct PluginCapabilities {
    /// Can process file metadata without content
    pub metadata_only: bool,

    /// Requires file content for processing
    pub requires_content: bool,

    /// Supports streaming content (for large files)
    pub supports_streaming: bool,

    /// Maximum file size to process (0 = unlimited)
    pub max_file_size: u64,

    /// Supported file extensions (empty = all)
    pub file_extensions: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ResourceLimits {
    /// Maximum memory in bytes
    pub max_memory: u64,

    /// Maximum execution time per file (ms)
    pub max_execution_time: u32,

    /// Requested Web Workers (0 = none)
    pub worker_count: u32,
}
```

#### 1.2.2 File Processing Interface

```rust
/// Input data for processing a single file
#[derive(Serialize, Deserialize)]
pub struct FileInput {
    /// File name
    pub name: String,

    /// File path
    pub path: String,

    /// File size in bytes
    pub size: u64,

    /// File MIME type (if available)
    pub mime_type: Option<String>,

    /// Last modified timestamp
    pub last_modified: u64,

    /// File content (if plugin requires it)
    /// For large files, this is a chunk (see streaming below)
    pub content: Option<Vec<u8>>,
}

/// Output data for a processed file
#[derive(Serialize, Deserialize)]
pub struct FileOutput {
    /// File path (must match input)
    pub path: String,

    /// Processing status
    pub status: ProcessingStatus,

    /// Analysis results (plugin-specific JSON)
    pub data: serde_json::Value,

    /// Error message (if status is Error)
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub enum ProcessingStatus {
    /// Successfully processed
    Success,
    /// Skipped (e.g., unsupported file type)
    Skipped,
    /// Error during processing
    Error,
}

/// Final aggregated result after all files processed
#[derive(Serialize, Deserialize)]
pub struct PluginResult {
    /// Summary message
    pub summary: String,

    /// Total files processed
    pub files_processed: u64,

    /// Files skipped
    pub files_skipped: u64,

    /// Files with errors
    pub files_with_errors: u64,

    /// Aggregated metrics (plugin-specific)
    pub metrics: serde_json::Value,

    /// Warnings collected during processing
    pub warnings: Vec<String>,
}
```

#### 1.2.3 Required Plugin Exports

| Export Name | Signature | Description |
|-------------|-----------|-------------|
| `bfosa_plugin_info` | `() -> PluginInfo` | Returns plugin metadata |
| `bfosa_process_file` | `(input: FileInput) -> FileOutput` | Process a single file |
| `bfosa_finalize` | `(outputs: FileOutput[]) -> PluginResult` | Aggregate results |
| `bfosa_cleanup` | `() -> void` | Clean up resources |

#### 1.2.4 Optional Streaming Interface

For plugins that need to process large files:

```rust
/// Initialize processing for a file (called once per file)
pub fn bfosa_init_file(input: FileInput) -> FileContext;

/// Process a chunk of file content (called multiple times)
pub fn bfosa_process_chunk(
    context: FileContext,
    chunk: &[u8],
    offset: u64,
) -> ChunkProgress;

/// Finalize file processing after all chunks processed
pub fn bfosa_finalize_file(context: FileContext) -> FileOutput;

/// Clean up file context
pub fn bfosa_cleanup_file(context: FileContext);
```

### 1.3 Plugin Lifecycle

```
┌──────────┐    ┌────────────┐    ┌─────────────┐    ┌───────────┐    ┌──────────┐
│  Loaded  │ -> │ Initialized│ -> │   Active   │ -> │ Finalizing│ -> │ Unloaded │
└──────────┘    └────────────┘    └─────────────┘    └───────────┘    └──────────┘
     │               │                  │                  │                │
     ↓               ↓                  ↓                  ↓                ↓
 User uploads    bfosa_plugin_info   Processing       bfosa_finalize   Cleanup
 WASM file      called to validate   files called     called to        resources
                compatibility        with files        aggregate
                                     streaming         results
```

### 1.4 Plugin Communication

#### 1.4.1 Memory Model

Plugins share NO direct memory with the host. All data transfer uses:

1. **JSON serialization** for metadata and small data
2. **WASM linear memory** for file content (read-only, allocated by host)

```
┌─────────────────────┐         ┌─────────────────────┐
│   Host Memory       │         │   Plugin Memory     │
│                     │         │                     │
│  ┌───────────────┐  │         │  ┌───────────────┐  │
│  │ File Content  │  │ → Copy  │  │ WASM Memory   │  │
│  │   (ArrayBuffer)│  │         │  │   (read-only) │  │
│  └───────────────┘  │         │  └───────────────┘  │
│                     │         │                     │
│  ┌───────────────┐  │         │  ┌───────────────┐  │
│  │ Plugin Result │  │ ← JSON  │  │ Output Data   │  │
│  │   (Object)    │  │         │  │   (stringify) │  │
│  └───────────────┘  │         │  └───────────────┘  │
└─────────────────────┘         └─────────────────────┘
```

#### 1.4.2 Host Functions (Imports Available to Plugins)

```rust
// Available host functions (imported by plugin)
extern "C" {
    // Logging (for debugging)
    fn bfosa_log(message_ptr: *const u8, message_len: usize);

    // API version check
    fn bfosa_get_api_version() -> u32;

    // Memory management (optional, plugin can use its own)
    fn bfosa_allocate(size: usize) -> *mut u8;
    fn bfosa_deallocate(ptr: *mut u8, size: usize);

    // Progress reporting
    fn bfosa_report_progress(current: u32, total: u32);
}
```

---

## 2. Security Considerations

### 2.1 Threat Model

| Threat | Description | Mitigation |
|--------|-------------|------------|
| **Malicious Code Execution** | Plugin contains harmful WASM code | WASM sandbox provides no access to DOM, network, or system APIs |
| **Denial of Service** | Plugin consumes excessive CPU/memory | Resource limits (max memory, max execution time per file) |
| **Data Exfiltration** | Plugin tries to send data externally | No network access in WASM sandbox |
| **Memory Corruption** | Plugin corrupts host memory | Memory isolation; only controlled data copying |
| **Infinite Loops** | Plugin hangs processing | Execution timeout with Web Worker termination |

### 2.2 Sandbox Design

#### 2.2.1 WASM Sandbox Boundaries

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Browser Sandbox (Same-Origin)                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Main Thread (UI)                                                 │  │
│  │  - React Components                                               │  │
│  │  - State Management (Zustand)                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Web Worker (Plugin Execution)                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  WASM Instance (Plugin)                                     │  │  │
│  │  │  ┌─────────────────────────────────────────────────────┐    │  │  │
│  │  │  │  Plugin Code (Isolated Memory)                       │    │  │  │
│  │  │  │  - No DOM access                                     │    │  │  │
│  │  │  │  - No network access                                 │    │  │  │
│  │  │  │  - No file system access                             │    │  │  │
│  │  │  │  - Controlled host imports only                       │    │  │  │
│  │  │  └─────────────────────────────────────────────────────┘    │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  - Monitors execution time                                        │  │
│  │  - Enforces memory limits                                         │  │
│  │  - Terminates on timeout                                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 Resource Limits

```typescript
interface PluginResourceLimits {
  // Maximum memory allocation (default: 16MB)
  maxMemory: number;

  // Maximum execution time per file in ms (default: 5000ms)
  maxExecutionTime: number;

  // Maximum file size plugin will process (0 = unlimited)
  maxFileSize: number;

  // Maximum concurrent workers for plugin (default: 1)
  maxWorkers: number;

  // Allow GPU access (default: false)
  allowGPU: boolean;
}

// Enforced limits
const DEFAULT_LIMITS: PluginResourceLimits = {
  maxMemory: 16 * 1024 * 1024,      // 16 MB
  maxExecutionTime: 5000,            // 5 seconds per file
  maxFileSize: 100 * 1024 * 1024,   // 100 MB
  maxWorkers: 1,
  allowGPU: false,
};
```

### 2.3 Plugin Validation

#### 2.3.1 Validation Steps

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  pluginInfo?: PluginInfo;
}

async function validatePlugin(wasmBytes: ArrayBuffer): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Validate WASM format
  try {
    const module = await WebAssembly.compile(wasmBytes);
    // Check for required exports
    const requiredExports = [
      'bfosa_plugin_info',
      'bfosa_process_file',
      'bfosa_finalize',
      'bfosa_cleanup',
    ];
    for (const exp of requiredExports) {
      if (!WebAssembly.Module.exports(module).some(e => e.name === exp)) {
        errors.push(`Missing required export: ${exp}`);
      }
    }
  } catch (e) {
    errors.push(`Invalid WASM format: ${e.message}`);
    return { valid: false, errors, warnings };
  }

  // Step 2: Initialize and query metadata
  const instance = await WebAssembly.instantiate(wasmBytes, {
    env: {
      bfosa_log: (msgPtr: number, msgLen: number) => {
        // Capture log output for validation
      },
      // ... other host functions
    },
  });

  // Step 3: Check API version compatibility
  const pluginInfo = instance.exports.bfosa_plugin_info();
  if (!semver.satisfies(pluginInfo.api_version, CURRENT_API_VERSION)) {
    errors.push(
      `Plugin requires API version ${pluginInfo.api_version}, ` +
      `but current version is ${CURRENT_API_VERSION}`
    );
  }

  // Step 4: Validate resource limits
  if (pluginInfo.resource_limits.max_memory > MAX_ALLOWED_MEMORY) {
    errors.push(`Requested memory exceeds maximum: ${pluginInfo.resource_limits.max_memory}`);
  }

  // Step 5: Check for suspicious imports
  const suspiciousImports = ['fetch', 'XMLHttpRequest', 'window', 'document'];
  const imports = WebAssembly.Module.imports(module);
  for (const imp of imports) {
    if (suspiciousImports.includes(imp.module)) {
      errors.push(`Suspicious import detected: ${imp.module}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    pluginInfo,
  };
}
```

#### 2.3.2 Signature Verification (Optional)

For plugin marketplace distribution, implement digital signatures:

```typescript
interface SignedPlugin {
  wasmData: ArrayBuffer;
  signature: string;
  publicKey: string;
}

async function verifySignedPlugin(plugin: SignedPlugin): Promise<boolean> {
  // Use Web Crypto API to verify signature
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    await crypto.subtle.importKey(
      'spki',
      base64ToArrayBuffer(plugin.publicKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    ),
    base64ToArrayBuffer(plugin.signature),
    plugin.wasmData
  );
  return isValid;
}
```

### 2.4 Allowed Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Read file content | Yes (controlled) | Only for user-selected files |
| Read file metadata | Yes | Name, size, type, last modified |
| Log messages | Yes | Via `bfosa_log` host function |
| Allocate memory | Yes | Within limits |
| Perform computations | Yes | CPU-bound operations |
| Access DOM | No | Not available in WASM |
| Network requests | No | Not available in WASM |
| File system write | No | Not available in WASM |
| Browser storage | No | Not available in WASM |

---

## 3. Data Flow

### 3.1 End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User Action Flow                              │
│                                                                         │
│  1. User selects folder                                                  │
│     ↓                                                                    │
│  2. User chooses plugin(s) to use (or default)                          │
│     ↓                                                                    │
│  3. System traverses folder (existing Phase 1 code)                     │
│     ↓                                                                    │
│  4. For each file:                                                       │
│     a. Collect metadata                                                  │
│     b. If plugin requires content: Read file                            │
│     c. Call plugin.bfosa_process_file(file)                             │
│     d. Collect plugin output                                             │
│     e. Update progress UI                                                │
│     ↓                                                                    │
│  5. Call plugin.bfosa_finalize(outputs)                                 │
│     ↓                                                                    │
│  6. Display aggregated results                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Detailed Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    File 1    │     │    File 2    │     │    File N    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ↓                    ↓                    ↓
┌─────────────────────────────────────────────────────────┐
│              File Metadata Collection                    │
│  - name, size, type, last_modified, path                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
                ┌────────────────┐
                │  Metadata Batch│
                │  (100 files)  │
                └────────┬───────┘
                         │
                         ↓
         ┌───────────────────────────────┐
         │   Plugin Execution Queue      │
         │   (Web Worker Pool)           │
         └───────────────┬───────────────┘
                         │
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │Worker 1 │    │Worker 2 │    │Worker N │
    └────┬────┘    └────┬────┘    └────┬────┘
         │              │              │
         ↓              ↓              ↓
    ┌─────────────────────────────────────┐
    │        WASM Plugin Instance         │
    │  ┌─────────────────────────────────┐ │
    │  │  bfosa_process_file(input)      │ │
    │  │    ↓                            │ │
    │  │  Process file data              │ │
    │  │    ↓                            │ │
    │  │  Return FileOutput              │ │
    │  └─────────────────────────────────┘ │
    └──────────────────┬──────────────────┘
                       │
                       ↓
            ┌──────────────────────┐
            │   Result Collector   │
            │  - Accumulate outputs│
            │  - Track progress    │
            │  - Handle errors     │
            └──────────┬───────────┘
                       │
                       ↓
            ┌──────────────────────┐
            │  All files processed │
            │      or error        │
            └──────────┬───────────┘
                       │
                       ↓
    ┌─────────────────────────────────────┐
    │  bfosa_finalize(outputs[])          │
    │    ↓                                │
    │  Aggregate results                  │
    │    ↓                                │
    │  Return PluginResult                │
    └──────────────────┬──────────────────┘
                       │
                       ↓
            ┌──────────────────────┐
            │   Display Results    │
            │  - Summary           │
            │  - Metrics           │
            │  - File-level data   │
            └──────────────────────┘
```

### 3.3 Memory Flow for Large Files

For plugins that require file content:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Large File Processing Flow                          │
│                                                                         │
│  File Handle (from File System Access API)                             │
│         ↓                                                               │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  Streaming Reader (Web Streams API)                         │       │
│  │  - Read file in chunks (default: 64KB)                      │       │
│  │  - Avoid loading entire file into memory                    │       │
│  └─────────────────────────────────────────────────────────────┘       │
│         ↓                                                               │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  Transfer to WASM Memory                                     │       │
│  │  - Allocate WASM memory for chunk                           │       │
│  │  - Copy chunk bytes to WASM linear memory                   │       │
│  │  - Pass pointer to plugin                                   │       │
│  └─────────────────────────────────────────────────────────────┘       │
│         ↓                                                               │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  Plugin: bfosa_process_chunk(context, chunk, offset)        │       │
│  │  - Process chunk incrementally                              │       │
│  │  - Update internal state                                    │       │
│  └─────────────────────────────────────────────────────────────┘       │
│         ↓                                                               │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  Repeat until EOF                                            │       │
│  └─────────────────────────────────────────────────────────────┘       │
│         ↓                                                               │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  Plugin: bfosa_finalize_file(context) → FileOutput           │       │
│  │  - Return final result for this file                        │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Error Handling                                  │
│                                                                         │
│  Error Scenarios:                                                       │
│                                                                         │
│  1. Plugin Validation Failure                                           │
│     → Display error to user                                             │
│     → Prevent plugin from being loaded                                  │
│     → Log detailed error for debugging                                  │
│                                                                         │
│  2. File Processing Error                                               │
│     → Mark file status as "Error" in FileOutput                         │
│     → Include error message                                             │
│     → Continue processing remaining files                              │
│     → Increment error count in final result                            │
│                                                                         │
│  3. Plugin Timeout                                                      │
│     → Terminate WASM instance                                           │
│     → Mark current file as error                                        │
│     → Reinitialize plugin for next file                                 │
│     → Warn user about potential plugin issue                            │
│                                                                         │
│  4. Memory Limit Exceeded                                               │
│     → Trigger WASM trap                                                 │
│     → Catch and convert to friendly error                               │
│     → Suggest using metadata-only mode or smaller batches               │
│                                                                         │
│  5. Plugin Crash (Unexpected Trap)                                      │
│     → Catch WASM trap                                                   │
│     → Log trap details                                                  │
│     → Unload plugin safely                                              │
│     → Notify user of plugin failure                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Plugin Distribution

### 4.1 Plugin Package Format

Plugins are distributed as single `.wasm` files with embedded metadata:

```
my-plugin.wasm
├── WASM binary code
├── Embedded custom section (name: "bfosa_metadata")
│   └── JSON: PluginInfo (for quick inspection)
└── Exports: bfosa_plugin_info, bfosa_process_file, etc.
```

### 4.2 Plugin Manifest (Optional)

For distribution with additional assets:

```
my-plugin-package/
├── plugin.wasm              (required)
├── manifest.json            (required)
├── icon.svg                 (optional, 64x64)
├── preview.png              (optional, 400x300)
└── README.md                (optional, documentation)

manifest.json:
{
  "id": "md5-calculator",
  "name": "MD5 Hash Calculator",
  "version": "1.0.0",
  "description": "Calculate MD5 hashes for all files",
  "author": "Plugin Author",
  "homepage": "https://github.com/example/md5-plugin",
  "repository": "https://github.com/example/md5-plugin",
  "license": "MIT",
  "icon": "icon.svg",
  "wasm": "plugin.wasm",
  "minAppVersion": "2.0.0",
  "tags": ["hash", "checksum", "security"],
  "category": "analysis"
}
```

### 4.3 Plugin Installation Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| **File Upload** | Drag & drop or file picker to install `.wasm` | Local development, custom plugins |
| **URL Import** | Enter plugin URL to download and install | Testing, sharing |
| **Plugin Store** | Browse and install from marketplace (future) | General users |
| **Clipboard** | Paste base64-encoded WASM | Quick testing |

### 4.4 Version Management

```typescript
interface InstalledPlugin {
  // Plugin metadata
  id: string;
  name: string;
  version: string;
  description: string;

  // Installation info
  installedAt: Date;
  source: 'local' | 'url' | 'store';
  sourceUrl?: string;

  // File storage
  wasmDataId: string;  // IndexedDB key

  // Compatibility
  apiVersion: string;
  appVersion: string;

  // Usage stats
  lastUsedAt?: Date;
  useCount: number;
}

// Version compatibility check
function checkCompatibility(plugin: InstalledPlugin): boolean {
  const currentApiVersion = getCurrentApiVersion();
  return semver.satisfies(currentApiVersion, plugin.apiVersion);
}
```

---

## 5. File Structure

### 5.1 Project Structure with Plugin System

```
browser-fs-analyzer/
├── wasm/
│   ├── crates/
│   │   ├── core/                        # Existing core library
│   │   │   ├── src/
│   │   │   │   ├── lib.rs
│   │   │   │   ├── accumulator.rs
│   │   │   │   ├── stats.rs
│   │   │   │   └── types.rs
│   │   │   └── Cargo.toml
│   │   │
│   │   ├── wasm-bindings/               # Existing WASM bindings
│   │   │   ├── src/
│   │   │   │   └── lib.rs
│   │   │   └── Cargo.toml
│   │   │
│   │   └── plugin-api/                  # NEW: Plugin API
│   │       ├── src/
│   │       │   ├── lib.rs               # Plugin SDK
│   │       │   ├── types.rs             # Shared types
│   │       │   ├── host.rs              # Host functions
│   │       │   └── validation.rs        # Plugin validation
│   │       ├── Cargo.toml
│   │       └── README.md                # Plugin development guide
│   │
│   └── Cargo.toml                       # Workspace config
│
├── plugins/                             # NEW: Example plugins
│   ├── md5-calculator/
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   └── lib.rs
│   │   ├── README.md
│   │   └── build.sh
│   │
│   ├── line-counter/
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   └── detectors.rs             # Language detection
│   │   ├── README.md
│   │   └── build.sh
│   │
│   └── duplicate-detector/
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   └── hashing.rs               # Content hashing
│       ├── README.md
│       └── build.sh
│
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                      # Existing shadcn/ui components
│   │   │   ├── Header.tsx
│   │   │   ├── ErrorDisplay.tsx
│   │   │   └── ...
│   │   │   │
│   │   │   └── plugin/                  # NEW: Plugin UI components
│   │   │       ├── PluginManager.tsx    # Plugin list and management
│   │   │       ├── PluginUploader.tsx   # Drag & drop upload
│   │   │       ├── PluginCard.tsx       # Single plugin display
│   │   │       ├── PluginStore.tsx      # Plugin marketplace (future)
│   │   │       └── PluginResults.tsx    # Display plugin results
│   │   │
│   │   ├── services/
│   │   │   ├── fsAccess.service.ts      # Existing
│   │   │   ├── traversal.service.ts     # Existing
│   │   │   ├── analyzer.service.ts      # Existing
│   │   │   │
│   │   │   └── plugin/                  # NEW: Plugin services
│   │   │       ├── plugin-manager.service.ts
│   │   │       ├── plugin-loader.service.ts
│   │   │       ├── plugin-validator.service.ts
│   │   │       ├── plugin-executor.service.ts
│   │   │       └── plugin-storage.service.ts
│   │   │
│   │   ├── store/
│   │   │   ├── analysis.store.ts        # Existing
│   │   │   └── plugin.store.ts          # NEW: Plugin state
│   │   │
│   │   ├── types/
│   │   │   ├── global.d.ts              # Existing
│   │   │   └── plugin.ts                # NEW: Plugin types
│   │   │
│   │   ├── lib/
│   │   │   ├── wasm-loader.ts           # Existing
│   │   │   └── plugin-worker.ts         # NEW: Plugin Web Worker
│   │   │
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   └── public/
│       ├── wasm/                        # Existing WASM files
│       └── plugins/                     # NEW: Built-in plugins (optional)
│
├── docs/
│   ├── architecture/
│   │   ├── overview.md                  # Existing
│   │   └── plugin-system-architecture.md # This document
│   ├── development/
│   │   └── plugin-development.md        # NEW: Plugin authoring guide
│   └── examples/
│       └── plugins/                     # NEW: Plugin examples
│
├── scripts/
│   ├── setup.sh
│   ├── build.sh
│   └── build-plugin.sh                  # NEW: Plugin build helper
│
├── Cargo.toml
├── package.json
└── README.md
```

### 5.2 Plugin SDK Structure

```rust
// wasm/crates/plugin-api/src/lib.rs

//! Browser File System Analyzer - Plugin SDK
//!
//! This crate provides the SDK for developing plugins.

pub mod types;
pub mod host;
pub mod prelude;

// Re-export commonly used items
pub use types::*;
pub use host::*;

// Plugin macro to simplify implementation
pub use bfosa_plugin_macro::bfosa_plugin;

/// Result type for plugin operations
pub type PluginResult<T> = std::result::Result<T, PluginError>;

#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("Processing error: {0}")]
    Processing(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}
```

---

## 6. Implementation Phases

### Phase 2.1: Core Plugin Infrastructure (Week 1-2)

| Task | Description | Priority |
|------|-------------|----------|
| 2.1.1 | Create `plugin-api` crate with shared types | P0 |
| 2.1.2 | Implement plugin loader service (TypeScript) | P0 |
| 2.1.3 | Implement plugin validator | P0 |
| 2.1.4 | Create plugin storage service (IndexedDB) | P0 |
| 2.1.5 | Set up Web Worker for plugin execution | P0 |
| 2.1.6 | Implement basic plugin UI (upload, list) | P1 |

**Deliverables**:
- Plugin can be uploaded and validated
- Plugin metadata is displayed
- Plugin is stored in IndexedDB

### Phase 2.2: Plugin Execution Engine (Week 3-4)

| Task | Description | Priority |
|------|-------------|----------|
| 2.2.1 | Implement file → plugin data pipeline | P0 |
| 2.2.2 | Implement plugin execution in Web Worker | P0 |
| 2.2.3 | Add execution timeout and resource limits | P0 |
| 2.2.4 | Implement result aggregation | P0 |
| 2.2.5 | Add progress tracking for plugin execution | P1 |
| 2.2.6 | Error handling and recovery | P0 |

**Deliverables**:
- Plugin processes files with metadata
- Results are collected and displayed
- Errors are handled gracefully

### Phase 2.3: Content Streaming (Week 5)

| Task | Description | Priority |
|------|-------------|----------|
| 2.3.1 | Implement streaming file reader | P1 |
| 2.3.2 | Add chunk-based processing interface | P1 |
| 2.3.3 | Implement memory-efficient large file handling | P1 |
| 2.3.4 | Add streaming progress reporting | P2 |

**Deliverables**:
- Plugins can read file content
- Large files are processed in chunks
- Memory usage remains stable

### Phase 2.4: Example Plugins (Week 6)

| Task | Description | Priority |
|------|-------------|----------|
| 2.4.1 | MD5 Calculator plugin | P1 |
| 2.4.2 | Line Counter plugin | P1 |
| 2.4.3 | Duplicate File Detector plugin | P2 |
| 2.4.4 | Plugin development documentation | P1 |

**Deliverables**:
- 3 example plugins demonstrating different capabilities
- Complete plugin development guide

### Phase 2.5: Polish & Optimization (Week 7-8)

| Task | Description | Priority |
|------|-------------|----------|
| 2.5.1 | Performance optimization | P1 |
| 2.5.2 | Security audit | P0 |
| 2.5.3 | UI/UX improvements | P1 |
| 2.5.4 | Testing and bug fixes | P0 |
| 2.5.5 | Documentation updates | P1 |

**Deliverables**:
- Optimized plugin execution
- Security hardened sandbox
- Complete test coverage

---

## 7. Risk Analysis and Mitigation

### 7.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **WASM Module Size** | Large plugins slow initial load | Medium | Implement lazy loading, code splitting |
| **Memory Leaks** | Plugin doesn't clean up resources | Medium | Enforce cleanup, timeout workers |
| **Browser Compatibility** | Some browsers don't support required APIs | Low | Graceful degradation, clear requirements |
| **Performance Regression** | Plugin execution slows main app | Medium | Web Worker isolation, resource limits |
| **Plugin Crashes** | Plugin takes down the app | Low | Worker isolation, error boundaries |

### 7.2 Security Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Malicious Plugin** | User uploads harmful WASM | Medium | Sandboxing, validation, user warnings |
| **Data Theft** | Plugin exfiltrates user data | Low | No network access in WASM |
| **Resource Exhaustion** | Plugin consumes all memory | Medium | Strict resource limits |
| **Side Channel Attacks** | Plugin extracts information via timing | Low | Constant-time operations where possible |

### 7.3 UX Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Complex Installation** | Users can't install plugins | Medium | Drag & drop, clear UI |
| **Plugin Conflicts** | Multiple plugins interfere | Low | Plugin isolation, clear warnings |
| **Poor Plugin Quality** | Bad user experience | Medium | Plugin ratings, reviews (future) |
| **Compatibility Issues** | Plugin doesn't work with user's files | Medium | Clear requirements, testing tools |

---

## 8. Example Plugin Implementation

### 8.1 MD5 Calculator Plugin

```rust
// plugins/md5-calculator/src/lib.rs

use bfosa_plugin::prelude::*;
use md5::{Md5, Digest};
use serde_json::json;

bfosa_plugin!(
    name: "MD5 Calculator",
    version: "1.0.0",
    description: "Calculate MD5 hash for each file",
    author: "BFOSA Team",
    capabilities: PluginCapabilities {
        metadata_only: false,
        requires_content: true,
        supports_streaming: true,
        max_file_size: 100 * 1024 * 1024, // 100 MB
        file_extensions: vec![],
    }
);

struct Md5Plugin {
    hasher: Md5,
}

impl Md5Plugin {
    fn new() -> Self {
        Self {
            hasher: Md5::new(),
        }
    }
}

impl Plugin for Md5Plugin {
    fn process_file(&mut self, input: FileInput) -> FileOutput {
        let path = input.path.clone();

        // Calculate MD5
        if let Some(content) = input.content {
            self.hasher.update(&content);
            let result = self.hasher.finalize_reset();
            let hash = format!("{:x}", result);

            FileOutput {
                path,
                status: ProcessingStatus::Success,
                data: json!({
                    "hash": hash,
                    "algorithm": "md5"
                }),
                error: None,
            }
        } else {
            FileOutput {
                path,
                status: ProcessingStatus::Skipped,
                data: json!({}),
                error: Some("No content provided".to_string()),
            }
        }
    }

    fn finalize(&self, outputs: Vec<FileOutput>) -> PluginResult {
        let successful = outputs.iter()
            .filter(|o| matches!(o.status, ProcessingStatus::Success))
            .count() as u64;

        PluginResult {
            summary: format!("Calculated MD5 hashes for {} files", successful),
            files_processed: successful,
            files_skipped: 0,
            files_with_errors: 0,
            metrics: json!({
                "total_hashes": successful
            }),
            warnings: vec![],
        }
    }
}
```

### 8.2 Line Counter Plugin

```rust
// plugins/line-counter/src/lib.rs

use bfosa_plugin::prelude::*;
use serde_json::json;

bfosa_plugin!(
    name: "Code Line Counter",
    version: "1.0.0",
    description: "Count lines of code by programming language",
    author: "BFOSA Team",
    capabilities: PluginCapabilities {
        metadata_only: false,
        requires_content: true,
        supports_streaming: false,
        max_file_size: 10 * 1024 * 1024, // 10 MB
        file_extensions: vec![
            "rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h"
        ],
    }
);

struct LineCounterPlugin {
    results: std::collections::HashMap<String, LanguageStats>,
}

struct LanguageStats {
    total_lines: u64,
    code_lines: u64,
    comment_lines: u64,
    blank_lines: u64,
}

impl Plugin for LineCounterPlugin {
    fn process_file(&mut self, input: FileInput) -> FileOutput {
        let path = input.path.clone();
        let ext = input.name
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_string();

        if let Some(content) = input.content {
            let content_str = String::from_utf8_lossy(&content);
            let lines: Vec<&str> = content_str.lines().collect();

            let mut stats = LanguageStats {
                total_lines: lines.len() as u64,
                code_lines: 0,
                comment_lines: 0,
                blank_lines: 0,
            };

            // Simple line counting (can be enhanced)
            for line in &lines {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    stats.blank_lines += 1;
                } else if trimmed.starts_with("//") || trimmed.starts_with("#") {
                    stats.comment_lines += 1;
                } else {
                    stats.code_lines += 1;
                }
            }

            self.results.insert(ext.clone(), stats);

            FileOutput {
                path,
                status: ProcessingStatus::Success,
                data: json!({
                    "extension": ext,
                    "total_lines": stats.total_lines,
                    "code_lines": stats.code_lines,
                    "comment_lines": stats.comment_lines,
                    "blank_lines": stats.blank_lines,
                }),
                error: None,
            }
        } else {
            FileOutput {
                path,
                status: ProcessingStatus::Skipped,
                data: json!({}),
                error: None,
            }
        }
    }

    fn finalize(&self, outputs: Vec<FileOutput>) -> PluginResult {
        let by_language: serde_json::Value = self.results
            .iter()
            .map(|(lang, stats)| {
                (lang.clone(), json!(stats))
            })
            .collect();

        PluginResult {
            summary: format!("Counted lines across {} languages", self.results.len()),
            files_processed: outputs.len() as u64,
            files_skipped: 0,
            files_with_errors: 0,
            metrics: json!({
                "by_language": by_language
            }),
            warnings: vec![],
        }
    }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Testing

```rust
// wasm/crates/plugin-api/tests/validation_test.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plugin_info_validation() {
        let info = PluginInfo {
            id: "test-plugin".to_string(),
            name: "Test Plugin".to_string(),
            version: "1.0.0".to_string(),
            api_version: "2.0.0".to_string(),
            description: "Test".to_string(),
            author: "Test".to_string(),
            capabilities: Default::default(),
            resource_limits: Default::default(),
        };

        assert!(validate_plugin_info(&info).is_ok());
    }

    #[test]
    fn test_invalid_api_version() {
        let info = PluginInfo {
            api_version: "1.0.0".to_string(), // Incompatible
            ..
            Default::default()
        };

        assert!(validate_plugin_info(&info).is_err());
    }
}
```

### 9.2 Integration Testing

```typescript
// web/src/services/plugin/plugin-loader.service.test.ts

import { describe, it, expect } from 'vitest';
import { PluginLoaderService } from './plugin-loader.service';

describe('PluginLoaderService', () => {
  it('should load a valid plugin', async () => {
    const wasmBytes = await loadTestPlugin('md5-calculator.wasm');
    const loader = new PluginLoaderService();
    const plugin = await loader.load(wasmBytes);

    expect(plugin.info.id).toBe('md5-calculator');
    expect(plugin.info.version).toBe('1.0.0');
  });

  it('should reject invalid WASM', async () => {
    const invalidWasm = new ArrayBuffer(100);
    const loader = new PluginLoaderService();

    await expect(loader.load(invalidWasm)).rejects.toThrow();
  });

  it('should enforce resource limits', async () => {
    const wasmBytes = await loadTestPlugin('memory-hog.wasm');
    const loader = new PluginLoaderService({ maxMemory: 1024 });

    await expect(loader.load(wasmBytes)).rejects.toThrow(/exceeds memory limit/);
  });
});
```

### 9.3 E2E Testing

```typescript
// web/e2e/plugin-flow.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Plugin Flow', () => {
  test('upload and use plugin', async ({ page }) => {
    await page.goto('/');

    // Upload plugin
    await page.click('[data-testid="plugin-upload-button"]');
    const fileInput = await page.input('#plugin-file-input');
    await fileInput.setInputFiles('./fixtures/md5-calculator.wasm');

    // Verify plugin appears in list
    await expect(page.locator('[data-testid="plugin-item-md5-calculator"]')).toBeVisible();

    // Select folder
    await page.click('[data-testid="select-folder-button"]');
    // ... select test folder

    // Run analysis with plugin
    await page.check('[data-testid="plugin-checkbox-md5-calculator"]');
    await page.click('[data-testid="analyze-button"]');

    // Wait for results
    await expect(page.locator('[data-testid="analysis-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="plugin-result-md5-calculator"]')).toBeVisible();
  });
});
```

---

## 10. Performance Considerations

### 10.1 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Plugin load time | < 100ms | Time from upload to ready |
| Per-file processing | < 10ms (metadata), < 100ms (small content) | Average execution time |
| Memory overhead | < 50MB per active plugin | Peak WASM memory |
| UI responsiveness | 60fps during processing | Frame time |
| Large file handling | Support files up to 1GB | Streaming mode |

### 10.2 Optimization Strategies

1. **Worker Pool**: Reuse Web Workers for multiple files
2. **Batch Processing**: Process files in batches to reduce overhead
3. **Lazy Loading**: Load plugins only when needed
4. **Memory Pooling**: Reuse WASM memory allocations
5. **Result Streaming**: Send results incrementally rather than all at once

### 10.3 Profiling

```typescript
// Performance monitoring
class PluginPerformanceMonitor {
  private metrics = new Map<string, number[]>();

  startTimer(pluginId: string): void {
    performance.mark(`${pluginId}-start`);
  }

  endTimer(pluginId: string): number {
    performance.mark(`${pluginId}-end`);
    performance.measure(`${pluginId}`, `${pluginId}-start`, `${pluginId}-end`);
    const measure = performance.getEntriesByName(`${pluginId}`)[0];
    return measure.duration;
  }

  reportMetrics(): PerformanceReport {
    // Collect and aggregate metrics
    return {
      avgExecutionTime: this.average('execution'),
      p95ExecutionTime: this.percentile('execution', 95),
      maxMemoryUsage: this.max('memory'),
    };
  }
}
```

---

## 11. Dependencies

### 11.1 Rust Dependencies

```toml
[dependencies]
# Core dependencies (existing)
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "2.0"

# WASM dependencies
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }

# Plugin SDK dependencies
md-5 = "0.10"           # For MD5 example plugin
sha2 = "0.10"           # For SHA example plugin
regex = "1.10"          # For pattern matching
ignore = "0.4"          # For glob patterns

# Build dependencies
bfosa-plugin-macro = { path = "../plugin-macro" }

[dev-dependencies]
wasm-bindgen-test = "0.3"
criterion = "0.5"
```

### 11.2 TypeScript Dependencies

```json
{
  "dependencies": {
    "idb": "^8.0.0",
    "comlink": "^4.4.1",
    "semver": "^7.6.0"
  },
  "devDependencies": {
    "@types/semver": "^7.5.0",
    "vitest": "^2.0.0"
  }
}
```

---

## 12. API Reference

### 12.1 Plugin Manager Service API

```typescript
interface PluginManager {
  // Load a plugin from WASM bytes
  loadPlugin(wasmBytes: ArrayBuffer, options?: LoadOptions): Promise<Plugin>;

  // Unload a plugin
  unloadPlugin(pluginId: string): Promise<void>;

  // Get all loaded plugins
  getPlugins(): Plugin[];

  // Get a specific plugin
  getPlugin(pluginId: string): Plugin | undefined;

  // Execute a plugin on files
  executePlugin(
    pluginId: string,
    files: FileMetadata[],
    options?: ExecutionOptions
  ): Promise<PluginExecutionResult>;

  // Validate a plugin before loading
  validatePlugin(wasmBytes: ArrayBuffer): Promise<ValidationResult>;
}

interface LoadOptions {
  autoStart?: boolean;
  resourceLimits?: Partial<ResourceLimits>;
}

interface ExecutionOptions {
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
  includeContent?: boolean;
  chunkSize?: number;
}
```

### 12.2 Plugin Storage Service API

```typescript
interface PluginStorage {
  // Save plugin to IndexedDB
  savePlugin(plugin: Plugin, wasmBytes: ArrayBuffer): Promise<void>;

  // Load plugin from IndexedDB
  loadPlugin(pluginId: string): Promise<Plugin | null>;

  // Delete plugin from IndexedDB
  deletePlugin(pluginId: string): Promise<void>;

  // List all saved plugins
  listPlugins(): Promise<PluginInfo[]>;

  // Check if plugin exists
  hasPlugin(pluginId: string): Promise<boolean>;
}
```

---

## 13. Future Enhancements

### 13.1 Planned Features (Phase 3+)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Plugin Marketplace** | Central repository for plugins | P1 |
| **Plugin Signing** | Cryptographic verification of plugins | P0 |
| **Plugin Sandbox UI** | Isolated preview of plugin output | P2 |
| **Plugin Chaining** | Output of one plugin feeds another | P2 |
| **Plugin Templates** | Scaffold new plugins quickly | P1 |
| **Visual Plugin Builder** | No-code plugin creation | P3 |

### 13.2 Extension Points

Potential future extension points for plugins:

1. **Custom Result Visualizations**: Plugins can define custom UI components
2. **Export Formats**: Plugins can add export options
3. **Filtering**: Plugins can add file filtering capabilities
4. **Notifications**: Plugins can trigger notifications on conditions

---

## 14. Glossary

| Term | Definition |
|------|------------|
| **ABI** | Application Binary Interface - The contract between host and plugin |
| **WASM** | WebAssembly - Binary instruction format for the web |
| **OPFS** | Origin Private File System - Browser private file storage |
| **Streaming** | Processing data in chunks rather than loading entirely |
| **Sandbox** | Isolated execution environment with restricted capabilities |
| **IndexedDB** | Browser database for persistent storage |

---

## Appendix A: Quick Reference

### A.1 Plugin Template

```rust
use bfosa_plugin::prelude::*;

bfosa_plugin!(
    name: "My Plugin",
    version: "1.0.0",
    description: "Does something useful",
    author: "Your Name",
    capabilities: PluginCapabilities {
        metadata_only: true,
        requires_content: false,
        supports_streaming: false,
        max_file_size: 0,
        file_extensions: vec![],
    }
);

struct MyPlugin;

impl Plugin for MyPlugin {
    fn process_file(&mut self, input: FileInput) -> FileOutput {
        FileOutput {
            path: input.path,
            status: ProcessingStatus::Success,
            data: json!({"result": "value"}),
            error: None,
        }
    }

    fn finalize(&self, outputs: Vec<FileOutput>) -> PluginResult {
        PluginResult {
            summary: "Processed files".to_string(),
            files_processed: outputs.len() as u64,
            files_skipped: 0,
            files_with_errors: 0,
            metrics: json!({}),
            warnings: vec![],
        }
    }
}
```

### A.2 Build Commands

```bash
# Build a plugin
cd plugins/my-plugin
wasm-pack build --target web --out-dir ./pkg

# Optimize WASM size
wasm-opt ./pkg/my_plugin_bg.wasm -O4 -o ./pkg/my_plugin_bg_opt.wasm

# Test plugin locally
pnpm run test:plugin

# Package for distribution
pnpm run package:plugin
```

---

**Document End**

This architecture document provides the technical foundation for implementing a secure, performant, and extensible Dynamic Plugin System for the Browser File System Analyzer. All design decisions prioritize security, user privacy, and developer experience.
