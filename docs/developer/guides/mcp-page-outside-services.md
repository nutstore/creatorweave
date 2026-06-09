---
title: 页面外 MCP 服务接入指南
order: 140
---

# 页面外 MCP 服务接入指南

本文说明如何将 **页面外的 MCP 服务** 接入 CreatorWeave 当前平台，包括：

- Figma Remote MCP
- OpenPencil 本地 MCP
- 其他不在当前页面上下文内、需要通过浏览器插件代理访问的 MCP 服务

## 1. 先明确边界

当前平台里有两类能力来源，必须分开理解：

### 1.1 WebMCP

WebMCP 指的是 **当前页面上下文直接暴露** 的 MCP 能力。

特点：

- 工具发现和调用发生在页面上下文内
- 适合接入当前网站自身暴露的工具能力
- 不用于连接独立运行的远端或本地 MCP Server

### 1.2 页面外的 MCP 服务

页面外的 MCP 服务指：**不属于当前页面上下文**、独立存在的 MCP Server。

例如：

- Figma Remote MCP：`https://mcp.figma.com/mcp`
- OpenPencil 本地 MCP（桌面应用启动的本地服务）
- 其他本地/远端独立 MCP Server

特点：

- 页面不能直接依赖浏览器内 `fetch` 去访问它们
- 必须通过 **浏览器插件 bridge** 代理请求
- 这样才能统一处理：
  - 跨域限制
  - 本地地址访问
  - header / token 透传
  - SSE / streamable HTTP 流式响应

---

## 2. 当前平台的接入原则

当前实现已经确定为：

> **所有页面外的 MCP 服务，都必须通过浏览器插件 bridge 代理访问。**

也就是说：

- Web 页面 **不直接 fetch** 页面外 MCP 服务
- `mcp-client.service.ts` 统一通过 `window.__agentWeb` bridge 发起请求
- 插件负责真正的网络访问与流式转发

这条原则对以下场景都适用：

- Figma Remote
- OpenPencil 本地 MCP
- 未来新增的页面外 MCP 服务

---

## 3. 相关代码位置

> 以下路径均相对仓库根目录 `creatorweave/`。

### Web 侧

- `web/src/services/mcp-client.service.ts`
  - 正式 MCP client
  - 负责 initialize / tools/list / tools/call / task 轮询
  - 只走插件 bridge，不走页面直连

- `web/src/mcp/`
  - MCP 领域模块目录
  - 与页面外 MCP 服务接入直接相关的关键文件包括：
    - `web/src/mcp/mcp-manager.ts`
    - `web/src/mcp/preset-providers.ts`
    - `web/src/mcp/mcp-types.ts`

- `web/src/components/mcp/MCPSettings.tsx`
  - MCP 设置 UI
  - 添加 server、编辑配置、连接、查看状态

### 浏览器插件侧

- `browser-extension/entrypoints/injected.content.ts`
  - 页面内注入 `window.__agentWeb`
  - 暴露：
    - `mcpProxyFetch(...)`
    - `mcpProxyFetchStream(...)`

- `browser-extension/entrypoints/content.ts`
  - 页面与 background 之间的 relay

- `browser-extension/entrypoints/background.ts`
  - 真正执行网络请求
  - 处理：
    - `mcp_proxy_fetch`
    - `mcp_proxy_fetch_stream`

---

## 4. 请求链路

页面外 MCP 服务的调用链路如下：

```text
MCPSettings / MCPManager / MCPClientService
  -> window.__agentWeb.mcpProxyFetch(...) / mcpProxyFetchStream(...)
  -> injected.content.ts
  -> content.ts relay
  -> background.ts
  -> 目标 MCP Server
```

### 4.1 streamable HTTP

适用于标准 HTTP 请求/响应场景。

当前实现中：

- `server.transport === 'streamable_http'`
- 通过 `mcpProxyFetch(...)` 走插件代理

### 4.2 SSE

适用于服务端通过 SSE 返回 JSON-RPC 响应流。

当前实现中：

- `server.transport === 'sse'`
- 通过 `mcpProxyFetchStream(...)` 走插件流式代理
- 插件会先发送 `response_start`，再发送 `chunk` / `done` / `error`

---

## 5. 为什么必须走插件 bridge

### 5.1 跨域问题

以 OpenPencil 为例：

- MCP HTTP 服务由桌面应用自动拉起
- 服务通常暴露在本地地址，如 `127.0.0.1:7601`
- 浏览器页面直接访问这类本地地址时，容易遇到 CORS / 本地环回访问限制

这也是 OpenPencil 在浏览器里不适合页面直接接入的核心原因。

### 5.2 页面能力边界

即使远端服务本身可访问，也不应让页面自己承担：

- token 管理
- SSE 细节兼容
- 本地地址探测
- timeout / streaming 转发

这些都更适合由插件 bridge 统一处理。

### 5.3 平台架构一致性

统一走 bridge 后：

- WebMCP 与页面外 MCP 服务的边界清晰
- Web 侧 MCP client 实现更稳定
- 插件可以独立演进代理能力
- 新服务接入步骤更可复用

---

## 6. Figma Remote 接入步骤

Figma Remote 是当前最直接可接入的页面外 MCP 服务。

### 6.1 服务信息

- Endpoint: `https://mcp.figma.com/mcp`
- 推荐 transport: `streamable_http`
- 需要 Figma token / 官方 MCP 授权能力

### 6.2 平台接入方式

当前项目已经提供 Figma preset：

- 配置位置：`web/src/mcp/preset-providers.ts`
- UI 入口：`web/src/components/mcp/MCPSettings.tsx`

### 6.3 配置步骤

1. 打开 MCP Settings
2. 使用 **Quick add Figma preset**，或手动新增 server
3. 填写：
   - ID：`figma`
   - URL：`https://mcp.figma.com/mcp`
   - Transport：`streamable_http`
   - Auth Token：填写 Figma token
4. 保存配置
5. 点击 Connect
6. 通过插件 bridge 完成 initialize / tools/list

### 6.4 常见失败原因

- 浏览器插件不存在
- 插件版本过旧，不支持页面外 MCP 代理
- Figma token 缺失、过期或权限不足
- transport 误设为 `sse`
- 网络访问失败或请求超时

当前 `MCPSettings.tsx` 已针对 Figma 补充了更友好的连接失败提示。

---

## 7. OpenPencil 接入步骤

OpenPencil 更适合作为 **本地桌面应用 + 插件代理** 场景接入。

### 7.1 已知前提

- OpenPencil 是开源 AI 原生设计编辑器
- 可打开 `.fig` 文件
- 内置 MCP Server（90+ 工具）
- 支持 `stdio` 和 `HTTP`
- HTTP MCP 由桌面应用自动 spawn 启动
- 本地通过 WebSocket / 本地端口与运行中的应用协作
- 会自动生成：
  - `OPENPENCIL_MCP_AUTH_TOKEN`
  - `OPENPENCIL_MCP_CORS_ORIGIN`

### 7.2 为什么不建议页面直连

虽然 OpenPencil 会提供本地 HTTP MCP 接口，但在浏览器里直接连接本地地址会遇到：

- CORS
- 浏览器对本地地址访问限制
- 桌面应用运行态依赖

所以当前平台下，推荐方案仍然是：

> **由浏览器插件 bridge 代理访问 OpenPencil 本地 MCP。**

### 7.3 推荐接入形态

在 MCP Settings 中新增一个 user server，例如：

- `id`: `openpencil`
- `name`: `OpenPencil MCP`
- `url`: 由 OpenPencil 实际暴露的本地 HTTP MCP 地址决定
- `transport`: 以 OpenPencil HTTP MCP 实际协议为准
  - 若是标准 SSE，则填 `sse`
  - 若是标准 streamable HTTP，则填 `streamable_http`
- `token`: 使用 OpenPencil 提供的 auth token

### 7.4 接入前检查项

1. OpenPencil 桌面应用已启动
2. 内置 MCP 服务已随应用启动
3. 已确认实际 MCP URL
4. 已拿到 auth token
5. 通过插件 bridge 发起连接，而不是页面直连

### 7.5 当前未自动化的部分

当前项目里 **还没有** OpenPencil preset，因此需要手动配置：

- preset provider
- setup 引导文案
- 更细的错误提示

如果后续要产品化接入，可以参考 Figma 的做法新增 OpenPencil preset。

---

## 8. 新增一个页面外 MCP 服务的标准步骤

以后接入新的页面外 MCP 服务时，建议按下面流程：

### 第 1 步：确认协议形态

先确认服务提供的是：

- `streamable_http`
- `sse`
- 还是仅 `stdio`

> 注意：当前 Web 平台主要支持 HTTP 形态；纯 `stdio` 服务不能由网页直接接入，必须先有桌面端或代理层转换。

### 第 2 步：确认鉴权方式

明确以下信息：

- 是否需要 Bearer token
- token 从哪里获取
- 是否需要额外 header
- 是否有 session header（如 `mcp-session-id`）

### 第 3 步：确认是否属于页面外服务

只要服务不属于当前页面上下文，就按页面外 MCP 服务处理：

- 不放进 WebMCP 概念里
- 不让页面直接 `fetch`
- 统一走插件 bridge

### 第 4 步：在 UI 中新增配置入口

至少要保证用户可以配置：

- id
- name
- url
- transport
- token
- timeout

如需降低使用门槛，再补：

- preset provider
- setup checklist
- 常见错误提示

### 第 5 步：验证完整链路

至少验证：

1. `initialize`
2. `tools/list`
3. 选一个真实工具执行 `tools/call`
4. 如支持 task，再验证：
   - `/tasks/get`
   - `/tasks/result`

---

## 9. 当前实现状态

当前仓库里的实际状态是：

### 已完成

- `mcp-client.service.ts` 正式 client 统一走插件 bridge
- 支持 `mcpProxyFetch` 与 `mcpProxyFetchStream`
- 支持 timeout 透传
- 支持从响应头捕获 `mcp-session-id`
- 支持 task 轮询也走 bridge
- MCP Settings 已集成 Figma preset
- Figma 连接失败提示已增强

### 未完成

- OpenPencil preset
- OpenPencil 专属 setup 文案
- OpenPencil 专属错误提示
- 页面外 MCP 服务的更完整产品化文档/测试矩阵

---

## 10. 建议的后续演进

如果后续继续做产品化，建议按优先级推进：

### P1

- 新增 OpenPencil preset
- 给 OpenPencil 增加 setup checklist
- 补一份页面外 MCP 服务的测试清单

### P2

- 在 MCP Settings 中区分：
  - WebMCP
  - 页面外 MCP 服务
- 让用户更清楚当前配置的是哪一类能力

### P3

- 为常见服务提供更标准的 preset catalog
- 统一错误分类：
  - 插件不可用
  - token 错误
  - timeout
  - network
  - transport 不匹配

---

## 11. 一句话结论

在当前平台架构下：

- **Figma Remote**：可以直接作为页面外 MCP 服务接入，推荐优先支持
- **OpenPencil MCP**：技术上可接，但应通过浏览器插件 bridge 代理，不应由页面直连本地地址
- **通用原则**：所有页面外的 MCP 服务，都通过 `web/src/services/mcp-client.service.ts` + 浏览器插件 bridge 接入
