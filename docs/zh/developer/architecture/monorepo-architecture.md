---
title: Monorepo 架构与边界
order: 204
---

# Monorepo 架构与边界

本文聚焦 workspace 拆分、包依赖关系、以及“哪里应该放什么代码”。  
系统级运行链路请配合阅读：[架构总览](./overview.md)。

## 1. Workspace 结构

当前 workspace 由以下目录组成：

1. `web`：桌面主应用。
2. `packages/*`：共享包。

`pnpm-workspace.yaml` 与根 `package.json` 保持一致，全部通过 workspace 协同开发，不要求独立发布流程。

## 2. 共享包职责

### 2.1 `packages/config`

1. 提供 Tailwind、TypeScript、ESLint、Design Token 配置导出。
2. 仅配置导出，不承载业务逻辑。

### 2.2 `packages/ui`

1. 通用 UI 组件（基于 Radix）。
2. 面向多应用复用，避免放入业务耦合状态。

### 2.3 `packages/conversation`

1. 对话展示组件与类型。
2. 保持“展示优先”，尽量不引入业务侧 store 依赖。

### 2.4 `packages/encryption`

1. 加密工具能力（密钥交换、加解密封装）。
2. 协议改动需与其消费者保持兼容。

### 2.5 `packages/i18n`

1. 多语言资源与 hooks。
2. 作为 UI 层的跨应用基础能力。

## 3. 应用与服务边界

### 3.1 `web`

1. 业务核心：Agent、MCP、插件系统、SQLite/OPFS、文件与会话管理。
2. 原则：业务状态统一进入 `store/`，重计算优先下沉到 `services/` 或 `workers/`。

## 4. 依赖方向约束

允许方向：

1. `web` -> `packages/*`
2. `web` 内部：`components` -> `store` -> `services`/`agent`/`mcp` -> `sqlite`/`opfs`

避免方向：

1. `packages/*` 反向依赖应用层代码。
2. UI 组件直接调用底层 repository 或协议层。
3. 应用层复制共享包实现而不是复用协议/共享包。

## 5. 开发命令约定

推荐使用 `pnpm -C <workspace>` 明确作用域：

```bash
# Desktop
pnpm -C web dev
pnpm -C web lint
pnpm -C web typecheck

```

跨工程统一命令可使用根 `Makefile`（如 `make lint`、`make test`）。

## 6. 文档索引

1. 系统链路：[`docs/architecture/overview.md`](./overview.md)
2. 插件系统：见仓库根目录的 `plugins/README.md`

---

最后更新：2026-02-28
