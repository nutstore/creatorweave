# 浏览器交互能力增强方案

> 创建时间：2026-04-30
> 状态：Draft / RFC

## 背景

当前 `web_fetch` 工具（`render: true`）仅支持"只读浏览器"模式——通过隐藏标签页加载页面并提取文本内容。无法进行点击、输入、滚动等交互操作，导致以下场景受限：

- 知网等需要登录的学术平台，无法获取论文详情
- 需要通过验证码的网站
- 需要多步操作（点击 → 等待 → 提取）的页面
- SPA 页面中需要点击切换 Tab / 加载更多的情况

## 目标

在浏览器扩展中新增 `web_interact` 工具，提供类似 Playwright / Puppeteer 的浏览器自动化能力，使 Agent 能够与真实网页进行交互。

## 架构设计

```
┌─────────────────────────────────┐
│         Browser Extension        │
│                                  │
│  ┌───────────┐  ┌─────────────┐ │
│  │ web_fetch  │  │ web_interact │ │
│  │ (已有)     │  │ (新增)       │ │
│  └─────┬─────┘  └──────┬──────┘ │
│        │               │         │
│   ┌────▼───────────────▼─────┐  │
│   │  Chrome Debugger API     │  │
│   │  (CDP Protocol)          │  │
│   └───────────┬──────────────┘  │
└───────────────┼──────────────────┘
                │
          Active Tab / New Tab
                │
          ┌─────▼──────┐
          │  真实网页    │
          │  (可交互)    │
          └────────────┘
```

浏览器扩展通过 **Chrome Debugger Protocol (CDP)** 控制标签页，实现完整的浏览器自动化。

## API 设计

### web_interact 工具

#### 1. 页面导航

```json
{
  "action": "navigate",
  "url": "https://example.com",
  "waitUntil": "networkidle"  // load | domcontentloaded | networkidle
}
```

#### 2. 元素交互

```json
{
  "action": "click",
  "selector": "#login-button",
  "options": { "delay": 100 }
}
```

```json
{
  "action": "type",
  "selector": "#search-input",
  "text": "人工智能",
  "options": { "clear": true, "delay": 50 }
}
```

```json
{
  "action": "scroll",
  "x": 0,
  "y": 500
}
```

```json
{
  "action": "select",
  "selector": "#dropdown",
  "value": "option1"
}
```

#### 3. 等待与状态

```json
{
  "action": "wait",
  "selector": ".result-item",
  "timeout": 5000,
  "state": "visible"  // visible | hidden | attached | detached
}
```

```json
{
  "action": "wait",
  "timeout": 2000  // 简单等待
}
```

#### 4. 内容提取

```json
{
  "action": "extract",
  "selector": ".article-content",
  "format": "text"  // text | html | attribute
}
```

#### 5. 截图

```json
{
  "action": "screenshot",
  "selector": "#captcha-image",  // 可选，截取特定元素
  "fullPage": false
}
```

#### 6. JavaScript 执行

```json
{
  "action": "evaluate",
  "expression": "document.querySelectorAll('.item').length"
}
```

#### 7. Cookie / 状态管理

```json
{
  "action": "getCookies",
  "domain": "cnki.net"
}
```

```json
{
  "action": "setCookies",
  "cookies": [{ "name": "session", "value": "xxx", "domain": "cnki.net" }]
}
```

### 会话模式

支持在同一个标签页中执行多步操作，保持状态连续：

```
工具调用序列（共享同一 tab session）：

1. web_interact(action: "navigate", url: "https://kns.cnki.net/...")
2. web_interact(action: "wait", selector: "#search-input")
3. web_interact(action: "type", selector: "#search-input", text: "人工智能")
4. web_interact(action: "click", selector: "#search-btn")
5. web_interact(action: "wait", selector: ".result-table")
6. web_interact(action: "click", selector: ".result-table tr:first-child a")
7. web_interact(action: "wait", selector: ".article-detail")
8. web_interact(action: "extract", selector: ".article-detail")
```

## 使用场景示例

### 场景 1：知网论文详情获取

```
用户: "帮我去知网搜索人工智能，打开第一篇论文"

Agent:
1. web_interact → navigate 到知网
2. web_interact → type 搜索关键词
3. web_interact → click 搜索按钮
4. web_interact → wait 搜索结果
5. web_interact → click 第一篇论文
6. (可能遇到验证码)
7. web_interact → screenshot → 分析验证码
8. web_interact → 拖动/点击通过验证
9. web_interact → extract 论文详情
```

### 场景 2：SPA 页面交互

```
用户: "帮我把这个网站的表格数据全部抓下来"

Agent:
1. web_interact → navigate 加载页面
2. web_interact → click "加载更多" 按钮
3. web_interact → wait 新数据加载
4. 重复 2-3 直到没有更多
5. web_interact → extract 全部数据
```

### 场景 3：表单提交

```
用户: "帮我填写这个问卷"

Agent:
1. web_interact → navigate 到问卷页面
2. web_interact → type 填写文本字段
3. web_interact → click 选择单选/复选框
4. web_interact → select 下拉选择
5. web_interact → click 提交按钮
```

## 核心挑战与对策

### 1. 验证码问题

| 类型 | 对策 |
|------|------|
| 图片验证码 | `screenshot` → LLM 识别 → 自动填写 |
| 滑块验证码 | `screenshot` 分析位置 → `evaluate` 执行拖动 JS |
| reCAPTCHA | 难以自动通过，可能需要用户手动介入 |
| 短信验证码 | 提示用户手动输入 |

### 2. 超时与错误处理

```
- 每步操作设置合理超时（默认 5s，最大 30s）
- 元素不存在时返回明确错误信息
- 页面加载失败时自动重试（最多 2 次）
- 支持回退操作（如返回上一页）
```

### 3. 安全与权限

```
- 交互操作需要用户明确授权
- 敏感操作（登录、提交表单）需二次确认
- 不自动保存密码到 Agent 记忆
- 标签页操作对用户可见（不用隐藏标签）
```

### 4. 性能与 Token 消耗

```
- screenshot 图片压缩后再发送给 LLM
- 优先用 selector + extract 文本，减少截图使用
- 多步操作合并，减少 LLM 往返次数
- 提供批量操作接口（如一次性填写多个字段）
```

### 5. 会话管理

```
- 支持 tab session ID，多步操作共享同一标签页
- 空闲超时自动关闭标签页（默认 5 分钟）
- 支持同时操作多个标签页（多任务并行）
- Cookie / localStorage 跨步骤持久化
```

## 实现路径建议

### Phase 1：基础交互（MVP）

- [ ] Chrome Debugger API 集成
- [ ] 基础操作：navigate, click, type, wait, extract
- [ ] Tab Session 管理
- [ ] 基本错误处理

### Phase 2：视觉能力

- [ ] screenshot 支持
- [ ] 验证码识别（图片验证码）
- [ ] 基于视觉的元素定位

### Phase 3：高级能力

- [ ] JS evaluate 执行
- [ ] Cookie 管理
- [ ] 文件上传/下载
- [ ] 多标签页并行操作
- [ ] 操作录制与回放

## 参考

- [Chrome Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Playwright](https://playwright.dev/)
- [Puppeteer](https://pptr.dev/)
