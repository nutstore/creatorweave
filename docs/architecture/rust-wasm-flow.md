# Rust/WASM 数据流设计

## 架构概览

本项目使用 Rust 编译为 WebAssembly 来处理计算密集型任务。以下是完整的数据流设计。

## 三层架构

```
┌─────────────────────────────────────┐
│   JavaScript (前端业务逻辑)          │
│   - 调用浏览器 API                   │
│   - UI 交互                          │
│   - 数据收集                         │
└─────────────────────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   WASM Bindings (wasm-bindgen)      │
│   - JS ↔ Rust 桥接                  │
│   - 类型转换                         │
│   - 导出接口                         │
└─────────────────────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   Core Library (纯 Rust)            │
│   - 累加算法                         │
│   - 统计计算                         │
│   - 数据结构                         │
└─────────────────────────────────────┘
```

## 数据跨边界传递

### JavaScript → WASM

```typescript
// JavaScript 端
const fileSizes = [1024, 2048, 4096];  // Array<number>
const analyzer = new FileAnalyzer();
analyzer.add_files(fileSizes);
```

```rust
// Rust 端 (wasm-bindings)
#[wasm_bindgen]
pub fn add_files(&mut self, sizes: &[u64]) {
    // wasm-bindgen 自动转换:
    // JS Array<number> → Rust &[u64]
    self.accumulator.add_batch(sizes);
}
```

### WASM → JavaScript

```rust
// Rust 端返回
#[wasm_bindgen]
pub fn get_total(&self) -> u64 {
    self.accumulator.total()
    // wasm-bindgen 自动转换:
    // Rust u64 → JS Number (注意精度限制)
}
```

```typescript
// JavaScript 端接收
const total = analyzer.get_total();  // Number
console.log(`Total: ${total} bytes`);
```

## 类型映射表

| JavaScript | Rust | WASM |
|-----------|------|------|
| `number` | `u32/i32/f32/f64` | 直接映射 |
| `number` | `u64/i64` | ⚠️ 精度丢失 (> 2^53) |
| `Array<T>` | `&[T]` / `Vec<T>` | 自动转换 |
| `object` | `struct` | serde-wasm-bindgen |
| `string` | `String` / `&str` | 自动转换 |

## 性能考虑

### 内存传递

**❌ 低效方式**：
```rust
// 逐个添加（多次跨边界调用）
pub fn add_file(&mut self, size: u64) {
    self.accumulator.add(size);
}
```

**✅ 高效方式**：
```rust
// 批量添加（单次跨边界调用）
pub fn add_files(&mut self, sizes: &[u64]) {
    self.accumulator.add_batch(sizes);
}
```

### 大数据处理

对于大型文件列表：
1. 使用 `Iterator` 惰性处理
2. 分批传递数据（避免峰值内存）
3. 在 Web Worker 中处理（避免阻塞主线程）

## 错误处理

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
// JavaScript 端
try {
    const result = analyzer.calculate();
    console.log(result);
} catch (error) {
    console.error(error.message);  // "No files"
}
```

## 导出接口清单

### FileAnalyzer 类

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `constructor()` | - | `FileAnalyzer` | 创建新实例 |
| `add_file(size)` | `u64` | `void` | 添加单个文件大小 |
| `add_files(sizes)` | `[u64]` | `void` | 批量添加文件大小 |
| `get_total()` | - | `u64` | 获取总大小 |
| `get_count()` | - | `u64` | 获取文件数量 |
| `get_average()` | - | `f64` | 获取平均大小 |
| `reset()` | - | `void` | 重置状态 |

### 便利函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `calculate_total_size(sizes)` | `[u64]` | `u64` | 直接计算总和 |
| `calculate_average_size(sizes)` | `[u64]` | `f64` | 直接计算平均值 |
