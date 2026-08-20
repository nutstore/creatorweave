---
title: 环境配置
order: 102
---

# 环境配置详解

详细说明开发环境的各种配置选项。

## 环境变量配置

### 必需配置

创建 `.env` 文件：

```env
# AI API 配置
OPENAI_API_KEY=your-api-key

# 可选：使用其他模型
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
```

### 开发配置

```env
NODE_ENV=development
LOG_LEVEL=debug
```

## 开发服务器配置

### 修改端口

```bash
pnpm dev -- --port 3000
```

### 代理配置

在 `vite.config.ts` 中配置代理：

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
  },
}
```

## 数据库配置

SQLite 数据存储在浏览器 OPFS 中，清理数据：

```
Application → Origin Private File System → Delete all
```

## 常见问题

### 端口被占用

```bash
lsof -ti:5173 | xargs kill -9
```

### 依赖安装失败

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## 相关文档

- [快速入门](quick-start.md)
- [CI/CD 配置](ci-cd.md)
