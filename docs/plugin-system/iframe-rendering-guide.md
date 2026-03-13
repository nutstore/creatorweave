# iframe 渲染方案完整说明

## 📋 概述

插件可以返回自定义 HTML，宿主应用使用 `PluginHTMLRenderer` 组件在安全的 iframe 中渲染。

## 🔄 数据流程

```
┌─────────────┐         ┌─────────────┐         ┌──────────────┐
│   WASM      │ return  │   Host      │ render  │    iframe    │
│   Plugin    │────────▶│   App       │────────▶│   (HTML)     │
│             │  JSON   │             │  srcDoc │              │
└─────────────┘         └─────────────┘         └──────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Styled Output  │
                                              └──────────────────┘
```

## 🎨 插件端：返回 HTML

### finalize() 返回格式

```rust
#[wasm_bindgen]
pub fn finalize(outputs_json: String) -> String {
    let html = r#"
        <div class="creatorweave-card">
            <h3>Results</h3>
            <div class="creatorweave-metrics">
                <div class="creatorweave-metric">
                    <div class="creatorweave-metric-label">Files</div>
                    <div class="creatorweave-metric-value">42</div>
                </div>
            </div>
        </div>
    "#;

    json!({
        "render_type": "html",     // 必须为 "html"
        "content": html,            // HTML 内容
        "height": 500,              // 可选：建议 iframe 高度
        "title": "My Results"       // 可选：标题
    }).to_string()
}
```

## 🏠 宿主端：使用渲染器

```tsx
import { PluginHTMLRenderer } from '@/components/plugins/PluginHTMLRenderer'

function MyComponent() {
  const pluginResult = {
    render_type: "html",
    content: "...",  // 从插件获取
    height: 500,
    title: "Analysis Results"
  }

  return (
    <PluginHTMLRenderer
      result={pluginResult}
      onAction={(action, data) => {
        if (action === 'export') {
          // 处理插件触发的动作
          console.log('Export:', data)
        }
      }}
    />
  )
}
```

## 🎨 可用的 CSS 类

插件 HTML 可以使用以下预定义样式：

### 布局组件

```html
<!-- 卡片 -->
<div class="creatorweave-card">Content</div>

<!-- 指标网格 -->
<div class="creatorweave-metrics">
  <div class="creatorweave-metric">...</div>
</div>
```

### 指标

```html
<div class="creatorweave-metric">
  <div class="creatorweave-metric-label">Label</div>
  <div class="creatorweave-metric-value">Value</div>
</div>
```

### 表格

```html
<table class="creatorweave-table">
  <thead>
    <tr>
      <th>Column 1</th>
      <th>Column 2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Data 1</td>
      <td>Data 2</td>
    </tr>
  </tbody>
</table>
```

### 徽章

```html
<span class="creatorweave-badge creatorweave-badge-success">Success</span>
<span class="creatorweave-badge creatorweave-badge-warning">Warning</span>
<span class="creatorweave-badge creatorweave-badge-error">Error</span>
<span class="creatorweave-badge creatorweave-badge-info">Info</span>
```

### 按钮

```html
<button class="creatorweave-btn creatorweave-btn-primary">Primary</button>
<button class="creatorweave-btn creatorweave-btn-secondary">Secondary</button>
```

### 进度条

```html
<div class="creatorweave-progress">
  <div class="creatorweave-progress-bar" style="width: 75%"></div>
</div>
```

### 标签页

```html
<div class="creatorweave-tabs">
  <button class="creatorweave-tab active">Tab 1</button>
  <button class="creatorweave-tab">Tab 2</button>
</div>
```

### 手风琴

```html
<div class="creatorweave-accordion-item">
  <button class="creatorweave-accordion-header">
    Title
  </button>
  <div class="creatorweave-accordion-content">
    Content
  </div>
</div>
```

## 🔌 父子通信

### 从 iframe 发送消息到父页面

```html
<button onclick="bfsaSend('action', {action: 'export', format: 'json'})">
  Export
</button>
```

### 从父页面发送消息到 iframe

```tsx
const sendToIframe = (type: string, data: unknown) => {
  iframeRef.current?.contentWindow?.postMessage({ type, data }, '*')
}
```

## 🔒 安全特性

| 特性 | 说明 |
|------|------|
| `sandbox` 属性 | 限制 iframe 权限，仅允许 `allow-scripts` 和 `allow-same-origin` |
| `srcDoc` | 使用 srcDoc 而非 src，避免导航到外部 URL |
| 样式隔离 | CSS 变量定义，不污染全局样式 |
| 消息验证 | 验证 `event.source` 是否为 iframe |

## 📝 完整示例

查看 `html-demo` 插件获取完整示例：

```bash
# 构建示例插件
cd wasm/crates/example-plugins/html-demo
wasm-pack build --target web --out-dir ../../../../web/public/wasm/html-demo
```

## 🎯 最佳实践

1. **使用预定义样式** - 保持 UI 一致性
2. **提供合理高度** - 避免滚动条或过多空白
3. **响应式设计** - 使用百分比和 flexbox
4. **错误处理** - 返回错误信息的 HTML
5. **交互反馈** - 使用 bfsaSend 通知父页面操作

## 🚨 注意事项

- iframe 中无法直接访问父页面的 DOM
- 外部资源（图片、字体）需要用 data URI 或允许访问
- 避免在 HTML 中写复杂的内联脚本
- CSS 选择器不要过于具体，避免冲突
