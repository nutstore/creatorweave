# @creatorweave/ui 使用指南

本文档说明如何在 web 应用中使用 `@creatorweave/ui` 公共包的组件和样式。

## 概述

`@creatorweave/ui` 是基于 shadcn/ui 和 Radix UI 构建的组件库，提供了一组设计统一的 React 组件。

## 安装

```bash
# 在 workspace 根目录
pnpm install

# UI 包会自动链接到 web 应用
```

## 配置

### 1. Tailwind 配置

**关键配置**: 确保 web 应用的 Tailwind 配置包含 UI 包的源文件路径。

```javascript
// web/tailwind.config.js
import { createBaseConfig } from '@creatorweave/config/tailwind'

export default createBaseConfig({
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../packages/ui/src/**/*.{js,ts,jsx,tsx}',  // 必须包含此路径
  ],
  theme: {
    extend: {
      // 自定义配置
    },
  },
})
```

**为什么需要这个配置？**
- Tailwind CSS 使用 JIT 模式，需要扫描内容文件中的类名来生成对应的样式
- 如果 UI 包的源文件不在 content 路径中，其中的 Tailwind 类名不会被处理
- 结果：组件渲染时缺少样式

### 2. 导入组件

```typescript
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandInput,
  BrandButton,
} from '@creatorweave/ui'
```

## 组件使用模式

### Dialog 组件示例

```tsx
import React from 'react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
  BrandDialogFooter,
  BrandDialogClose,
} from '@creatorweave/ui'

interface MyDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
}

export const MyDialog: React.FC<MyDialogProps> = ({ open, onOpenChange }) => {
  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <BrandDialogContent>
        <BrandDialogHeader>
          <BrandDialogTitle>标题</BrandDialogTitle>
          <BrandDialogClose />
        </BrandDialogHeader>

        <BrandDialogBody>
          {/* 内容 */}
        </BrandDialogBody>

        <BrandDialogFooter>
          {/* 按钮 */}
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  )
}
```

### 重要注意事项

1. **必须使用 BrandDialog 包裹**
   - `BrandDialogContent` 内部使用了 Portal，必须在 `BrandDialog` 上下文中使用
   - 否则会报错："DialogPortal must be used within Dialog"

2. **接口命名规范**
   - 使用 `onOpenChange?: (open: boolean) => void` 而非 `onClose`
   - 这与 Radix UI 的 API 约定一致

3. **z-index 层级**
   - Overlay: `z-50`
   - Content: `z-[51]` (必须高于 overlay)
   - 确保内容始终显示在遮罩层之上

## 样式说明

### Tailwind 类名语法

Tailwind 支持多种语法，都是有效的：

| 语法类型 | 示例 | 说明 |
|---------|------|------|
| 标准类名 | `left-1/2` | 使用预定义的 fractional 值 |
| 任意值 | `left-[50%]` | 使用方括号包裹任意值（推荐使用） |
| 任意值组合 | `shadow-[0_4px_16px_rgba(0,0,0,0.06)]` | 复杂样式值 |

**注意**: 两种语法都是有效的。本项目 UI 包统一使用任意值语法（如 `left-[50%]`）。

### 常见样式问题排查

如果组件样式不显示：

1. **检查 Tailwind content 配置**
   ```bash
   # 确认 tailwind.config.js 包含 UI 包路径
   ```

2. **重启开发服务器**
   ```bash
   # Tailwind 会在启动时扫描文件
   pnpm dev
   ```

3. **检查浏览器控制台**
   - 查看元素的计算样式
   - 确认 Tailwind 类是否被正确应用

4. **检查构建输出**
   ```bash
   # 检查 CSS 文件是否包含预期的样式
   ```

## 可用组件列表

### Modal/Dialog
- `BrandDialog` - Dialog 根组件
- `BrandDialogContent` - 对话框内容容器
- `BrandDialogHeader` - 对话框头部
- `BrandDialogTitle` - 对话框标题
- `BrandDialogBody` - 对话框主体
- `BrandDialogFooter` - 对话框底部
- `BrandDialogClose` - 关闭按钮

### Form
- `BrandInput` - 输入框
- `BrandButton` - 按钮
- `BrandLabel` - 表单标签
- `BrandCheckbox` - 复选框
- `BrandSwitch` - 开关

### 其他
- 更多组件请参考 `packages/ui/src/components/` 目录

## 故障排查

### Dialog 只显示遮罩层，不显示内容

**症状**: 点击打开 dialog 时，只看到半透明遮罩，看不到对话框内容。

**原因**: Tailwind JIT 没有扫描到 UI 包的源文件，导致样式未生成。

**解决方案**: 在 `web/tailwind.config.js` 中添加：
```javascript
content: [
  // ... 其他路径
  '../packages/ui/src/**/*.{js,ts,jsx,tsx}',
]
```

### "DialogPortal must be used within Dialog"

**原因**: `BrandDialogContent` 没有被 `BrandDialog` 包裹。

**解决方案**:
```tsx
// 错误
return <BrandDialogContent>...</BrandDialogContent>

// 正确
return (
  <BrandDialog open={open} onOpenChange={onOpenChange}>
    <BrandDialogContent>...</BrandDialogContent>
  </BrandDialog>
)
```

### 类名不生效

**检查清单**:
1. 确认类名拼写正确
2. 确认 Tailwind content 配置包含 UI 包路径
3. 重启开发服务器
4. 清除浏览器缓存

## 开发工作流

### 修改 UI 组件

1. 在 `packages/ui/src/components/` 中修改组件
2. 运行 `pnpm dev` 在 UI 包目录监听变化
3. Web 应用会自动获取更新（pnpm workspace 链接）

### 添加新组件

1. 在 `packages/ui/src/components/` 创建组件
2. 从 `packages/ui/src/index.ts` 导出
3. 在 web 应用中导入使用

## 相关资源

- [Radix UI Dialog 文档](https://www.radix-ui.com/docs/primitives/components/dialog)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [shadcn/ui 文档](https://ui.shadcn.com)
