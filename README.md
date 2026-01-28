# Browser File System Analyzer

<div align="center">

**基于浏览器沙盒的本地文件系统分析器**

[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18%2B-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](./README.en.md) | 简体中文

</div>

## ✨ 特性

- 🌐 **纯浏览器运行** - 利用现代浏览器的 File System Access API
- ⚡ **高性能计算** - 使用 Rust + WebAssembly 处理计算密集型任务
- 🎨 **现代化 UI** - 基于 React + Tailwind CSS + shadcn/ui
- 💾 **智能缓存** - 支持 OPFS、IndexedDB、localStorage 三层存储
- 🔄 **状态持久化** - Zustand + persist 中间件快速恢复状态
- 🔐 **安全隔离** - 完全在浏览器沙盒中运行，不上传任何数据

## 🚀 快速开始

### 环境要求

- Rust (1.75+)
- Node.js (18+)
- npm 或 yarn

### 一键设置

```bash
# 克隆项目
git clone https://github.com/yourusername/browser-fs-analyzer.git
cd browser-fs-analyzer

# 首次设置（自动安装所有依赖）
make setup
# 或
bash scripts/setup.sh
```

### 开发

```bash
# 启动开发服务器
make dev
# 或
bash scripts/dev.sh

# 访问 http://localhost:3000
```

### 构建

```bash
# 完整构建（WASM + 前端）
make build
# 或
bash scripts/build.sh

# 产物输出到 web/dist/
```

## 📖 使用方法

### 1. 选择文件夹

点击"选择文件夹"按钮，选择要分析的本地文件夹。

### 2. 自动分析

应用会自动递归遍历文件夹，收集所有文件的大小信息。

### 3. 查看结果

实时查看分析结果：
- 📊 文件总数
- 📦 总大小（自动转换为 KB/MB/GB）
- 📈 平均文件大小
- 🗂️ 文件类型分布

## 🛠️ 开发命令

### 使用 Makefile（推荐）

```bash
make help          # 显示所有命令
make setup         # 首次设置（安装所有依赖）
make setup-hooks   # 安装 Git pre-commit hooks
make dev           # 启动开发服务器
make build         # 完整构建
make test          # 运行测试
make clean         # 清理构建产物
```

### 代码质量检查

```bash
make lint          # 运行所有检查器（ESLint + Clippy）
make lint:fix      # 自动修复检查问题
make format        # 格式化所有代码（Rust + TypeScript + CSS）
make typecheck     # 运行 TypeScript 类型检查
```

### 使用脚本（直接执行）

```bash
bash scripts/setup.sh       # 首次设置
bash scripts/setup-hooks.sh # 安装 pre-commit hooks
bash scripts/dev.sh         # 启动开发服务器
bash scripts/build.sh       # 完整构建
bash scripts/test.sh        # 运行测试
bash scripts/clean.sh       # 清理构建产物
```

### 手动命令

```bash
# 构建 WASM
cd wasm && wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings

# 启动前端开发服务器
cd web && npm run dev

# 运行测试
cd wasm/crates/core && cargo test
cd web && npm test
```

## 🏗️ 技术架构

### 技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端框架 | React + TypeScript |
| 构建工具 | Vite |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 状态管理 | Zustand |
| 计算层 | Rust + WebAssembly |
| 浏览器 API | File System Access API |

### 架构设计

```
┌─────────────────────────────────────┐
│         React UI (前端)              │
│  - shadcn/ui 组件                    │
│  - Tailwind CSS 样式                 │
│  - Zustand 状态管理                  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    JavaScript 业务逻辑层             │
│  - File System Access API            │
│  - 目录遍历                          │
│  - 数据收集                          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   WASM Bindings (wasm-bindgen)      │
│  - JS ↔ Rust 桥接                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Rust Core Library (纯 Rust)       │
│  - 累加算法                          │
│  - 统计计算                          │
└─────────────────────────────────────┘
```

**详细架构文档**: [docs/architecture/overview.md](./docs/architecture/overview.md)

## 🔑 核心功能

### Phase 1: 基础功能 ✅

- ✅ 选择本地文件夹
- ✅ 递归遍历子目录
- ✅ 收集文件大小信息
- ✅ WASM 累加计算
- ✅ 实时显示结果

### Phase 2: 进阶功能 (计划中)

- 🔲 **动态插件系统** - 支持上传外部 WASM 插件
- 🔲 **安全内容预览** - 使用 iframe 沙盒预览 HTML/MD
- 🔲 **批量文件处理** - 批量重命名、添加版权头

## 📦 项目结构

```
browser-fs-analyzer/
├── wasm/                      # Rust + WASM
│   ├── crates/
│   │   ├── core/              # 核心库
│   │   └── wasm-bindings/     # WASM 绑定
│   └── scripts/               # 构建脚本
│
├── web/                       # React 前端
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── store/             # Zustand stores
│   │   ├── hooks/             # 自定义 hooks
│   │   ├── services/          # 业务逻辑
│   │   └── lib/               # 工具函数
│   ├── package.json
│   └── vite.config.ts
│
├── scripts/                   # 开发脚本
│   ├── setup.sh               # 首次设置
│   ├── dev.sh                 # 启动开发服务器
│   ├── build.sh               # 完整构建
│   ├── test.sh                # 运行测试
│   └── clean.sh               # 清理构建产物
│
└── docs/                      # 文档
    ├── architecture/          # 架构文档
    ├── api/                   # API 文档
    └── development/           # 开发指南
```

## 🧪 测试

```bash
# 运行所有测试
make test

# Rust 测试
make test-rust

# 前端测试
make test-web
```

## 📚 文档

- [架构概览](./docs/architecture/overview.md) - 完整的技术架构设计
- [开发环境搭建](./docs/development/setup.md) - 开发环境配置指南
- [Rust/WASM 数据流](./docs/architecture/rust-wasm-flow.md) - WASM 集成详解
- [Pre-Commit Hooks](./docs/development/pre-commit-hooks.md) - Git hooks 配置和使用
- [快速开始](./docs/development/quick-start.md) - 5 分钟快速上手指南
- [Pre-Commit Hooks](./docs/development/pre-commit-hooks.md) - Git hooks 配置和使用
- [快速开始](./docs/development/quick-start.md) - 5 分钟快速上手指南

## 🌐 浏览器兼容性

| 浏览器 | 版本 | File System Access API | OPFS |
|--------|------|----------------------|------|
| Chrome | 86+ | ✅ | ✅ |
| Edge | 86+ | ✅ | ✅ |
| Opera | 72+ | ✅ | ✅ |
| Firefox | - | ❌ | ⚠️ |
| Safari | - | ❌ | ❌ |

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 License

本项目采用 MIT 许可证 - 详见 [LICENSE](./LICENSE) 文件

## 🙏 致谢

- [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen) - Rust ↔ WebAssembly 绑定
- [shadcn/ui](https://ui.shadcn.com/) - 优美的 UI 组件库
- [Zustand](https://github.com/pmndrs/zustand) - 轻量级状态管理
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS 框架

---

<div align="center">

**Made with ❤️ by the community**

</div>
