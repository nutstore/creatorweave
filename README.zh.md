# AI Workspace

<div align="center">

**面向创作与研发团队的 AI 原生工作空间（本地优先）**

[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18%2B-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](./README.md) | 简体中文

</div>

## 项目简介

AI Workspace 是一个 **AI 原生创作工作空间**。它将本地文件工作流、AI 对话协作、知识沉淀与多代理能力整合在同一套浏览器应用中。

## 主要特性

- **AI 对话与工具调用**：基于多代理能力对代码与文件进行理解、分析和执行操作
- **本地优先**：通过浏览器 File System Access API 与本地文件交互
- **高性能存储**：SQLite WASM + OPFS（支持 IndexedDB 回退）
- **Python 集成**：基于 Pyodide 在浏览器中运行 Python
- **数据与可视化**：支持表格、图表、导出等数据分析流程
- **远程协作**：支持移动端远程控制会话

## 快速开始

### 环境要求

- Rust 1.75+
- Node.js 18+
- pnpm（推荐）

### 安装

```bash
git clone https://github.com/nutstore/creatorweave.git
cd creatorweave
pnpm install
```

### 开发

```bash
# 启动开发环境
make dev
# 或
pnpm -C web run dev

# 默认访问
# http://localhost:5173
```

### 构建

```bash
make build
```

## 文档索引

- [文档总览](./docs/README.md)
- [用户指南](./USER_GUIDE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [开发者文档入口（中文）](./docs/developer/guides/index.md)
- [开发指南（English）](./docs/development/README.md)
- [架构文档](./docs/architecture/overview.md)
- [SQLite 存储说明](./web/src/sqlite/README.md)

## Roadmap（待实现）

- [ ] **SubAgent 编排能力（规划中）**：提供原生 SubAgent 分发、并行调度、结果聚合，以及跨代理上下文隔离与交接质量保障能力。
- [ ] **LLM Wiki（规划中）**：构建可持续演进的知识库流程（`ingest` / `query` / `lint`），支持结构化 claim 与来源可追溯。参考：[LLM Wiki 统一技术规格](./docs/design/llm-wiki-mvp-unified-spec.md)、[LLM Wiki 的 SubAgent 前置能力](./docs/design/subagent-prerequisite-for-llm-wiki.md)。

## 参与贡献

欢迎提交 Issue 和 PR。请先阅读：

- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
