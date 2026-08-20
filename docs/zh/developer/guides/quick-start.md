---
title: 快速入门
order: 101
---

# 开发环境搭建

快速搭建 CreatorWeave 的本地开发环境。

## 环境要求

### 必需软件

| 软件 | 版本要求 |
|------|---------|
| Node.js | 18+ |
| pnpm | 8+ |
| Git | 最新版 |

### 可选软件

| 软件 | 用途 |
|------|------|
| Rust | 编译 WASM 模块 |
| Docker | 运行服务 |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/nutstore/creatorweave.git
cd creatorweave
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置 API Key

```bash
cp .env.example .env
```

编辑 `.env` 文件，添加你的 API Key。

### 4. 启动开发服务器

```bash
cd web && pnpm dev
```

访问 **http://localhost:5173**

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm lint` | 运行 ESLint 检查 |
| `pnpm test` | 运行单元测试 |
| `pnpm test:e2e` | 运行 E2E 测试 |

## 项目结构

```
creatorweave/
├── web/              # React 前端应用
├── mobile-web/       # 移动端远程控制界面
├── relay-server/     # WebSocket 中继服务
├── packages/         # 共享包
├── wasm/            # Rust WASM 模块
└── docs/           # 开发文档
```

## 下一步

- [环境配置](setup.md) - 更多配置选项
- [架构概览](../architecture/) - 系统架构
