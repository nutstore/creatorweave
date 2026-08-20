---
title: Rust/WASM Design
order: 203
---

# Rust/WASM Data Flow Design

## Architecture Overview

This project compiles Rust to WebAssembly to handle compute-intensive tasks. Below is the complete data flow design.

## Three-Layer Architecture

```
┌─────────────────────────────────────┐
│   JavaScript (frontend business)    │
│   - calls browser APIs              │
│   - UI interaction                  │
│   - data collection                 │
└─────────────────────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   WASM Bindings (wasm-bindgen)      │
│   - JS ↔ Rust bridge                │
│   - type conversion                 │
│   - exported interfaces             │
└─────────────────────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   Core Library (pure Rust)          │
│   - accumulation algorithms         │
│   - statistical computation         │
│   - data structures                 │
└─────────────────────────────────────┘
```

## Passing Data Across the Boundary

### JavaScript → WASM

```typescript
// JavaScript side
const fileSizes = [1024, 2048, 4096];  // Array<number>
const analyzer = new FileAnalyzer();
analyzer.add_files(fileSizes);
```

```rust
// Rust side (wasm-bindings)
#[wasm_bindgen]
pub fn add_files(&mut self, sizes: &[u64]) {
    // wasm-bindgen converts automatically:
    // JS Array<number> → Rust &[u64]
    self.accumulator.add_batch(sizes);
}
```

### WASM → JavaScript

```rust
// Rust side returns
#[wasm_bindgen]
pub fn get_total(&self) -> u64 {
    self.accumulator.total()
    // wasm-bindgen converts automatically:
    // Rust u64 → JS Number (mind the precision limit)
}
```

```typescript
// JavaScript side receives
const total = analyzer.get_total();  // Number
console.log(`Total: ${total} bytes`);
```

## Type Mapping Table

| JavaScript | Rust | WASM |
|-----------|------|------|
| `number` | `u32/i32/f32/f64` | direct mapping |
| `number` | `u64/i64` | ⚠️ precision loss (> 2^53) |
| `Array<T>` | `&[T]` / `Vec<T>` | automatic conversion |
| `object` | `struct` | serde-wasm-bindgen |
| `string` | `String` / `&str` | automatic conversion |

## Performance Considerations

### Memory transfer

**❌ Inefficient**:
```rust
// Add one at a time (multiple boundary crossings)
pub fn add_file(&mut self, size: u64) {
    self.accumulator.add(size);
}
```

**✅ Efficient**:
```rust
// Batch add (single boundary crossing)
pub fn add_files(&mut self, sizes: &[u64]) {
    self.accumulator.add_batch(sizes);
}
```

### Handling large data

For large file lists:
1. Use `Iterator` for lazy processing
2. Pass data in batches (avoid peak memory)
3. Process in a Web Worker (avoid blocking the main thread)

## Error Handling

### Rust → JS

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn calculate(&mut self) -> Result<u64, JsValue> {
    if self.count == 0 {
        return Err(JsValue::from_str("No files"));
    }
    Ok(self.total())
}
```

```typescript
// JavaScript side
try {
  const result = analyzer.calculate();
  console.log(result);
} catch (error) {
  console.error(error.message);  // "No files"
}
```

## Exported Interface Reference

### FileAnalyzer class

| Method | Parameters | Returns | Description |
|------|------|--------|------|
| `constructor()` | - | `FileAnalyzer` | creates a new instance |
| `add_file(size)` | `u64` | `void` | adds a single file size |
| `add_files(sizes)` | `[u64]` | `void` | adds file sizes in batch |
| `get_total()` | - | `u64` | gets the total size |
| `get_count()` | - | `u64` | gets the file count |
| `get_average()` | - | `f64` | gets the average size |
| `reset()` | - | `void` | resets the state |

### Convenience functions

| Function | Parameters | Returns | Description |
|------|------|--------|------|
| `calculate_total_size(sizes)` | `[u64]` | `u64` | computes the sum directly |
| `calculate_average_size(sizes)` | `[u64]` | `f64` | computes the average directly |
