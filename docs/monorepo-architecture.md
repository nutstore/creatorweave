# Browser-FS-Analyzer Monorepo 架构设计文档

## 1. Workspace 包概览

### 1.1 所有 Workspace 包列表

```
browser-fs-analyzer/
├── packages/
│   ├── config          # 共享配置 (tailwind, tsconfig, eslint, tokens)
│   ├── conversation    # 对话组件
│   ├── encryption      # 加密模块
│   ├── i18n            # 国际化
│   └── ui              # UI 组件库
├── web                 # 主 Web 应用
├── mobile-web          # 移动端 Web
└── relay-server        # 中继服务器
```

### 1.2 包配置状态

| 包 | main | types | exports | 说明 |
|---|---|---|---|---|
| **packages/config** | - | - | `./src/*` | 纯配置，无需构建 |
| **packages/conversation** | `./src/index.ts` | `./src/index.ts` | `"."` + `./types` | 源码工具包 |
| **packages/encryption** | `./src/index.ts` | `./src/index.ts` | `"."` | 源码工具包 |
| **packages/i18n** | `./src/index.ts` | `./src/index.ts` | `"."` + `./locales` + `./types` | 源码工具包 |
| **packages/ui** | `./src/index.ts` | `./src/index.ts` | `"."` | 源码工具包 |
| **web** | - | - | - | 主 Web 应用 |
| **mobile-web** | - | - | - | 移动端 Web |
| **relay-server** | - | - | - | 中继服务器 |

---

## 2. 简化方案（项目内部使用）

> **重要**: 本项目为**内部使用**，不需要 build 发布。所有 workspace 包统一指向源码。

### 2.1 核心原则

1. **所有 packages/* 包**: 统一指向 `src/index.ts`
2. **应用 (web/mobile-web)**: 直接使用 `@browser-fs-analyzer/*` 包名导入
3. **无需构建**: 不需要 `pnpm -r build` 步骤

### 2.2 统一配置

#### 2.2.1 导入规范 (web & mobile-web)

- 仅允许：`@browser-fs-analyzer/ui`、`@browser-fs-analyzer/i18n`、`@browser-fs-analyzer/encryption`、`@browser-fs-analyzer/conversation`
- 禁止短别名：`@ui`、`@i18n`、`@encryption`、`@conversation`

#### 2.2.2 tsconfig.json (web & mobile-web)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 3. 改动清单

### 3.1 web/mobile-web 导入规范

- 统一使用完整包名 `@browser-fs-analyzer/*`
- 移除 `@ui/@i18n/@encryption/@conversation` 短别名

### 3.2 mobile-web/tsconfig.json

保留本地路径别名:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 4. 开发流程

```bash
# 安装依赖
pnpm install

# 启动应用 (workspace 包通过 @browser-fs-analyzer/* 导入)
cd web && pnpm dev
# 或
cd mobile-web && pnpm dev
```

---

## 5. 总结

| 项目 | 状态 |
|---|---|
| workspace 包 main/types | 统一指向 `./src/index.ts` |
| 导入规范 | 统一使用 `@browser-fs-analyzer/*` |
| tsconfig paths | 仅保留应用本地别名（如 `@/*`） |
| 需要 build | ❌ 否（内部使用） |

---

*文档版本: v2.0 (简化版)*
*最后更新: 2026-02-13*
