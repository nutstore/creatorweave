---
title: 架构概览
order: 201
---

# 架构概览

CreatorWeave 的系统架构介绍。

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Web)                        │
├─────────────────────────────────────────────────────────┤
│  React UI                                               │
│  ├── Agent Loop                                         │
│  ├── LLM Providers                                      │
│  ├── Tools (30+)                                        │
│  └── Storage (SQLite WASM + OPFS)                       │
└─────────────────────────────────────────────────────────┘
```

## 核心模块

### Agent System

AI Agent 负责理解用户意图、规划任务、执行操作。

### Storage Layer

| 存储类型 | 用途 |
|---------|------|
| SQLite WASM | 结构化数据存储 |
| OPFS | 文件内容缓存 |
| IndexedDB | 降级存储 |

### Tool System

Agent 可调用的工具集合：

- 文件操作（读，写、删除）
- 代码执行
- Git 操作
- 搜索功能

## 数据流

```
用户输入 → Agent 解析意图 → Agent 规划 → 选择工具 → 工具执行 → 结果反馈 → 更新 UI
```

## 相关文档

- [OPFS 使用指南](opfs-guide.md)
- [Rust/WASM 设计](rust-wasm-flow.md)
