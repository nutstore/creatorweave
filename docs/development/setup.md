# 开发环境搭建指南

## 前置要求

### 必需工具

- **Rust** (1.75.0+) - 编译 WASM 模块
- **Node.js** (18.0+) - 前端开发和构建
- **Git** - 版本控制

### 可选工具

- **Make** - 构建自动化
- **cargo-watch** - 自动重新编译
- **Playwright** - E2E 测试

## 安装步骤

### 1. 安装 Rust

```bash
# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows
# 下载: https://rustup.rs/

# 验证安装
rustc --version
cargo --version
```

### 2. 安装 wasm-pack

```bash
cargo install wasm-pack
```

### 3. 安装 Node.js

```bash
# macOS (Homebrew)
brew install node

# Linux (Ubuntu)
sudo apt install nodejs npm

# Windows
# 下载: https://nodejs.org/

# 验证安装
node --version
npm --version
```

### 4. 克隆项目

```bash
git clone https://github.com/yourusername/browser-fs-analyzer.git
cd browser-fs-analyzer
```

### 5. 安装依赖

```bash
# 安装前端依赖
cd web
npm install
cd ..
```

### 6. 添加 WASM 目标

```bash
rustup target add wasm32-unknown-unknown
```

## 开发命令

### 使用 Makefile（推荐）

```bash
# 查看所有命令
make help

# 安装所有依赖
make install

# 启动开发服务器
make dev

# 构建所有项目
make build

# 运行测试
make test

# 清理构建产物
make clean
```

### 手动命令

#### 构建 WASM

```bash
cd wasm
wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings
```

#### 启动前端开发服务器

```bash
cd web
npm run dev
```

#### 运行测试

```bash
# Rust 测试
cd wasm/crates/core
cargo test

# WASM 测试
cd wasm/crates/wasm-bindings
wasm-pack test --headless --chrome

# 前端测试
cd web
npm test
```

## IDE 配置

### VS Code

推荐安装以下扩展：

- **rust-analyzer** - Rust 语言支持
- **ES7+ React/Redux/React-Native snippets** - React 代码片段
- **Tailwind CSS IntelliSense** - Tailwind 类名提示
- **Error Lens** - 内联错误显示
- **Code Spell Checker** - 拼写检查

#### 工作区配置

项目已包含 `.vscode/settings.json`，包含：
- Rust 格式化配置
- TypeScript 配置
- Prettier 配置
- ESLint 配置

### WebStorm / IntelliJ IDEA

1. 安装 **Rust 插件**
2. 启用 **Node.js 支持**
3. 配置 **Tailwind CSS 插件**

## 项目结构

```
browser-fs-analyzer/
├── wasm/                    # Rust + WASM 模块
│   ├── Cargo.toml           # Workspace 配置
│   ├── crates/
│   │   ├── core/            # 核心库
│   │   └── wasm-bindings/   # WASM 绑定
│   └── scripts/             # 构建脚本
│
├── web/                     # React 前端
│   ├── src/
│   │   ├── components/      # React 组件
│   │   ├── store/           # Zustand stores
│   │   ├── hooks/           # 自定义 hooks
│   │   ├── services/        # 业务逻辑
│   │   └── lib/             # 工具函数
│   ├── package.json
│   └── vite.config.ts
│
└── docs/                    # 文档
    ├── architecture/        # 架构文档
    ├── api/                 # API 文档
    └── development/         # 开发指南
```

## 常见问题

### Q: wasm-pack 构建失败？

**A**: 确保 Rust 版本 >= 1.75.0，并且已添加 wasm32-unknown-unknown 目标。

```bash
rustup update
rustup target add wasm32-unknown-unknown
```

### Q: Vite 无法加载 WASM 模块？

**A**: 检查 WASM 文件路径是否正确，确保在 `web/public/wasm/` 目录下。

```bash
# 重新构建 WASM
cd wasm && wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings
```

### Q: TypeScript 类型错误？

**A**: 运行 `npm run typecheck` 检查类型，确保 WASM 模块的 `.d.ts` 文件已生成。

### Q: 浏览器不支持 File System Access API？

**A**: 使用 Chrome 86+、Edge 86+ 或 Opera 72+。Firefox 和 Safari 不支持。

## 性能调优

### WASM 优化

在 `wasm/Cargo.toml` 中已配置：

```toml
[profile.release]
opt-level = "z"        # 优化体积
lto = true             # 链接时优化
codegen-units = 1      # 单个代码生成单元
strip = true           # 移除调试符号
panic = "abort"        # 减少 panic 处理代码
```

### Vite 优化

在 `web/vite.config.ts` 中已配置：
- 代码分割（react-vendor, zustand）
- 源码映射（sourcemap）
- WASM 模块优化

## 调试技巧

### Rust 调试

```bash
# 使用 console_log 在浏览器中查看 Rust 日志
cargo add console_log

# 在 Rust 代码中
web_sys::console::log_1(&"Hello from Rust!".into());
```

### JavaScript 调试

使用浏览器开发者工具：
- **Sources** 面板 - 查看源码和断点
- **Console** 面板 - 查看日志和错误
- **Network** 面板 - 监控网络请求
- **Performance** 面板 - 性能分析

### WASM 调试

1. 在 Chrome 中打开 `chrome://inspect/#web-workers`
2. 选择要调试的 WASM 模块
3. 使用 DevTools 的 WASM 调试器

## 下一步

- 阅读 [架构概览](../architecture/overview.md)
- 查看 [API 文档](../api/README.md)
- 了解 [构建指南](build-guide.md)
