---
title: 架构文档
order: 200
---

# 架构文档

本节包含 CreatorWeave 的系统架构介绍。

## 目录

- [架构概览](overview.md) - 整体架构设计
- [OPFS 使用指南](opfs-guide.md) - 浏览器文件系统使用场景
- [Rust/WASM 设计](rust-wasm-flow.md) - WASM 模块数据流设计

## 技术栈

| 分类 | 技术 |
|------|------|
| 前端框架 | React + TypeScript + Vite |
| 状态管理 | Zustand |
| 样式 | TailwindCSS |
| 数据存储 | SQLite WASM + OPFS |
| AI 运行时 | 多模型支持 (OpenAI, Anthropic, 本地模型) |
| 移动端 | React (远程控制) |
| 中继服务 | Express + Socket.IO |
