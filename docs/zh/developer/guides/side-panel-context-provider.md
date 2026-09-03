---
title: Side Panel Context Provider 集成指南
order: 150
---

# Side Panel Context Provider 集成指南

本文面向**第三方网站开发者**（如坚果云工作台、邮箱、文档、企业内部系统），说明如何让自己的网站在被 EO2Weave 的浏览器扩展 side panel 唤起时，向 EO2Weave agent 提供「当前页面上下文」。

## 1. 什么是 Context Provider

当用户在你网站上点 EO2Weave 侧边栏按钮时，浏览器扩展会打开 EO2Weave 的 side panel。EO2Weave agent 会想知道「用户在网站上正在看什么」，以便基于当前上下文回答问题。

你只需要在自己的网站（或通过油猴脚本）暴露一个全局函数：

```js
window.__sidePanelContextProvider = {
  getContext: () => {
    // 返回任意格式的对象（EO2Weave 不解析字段）
    return {
      type: 'ticket',
      id: '484514',
      title: document.title,
      url: location.href,
      // ...任意字段
    }
  }
}
```

EO2Weave 在每次 LLM 调用前都会通过浏览器扩展拉一次这个函数的结果，**原样**拼到 system prompt。

## 2. 核心契约

### 2.1 全局对象名

固定为 `window.__sidePanelContextProvider`。**必须挂到 `window` 上**，不能挂在其他对象。

### 2.2 方法签名

```ts
interface SidePanelContextProvider {
  getContext: () => unknown | Promise<unknown>
}
```

- **同步返回** 或 **异步返回**（Promise）都行 — EO2Weave 都支持
- **返回任意类型** — string / object / array / 任意 JS 值
- EO2Weave **不解析字段**，原样 stringify 后注入 LLM
- 返回 `null` / `undefined` / 抛错 = 告诉 EO2Weave「当前没有 context」

### 2.3 调用时机

EO2Weave **每次拼 system prompt 时都会调一次**（即每次 LLM 调用前）。所以：

- 你的 `getContext` 应该返回**当前**页面状态（不要缓存太久）
- 如果 context 计算昂贵，可以加内部缓存（如 5 秒 TTL）
- 每次调用应该尽量轻量（< 100ms 最佳）

## 3. 几种实现方式

### 3.1 网站自身 JS 暴露（推荐）

如果你的网站可以直接修改源码，最简单的方式是在每个页面挂上 provider：

```js
// 你的网站 JS（如 main.tsx）
;(window as any).__sidePanelContextProvider = {
  getContext: () => {
    const ticket = getCurrentTicket()  // 你自己的逻辑
    return {
      type: 'ticket',
      id: ticket.id,
      title: ticket.title,
      url: location.href,
      participants: ticket.participants.map(p => p.name),
      status: ticket.status,
    }
  }
}
```

### 3.2 油猴脚本（无需改网站源码）

如果网站不是你维护的，用油猴脚本：

```js
// ==UserScript==
// @name         My Site → EO2Weave Context Provider
// @namespace    https://yourcompany.com
// @version      1.0.0
// @match        https://your-site.example.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // 等页面加载完
  window.addEventListener('load', () => {
    window.__sidePanelContextProvider = {
      getContext: () => {
        return {
          type: 'document',
          url: location.href,
          title: document.title,
          // 从 DOM 提取信息
          currentSection: document.querySelector('.active-section')?.textContent,
          selectedText: window.getSelection()?.toString() || '',
        }
      }
    }
  });

  // 监听 SPA 路由变化（如有）
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // EO2Weave 会在下次 LLM 调用时重新拉取，不需要主动通知
    }
  }).observe(document, { subtree: true, childList: true });
})();
```

### 3.3 浏览器扩展 Content Script（适用于有扩展的场景）

```js
// content-script.js
(function() {
  window.__sidePanelContextProvider = {
    getContext: async () => {
      // 可以从 content script 的隔离环境读取 DOM
      return {
        type: 'page',
        url: location.href,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 500),
      }
    }
  }
})();
```

## 4. 返回什么字段？

**完全自由**。EO2Weave 不解析。但有几个建议：

| 场景 | 推荐字段 |
|------|---------|
| 任务/工单系统 | `type`, `id`, `title`, `status`, `assignee`, `url` |
| 邮件系统 | `type: 'email'`, `messageId`, `from`, `to`, `subject`, `body` |
| 代码托管 | `type: 'pr'`, `id`, `branch`, `files`, `title` |
| 文档协作 | `type: 'doc'`, `docId`, `cursor`, `selection` |
| 通用页面 | `type: 'page'`, `url`, `title`, `selectedText` |

返回**任何字段都行**，LLM 会基于字段名自己理解。

## 5. 完整示例

### 5.1 任务系统（TypeScript + React）

```tsx
// 在 App.tsx 顶层
useEffect(() => {
  const ticket = useTicketStore.getState().currentTicket
  if (!ticket) return
  
  ;(window as any).__sidePanelContextProvider = {
    getContext: () => ({
      type: 'ticket',
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      assignee: ticket.assignee?.name,
      priority: ticket.priority,
      labels: ticket.labels,
      url: window.location.href,
      selectedText: window.getSelection()?.toString() || '',
      description: ticket.description.slice(0, 1000), // 截断避免过大
    })
  }
}, [ticket])
```

### 5.2 邮件系统（油猴脚本）

```js
// ==UserScript==
// @name         Mail → EO2Weave
// @match        https://mail.example.com/*
// ==/UserScript==

(function() {
  'use strict';

  window.addEventListener('load', () => {
    window.__sidePanelContextProvider = {
      getContext: () => {
        const messageEl = document.querySelector('.message-view');
        if (!messageEl) return null;

        return {
          type: 'email',
          messageId: messageEl.dataset.messageId,
          from: messageEl.querySelector('.from')?.textContent,
          to: Array.from(messageEl.querySelectorAll('.to')).map(e => e.textContent),
          subject: messageEl.querySelector('.subject')?.textContent,
          body: messageEl.querySelector('.body')?.textContent?.slice(0, 5000),
          timestamp: messageEl.querySelector('.timestamp')?.dataset.value,
        }
      }
    };
  });
})();
```

## 6. 调试

打开 EO2Weave side panel 后，浏览器控制台（DevTools for the side panel）会显示：

```
[Workspace Assistant] Side panel mode: hostname: workspace.jianguoyun.com tabId: 123
```

如果 context 拉取失败：

```
[Workspace Assistant] fetch context failed: Error: context fetch timeout
```

可能的原因：
- `__sidePanelContextProvider` 没挂在 window 上
- `getContext` 抛错（检查浏览器控制台）
- 工作台 tab 已关闭或不可访问
- Provider 内部无限等待

## 7. 不要做的事

❌ **不要在 URL 里拼字段**（如 `?ticket_id=484514&title=...`）：
   - URL 长度有限制
   - 硬编码字段名，EO2Weave 不解析

❌ **不要注册成 WebMCP tool**：
   - WebMCP tool 会出现在 agent 的工具 catalog 里
   - 这跟「system prompt 注入」语义不同

❌ **不要 push 到 EO2Weave 的 window**：
   - EO2Weave 主动拉（pull 模式），不接受 push
   - EO2Weave 不挂任何 setContext 回调

## 8. 安全考虑

- `getContext` 应该**只返回**当前用户可访问的数据
- 不要包含敏感信息（密码、token 等）
- 浏览器扩展在 main world 执行你的 `getContext`，所以可以访问 window 上的所有内容 — **请自行评估风险**

## 9. 相关文档

- [页面外 MCP 服务接入指南](./mcp-page-outside-services.md) — EO2Weave 这边的接入架构
- 浏览器扩展源码：`browser-extension/entrypoints/background.ts` 中的 `requestSidePanelContext` handler