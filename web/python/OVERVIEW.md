# Pyodide Worker 项目概览

## 项目简介

Pyodide Worker 是一个在浏览器中执行 Python 代码的完整解决方案,通过 Web Worker 实现非阻塞的 Python 执行环境。

### 核心特性

✅ **非阻塞执行** - 在 Worker 线程中运行,不阻塞 UI
✅ **懒加载** - 首次使用时从 CDN 加载 Pyodide
✅ **包管理** - 按需加载 pandas, numpy, matplotlib 等包
✅ **文件系统** - 支持 `/mnt` 目录的文件 I/O
✅ **输出捕获** - 自动捕获 stdout/stderr
✅ **图像支持** - 自动处理 matplotlib 生成的图像
✅ **类型安全** - 完整的 TypeScript 类型定义
✅ **易于使用** - 简洁的 API 设计

## 快速开始

```typescript
import { PyodideWorkerManager } from '@/python'

const manager = new PyodideWorkerManager()
const result = await manager.execute('print("Hello, Python!")')
console.log(result.stdout) // "Hello, Python!"
```

## 文档导航

### 📚 技术文档

- **[README.md](./README.md)** - 完整的技术文档和 API 参考
- **[USAGE.md](./USAGE.md)** - 中文快速开始指南
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** - 实现总结和架构说明

### 💻 示例代码

- **[example.ts](./example.ts)** - TypeScript/JavaScript 使用示例
- **[ReactExample.tsx](./ReactExample.tsx)** - React 集成示例
- **[**tests**/worker.test.ts](./__tests__/worker.test.ts)** - 单元测试示例

### 🏗️ 核心文件

- **[worker.ts](./worker.ts)** - Pyodide Worker 实现
- **[manager.ts](./manager.ts)** - Worker Manager 和工具函数
- **[types.ts](./types.ts)** - 类型定义
- **[constants.ts](./constants.ts)** - 配置常量
- **[packages.ts](./packages.ts)** - 包管理
- **[files.ts](./files.ts)** - 文件操作
- **[bridge.ts](./bridge.ts)** - 文件桥接层
- **[api.ts](./api.ts)** - API 接口

## 项目结构

```
src/python/
├── worker.ts              # Worker 实现 (419 行)
├── manager.ts             # Manager 和工具 (306 行)
├── types.ts               # 类型定义
├── constants.ts           # 常量配置
├── packages.ts            # 包管理
├── files.ts               # 文件操作
├── bridge.ts              # 文件桥接层
├── api.ts                 # API 接口
├── utils.ts               # 实用工具
├── index.ts               # 统一导出
│
├── README.md              # 技术文档
├── USAGE.md               # 使用指南
├── IMPLEMENTATION.md      # 实现总结
├── OVERVIEW.md            # 本文件
│
├── example.ts             # 代码示例
├── ReactExample.tsx       # React 示例
│
└── __tests__/
    └── worker.test.ts     # 单元测试
```

## 使用场景

### 1. 数据分析

```typescript
const result = await manager.execute(
  'import pandas as pd; pd.read_csv("/mnt/data.csv").describe()',
  [csvFile],
  ['pandas']
)
```

### 2. 数据可视化

```typescript
const result = await manager.execute(
  'import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.savefig("/mnt/plot.png")',
  [],
  ['matplotlib']
)
// result.images 包含生成的图表
```

### 3. 科学计算

```typescript
const result = await manager.execute(
  'import numpy as np; np.linalg.inv([[1, 2], [3, 4]])',
  [],
  ['numpy']
)
```

### 4. 文件处理

```typescript
const result = await manager.execute(
  `
import pandas as pd
df = pd.read_csv('/mnt/input.csv')
df.to_excel('/mnt/output.xlsx')
`,
  [inputFile],
  ['pandas', 'openpyxl']
)
```

## 技术栈

- **Pyodide v0.25.0** - Python WebAssembly 运行时
- **Web Workers** - 多线程执行
- **TypeScript** - 类型安全
- **MEMFS** - 内存文件系统
- **CDN** - 懒加载优化

## 性能指标

- **初始化时间**: ~3-5 秒 (首次加载)
- **包加载时间**: ~1-3 秒/包
- **执行速度**: 比 CPython 慢 2-10x
- **基础内存**: ~50-100 MB
- **默认超时**: 30 秒 (可配置)

## 浏览器支持

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14.1+
- ✅ Edge 90+

**要求**:

- Web Workers 支持
- SharedArrayBuffer 支持
- BigInt 支持
- ES2020+ modules

## 开发指南

### 添加新功能

1. **Worker 功能** - 修改 `worker.ts`
2. **Manager API** - 修改 `manager.ts`
3. **类型定义** - 修改 `types.ts`
4. **工具函数** - 添加到 `utils.ts`

### 测试

```bash
# 运行单元测试
npm test

# 运行特定测试
npm test worker.test.ts

# 覆盖率测试
npm run test:coverage
```

### 文档

更新相关文档:

- API 变更 → README.md
- 新示例 → example.ts
- 类型变更 → types.ts
- 使用指南 → USAGE.md

## 最佳实践

### ✅ 推荐做法

1. **复用 Manager 实例**

   ```typescript
   const manager = new PyodideWorkerManager()
   // 多次使用
   await manager.execute('print("Task 1")')
   await manager.execute('print("Task 2")')
   ```

2. **预加载包**

   ```typescript
   await manager.execute('', [], ['pandas', 'numpy'])
   ```

3. **清理资源**
   ```typescript
   try {
     await manager.execute(code)
   } finally {
     manager.terminate()
   }
   ```

### ❌ 避免做法

1. **每次创建新实例**

   ```typescript
   // 差: 性能低下
   await new PyodideWorkerManager().execute('x = 1')
   await new PyodideWorkerManager().execute('y = 2')
   ```

2. **忽略错误处理**

   ```typescript
   // 差: 未处理错误
   await manager.execute('1 / 0')
   ```

3. **不清理资源**
   ```typescript
   // 差: 内存泄漏
   const manager = new PyodideWorkerManager()
   await manager.execute(code)
   // 忘记 terminate()
   ```

## 常见问题

### Q: Pyodide 加载失败怎么办?

A: 检查 CDN 连接,确保可以访问 `cdn.jsdelivr.net`

### Q: 如何处理长时间运行的代码?

A: 设置超时时间: `execute(code, [], [], timeout)`

### Q: 支持哪些 Python 包?

A: 查看 [Pyodide 包列表](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)

### Q: 如何调试 Python 代码?

A: 使用 `print()` 输出,查看 `result.stdout` 和 `result.stderr`

### Q: 可以使用本地文件吗?

A: 可以,通过 `FileRef` 注入到 `/mnt` 目录

## 相关资源

- [Pyodide 官方文档](https://pyodide.org/)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [项目 README.md](./README.md)

## 贡献指南

欢迎贡献! 请遵循以下步骤:

1. Fork 项目
2. 创建功能分支
3. 编写代码和测试
4. 更新文档
5. 提交 PR

## 许可证

本项目采用 MIT 许可证。

## 联系方式

如有问题或建议,请提交 Issue 或 Pull Request。

---

**最后更新**: 2025-02-06
**版本**: 1.0.0
**状态**: ✅ 生产就绪
