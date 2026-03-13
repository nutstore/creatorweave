# CreatorWeave - Plugin Development Guide

This guide explains how to create, build, and integrate plugins for the CreatorWeave.

## Table of Contents

- [Overview](#overview)
- [Plugin API v2.0.0](#plugin-api-v200)
- [Quick Start](#quick-start)
- [Plugin Structure](#plugin-structure)
- [Required Exports](#required-exports)
- [Optional Exports](#optional-exports)
- [Type Definitions](#type-definitions)
- [Example Plugins](#example-plugins)
- [Building Plugins](#building-plugins)
- [Testing Plugins](#testing-plugins)
- [Security Considerations](#security-considerations)
- [Performance Guidelines](#performance-guidelines)

---

## Overview

Plugins are WASM modules that extend the file analysis capabilities of the CreatorWeave. Each plugin runs in an isolated Web Worker for security and performance.

### Key Features

- **Language**: Rust with `wasm-bindgen`
- **API Version**: 2.0.0 (String-based, automatic memory management)
- **Execution**: Isolated Web Workers
- **Communication**: JSON strings over postMessage
- **Security**: No DOM access, no network access, resource limits enforced

---

## Plugin API v2.0.0

The v2.0.0 API uses **String types** for all communication. This allows `wasm-bindgen` to handle memory management automatically, making plugin development safer and simpler.

### Why String-based?

- **Automatic memory management**: No manual allocation/deallocation
- **Type safety**: serde handles JSON serialization/deserialization
- **Error handling**: Parse errors are caught and returned gracefully
- **Simplicity**: Focus on plugin logic, not memory management

---

## Quick Start

### 1. Create a new Rust project

```bash
cargo new --lib my-plugin
cd my-plugin
```

### 2. Configure Cargo.toml

```toml
[package]
name = "my-plugin"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[package.metadata.wasm-pack.profile.release]
wasm-opt = false

[profile.release]
opt-level = "s"
lto = true
```

### 3. Implement the plugin

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[wasm_bindgen]
pub fn get_plugin_info() -> String {
    // Return plugin metadata as JSON string
    // See Type Definitions below
}

#[wasm_bindgen]
pub fn process_file(input_json: String) -> String {
    // Process a single file
    // Return FileOutput as JSON string
}

#[wasm_bindgen]
pub fn finalize(outputs_json: String) -> String {
    // Aggregate results from all files
    // Return PluginResult as JSON string
}

#[wasm_bindgen]
pub fn cleanup() {
    // Cleanup resources (no-op with wasm-bindgen)
}
```

### 4. Build the plugin

```bash
wasm-pack build --target web --out-dir ../../../../web/public/wasm/plugins/my-plugin
```

---

## Plugin Structure

### Directory Layout

```
my-plugin/
├── Cargo.toml          # Package configuration
├── build.sh            # Build script (optional)
└── src/
    └── lib.rs          # Plugin implementation
```

### Example: Line Counter Plugin

```
wasm/crates/example-plugins/line-counter/
├── Cargo.toml
├── build.sh
└── src/
    └── lib.rs          # Counts lines, characters, blank lines
```

---

## Required Exports

All plugins MUST export these functions using `#[wasm_bindgen]`:

### `get_plugin_info() -> String`

Returns plugin metadata as a JSON string.

```rust
#[wasm_bindgen]
pub fn get_plugin_info() -> String {
    let info = json!({
        "id": "my-plugin",
        "name": "My Plugin",
        "version": "1.0.0",
        "api_version": "2.0.0",
        "description": "Does something cool",
        "author": "Your Name",
        "capabilities": {
            "metadata_only": false,
            "requires_content": true,
            "supports_streaming": false,
            "max_file_size": 10485760,
            "file_extensions": [".txt", ".md"]
        },
        "resource_limits": {
            "max_memory": 16777216,
            "max_execution_time": 5000,
            "worker_count": 1
        }
    });
    info.to_string()
}
```

### `process_file(input_json: String) -> String`

Process a single file. Receives `FileInput` as JSON string, returns `FileOutput` as JSON string.

```rust
#[wasm_bindgen]
pub fn process_file(input_json: String) -> String {
    // Parse input
    let file_input: FileInput = match serde_json::from_str(&input_json) {
        Ok(input) => input,
        Err(e) => {
            return json!({
                "path": "unknown",
                "status": "Error",
                "data": {},
                "error": format!("JSON parse error: {}", e)
            }).to_string();
        }
    };

    // Get content
    let content = file_input.content.unwrap_or_default();

    // Process file...
    let result = process_content(&content);

    // Return output
    json!({
        "path": file_input.path,
        "status": "Success",
        "data": result,
        "error": null
    }).to_string()
}
```

### `finalize(outputs_json: String) -> String`

Aggregate results from all processed files. Receives array of `FileOutput` as JSON string, returns `PluginResult` as JSON string.

```rust
#[wasm_bindgen]
pub fn finalize(outputs_json: String) -> String {
    let outputs: Vec<FileOutput> = match serde_json::from_str(&outputs_json) {
        Ok(o) => o,
        Err(e) => {
            return json!({
                "filesProcessed": 0,
                "filesSkipped": 0,
                "filesWithErrors": 0,
                "summary": format!("Error: {}", e),
                "metrics": {},
                "warnings": []
            }).to_string();
        }
    };

    // Aggregate results...
    let total_processed = outputs.len();

    json!({
        "filesProcessed": total_processed,
        "filesSkipped": 0,
        "filesWithErrors": 0,
        "summary": format!("Processed {} files", total_processed),
        "metrics": {},
        "warnings": []
    }).to_string()
}
```

### `cleanup()`

Cleanup resources. With wasm-bindgen, this is typically a no-op since memory is managed automatically.

```rust
#[wasm_bindgen]
pub fn cleanup() {
    // No-op: wasm-bindgen handles memory automatically
}
```

---

## Optional Exports

Plugins MAY export these functions for enhanced functionality:

### `stream_init() -> String`

Initialize streaming session for large file processing.

```rust
#[wasm_bindgen]
pub fn stream_init() -> String {
    // Initialize streaming state
    json!({ "status": "ready" }).to_string()
}
```

### `stream_chunk(chunk_json: String) -> String`

Process a chunk of data during streaming.

```rust
#[wasm_bindgen]
pub fn stream_chunk(chunk_json: String) -> String {
    // Process chunk
    json!({ "bytesProcessed": 1024 }).to_string()
}
```

### `stream_complete() -> String`

Finalize streaming session and return aggregated result.

```rust
#[wasm_bindgen]
pub fn stream_complete() -> String {
    // Return final result
    json!({ "status": "complete" }).to_string()
}
```

---

## Type Definitions

### PluginInfo

```rust
pub struct PluginInfo {
    pub id: String,           // Unique identifier (e.g., "md5-calculator")
    pub name: String,         // Human-readable name
    pub version: String,      // Semver version
    pub api_version: String,  // Required CreatorWeave API version (must be "2.0.0")
    pub description: String,  // Short description
    pub author: String,       // Plugin author/maintainer
    pub capabilities: PluginCapabilities,
    pub resource_limits: ResourceLimits,
}
```

### PluginCapabilities

```rust
pub struct PluginCapabilities {
    pub metadata_only: bool,        // true = only needs file metadata
    pub requires_content: bool,     // true = needs file content
    pub supports_streaming: bool,   // true = supports chunked processing
    pub max_file_size: u64,         // Max file size (0 = unlimited)
    pub file_extensions: Vec<String>, // Supported extensions (empty = all)
}
```

### ResourceLimits

```rust
pub struct ResourceLimits {
    pub max_memory: u64,            // Max memory in bytes
    pub max_execution_time: u32,    // Max execution time per file (ms)
    pub worker_count: u32,          // Number of workers requested
}
```

### FileInput

```rust
pub struct FileInput {
    pub name: String,               // File name
    pub path: String,               // Full file path
    pub size: u64,                  // File size in bytes
    pub mime_type: Option<String>,  // MIME type if available
    pub last_modified: u64,         // Last modified timestamp
    pub content: Option<Vec<u8>>,   // File content (null if metadata_only=true)
}
```

### FileOutput

```rust
pub struct FileOutput {
    pub path: String,               // File path (matches input)
    pub status: String,             // "Success", "Skipped", or "Error"
    pub data: serde_json::Value,    // Plugin-specific result data
    pub error: Option<String>,      // Error message if status is "Error"
}
```

### PluginResult

```rust
pub struct PluginResult {
    pub files_processed: u64,       // Number of successfully processed files
    pub files_skipped: u64,         // Number of skipped files
    pub files_with_errors: u64,     // Number of files with errors
    pub summary: String,            // Human-readable summary
    pub metrics: serde_json::Value, // Plugin-specific metrics
    pub warnings: Vec<String>,      // Any warnings generated
}
```

---

## Example Plugins

### Line Counter Plugin

Counts lines, characters, and blank lines in text files.

**Location**: `wasm/crates/example-plugins/line-counter/`

**Capabilities**:
- Supports streaming for large files
- Handles 20+ file extensions
- Returns: `totalLines`, `blankLines`, `nonBlankLines`, `charsWithSpaces`, `charsNoSpaces`

### MD5 Calculator Plugin

Calculates MD5 hash for files.

**Location**: `wasm/crates/example-plugins/md5-calculator/`

**Capabilities**:
- Processes any file type
- Returns: `md5` hash, `algorithm`

---

## Building Plugins

### Using wasm-pack

```bash
wasm-pack build --target web --out-dir path/to/web/public/wasm/plugins/plugin-name
```

### Build Script

Create `build.sh`:

```bash
#!/bin/bash
set -e

echo "Building my-plugin..."
wasm-pack build --target web --out-dir ../../../../web/public/wasm/plugins/my-plugin

echo "Build complete!"
```

Make it executable:

```bash
chmod +x build.sh
./build.sh
```

### Output Files

After building, you'll get:

```
web/public/wasm/plugins/my-plugin/
├── my_plugin_bg.wasm         # The WASM binary
├── my_plugin_bg.wasm.d.ts    # TypeScript definitions
├── my_plugin.js              # JavaScript glue code
├── my_plugin.d.ts            # Package TypeScript definitions
└── package.json              # NPM package info
```

---

## Testing Plugins

### Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_file() {
        let input = json!({
            "name": "test.txt",
            "path": "/test.txt",
            "size": 100,
            "content": b"Hello\nWorld\n".to_vec()
        }).to_string();

        let output = process_file(input);
        let result: FileOutput = serde_json::from_str(&output).unwrap();

        assert_eq!(result.status, "Success");
    }
}
```

Run with:

```bash
cargo test
```

### Integration Tests (JavaScript)

Create a test file in `web/src/services/plugin-*.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('My Plugin', () => {
  it('should process files correctly', async () => {
    const loader = getPluginLoader()
    await loader.loadPluginFromUrl('/wasm/plugins/my-plugin/my_plugin_bg.wasm')

    const result = await loader.processFile({
      name: 'test.txt',
      content: new Uint8Array([72, 101, 108, 108, 111])
    })

    expect(result.status).toBe('Success')
  })
})
```

---

## Security Considerations

### What Plugins CAN Do

- Process file content
- Perform computations
- Return structured data
- Use streaming for large files

### What Plugins CANNOT Do

- Access the DOM
- Make network requests
- Access local files directly
- Access browser APIs
- Execute arbitrary code

### Resource Limits

The host enforces these limits:

| Resource | Default | Maximum |
|----------|---------|---------|
| Memory | 16 MB | 100 MB |
| Execution Time | 5s/file | 60s/file |
| Workers | 1 | 4 |

---

## Performance Guidelines

### Do's

- Use streaming for files > 10MB
- Minimize memory allocations
- Use efficient algorithms
- Set appropriate resource limits

### Don'ts

- Load entire files into memory if streaming is possible
- Use blocking operations
- Set excessively high resource limits
- Process files your plugin doesn't support

### Performance Targets

| Operation | Target |
|-----------|--------|
| Plugin load | < 200ms |
| File processing | < 50ms |
| Cleanup | < 10ms |

---

## Additional Resources

- [wasm-bindgen documentation](https://rustwasm.github.io/wasm-bindgen/)
- [serde documentation](https://serde.rs/)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Project documentation](../../docs/development/phase2-development-plan.md)
