---
title: UI 包使用
order: 105
---

# UI 包使用

共享 UI 组件库位于 `packages/ui`。

## 安装

```bash
cd packages/ui && pnpm install
```

## 构建

```bash
cd packages/ui && pnpm build
```

## 使用组件

```typescript
import { Button, Input } from '@creatorweave/ui'

function MyComponent() {
  return (
    <div>
      <Button>点击</Button>
      <Input placeholder="输入..." />
    </div>
  )
}
```

## 相关文档

- [架构概览](../architecture/)
