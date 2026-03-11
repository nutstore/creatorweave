# WebContainer + Next.js 集成设计文档

## 1. 背景与目标

当前应用已经具备：
- 浏览器授权本地目录（File System Access API）
- 项目级目录权限状态管理（`folder-access.store`）
- 文件遍历与文件树展示能力

目标是在现有架构中增加 WebContainer 运行能力，使用户可以在浏览器内：
1. 选择并授权本地 Next.js 项目目录
2. 将项目同步到 WebContainer 虚拟文件系统
3. 安装依赖并启动开发服务
4. 在应用内查看运行日志和预览页面

## 2. 范围

### 2.1 In Scope（MVP）
- Next.js 项目识别（`next` 依赖 + `scripts.dev`）
- 一键启动流程（boot -> sync -> install -> dev）
- 日志流式输出
- 端口监听与预览 iframe
- Stop / Restart / Reinstall / Manual Sync

### 2.2 Out of Scope（后续）
- 多项目并行运行
- 自动双向实时文件监控（先做手动同步 + 应用内变更触发）
- SSR 复杂网络场景优化
- 完整 monorepo 智能子项目自动选择

## 3. 现有能力复用

- 目录权限状态机：`web/src/store/folder-access.store.ts`
- 目录句柄运行时绑定：`web/src/native-fs/directory-handle-manager.ts`
- 文件遍历：`web/src/services/traversal.service.ts`
- UI 入口位：
  - `web/src/components/layout/FolderSelector.tsx`
  - `web/src/components/layout/TopBar.tsx`
  - `web/src/components/layout/WorkspaceLayout.tsx`
- WebContainer 试验代码：`test-webcontainer/index.html`

## 4. 总体架构

新增模块（不破坏现有 store/service 结构）：

1. `WebContainerRuntimeService`
- 职责：boot、spawn、日志流、server-ready 监听、进程生命周期

2. `FolderToWebContainerSyncService`
- 职责：把本地目录内容写入 WebContainer FS（全量 + 增量）

3. `NextProjectDetector`
- 职责：识别 Next.js、锁文件与包管理器、启动命令

4. `webcontainer.store`（Zustand）
- 职责：统一 UI 状态、错误状态、运行状态、日志缓冲、操作入口

5. `WebContainerPanel`（UI）
- 职责：操作按钮、状态展示、日志终端、预览 iframe

## 5. 状态机设计

`RuntimeStatus`：
- `idle`
- `booting`
- `syncing`
- `installing`
- `starting`
- `running`
- `stopping`
- `error`

状态转换（主路径）：
`idle -> booting -> syncing -> installing -> starting -> running`

异常路径：
- 任意状态失败 -> `error`
- `running -> stopping -> idle`

约束：
- 单次仅允许一个生命周期操作在执行（防并发点击）
- `stopping` 状态下忽略新的 `start` 请求

## 6. 启动流程（MVP）

1. 前置校验
- 当前项目存在已授权目录句柄（`folder-access` 为 `ready`）
- 浏览器支持 WebContainer 运行环境

2. 项目检测
- 读取目录根的 `package.json`
- 检查：
  - `dependencies.next` 或 `devDependencies.next`
  - `scripts.dev`

3. 包管理器与命令选择
- `pnpm-lock.yaml` -> `pnpm install` / `pnpm run dev`
- `yarn.lock` -> `yarn install` / `yarn dev`
- 默认 -> `npm install` / `npm run dev`

4. 同步项目文件到 WebContainer
- 先全量同步（MVP）
- 排除目录：
  - `node_modules`
  - `.git`
  - `.next`
  - `dist`
  - `coverage`
  - `.turbo`

5. 安装依赖
- 执行 install 命令
- 捕获 stdout/stderr 并写入日志流
- 非 0 退出码直接进入 `error`

6. 启动 dev 服务
- 执行 dev 命令
- 监听 `server-ready` 事件，记录 `port/url`
- 状态进入 `running`

## 7. 文件同步策略

### 7.1 MVP
- 启动前执行一次全量同步
- 提供手动 `Sync` 按钮
- 对应用内“已知写入动作”可触发增量同步

### 7.2 后续增强
- 低频轮询文件指纹（2~3 秒）做增量同步
- 冲突提示（本地外部修改与容器内运行状态冲突）

## 8. 错误处理与恢复

错误分类：
- `NO_FOLDER_HANDLE`
- `PROJECT_NOT_NEXT`
- `PACKAGE_JSON_INVALID`
- `INSTALL_FAILED`
- `DEV_SERVER_FAILED`
- `PERMISSION_REVOKED`
- `WEBCONTAINER_BOOT_FAILED`

恢复策略：
- Install 失败 -> `Reinstall`
- Dev 失败 -> `Restart`
- 权限失效 -> 引导走现有恢复权限流程
- 所有错误保留日志，不清空上下文

## 9. UI 设计

新增 `WebContainerPanel`：
- 状态徽标：`idle/running/error`
- 操作按钮：
  - Start
  - Stop
  - Restart
  - Sync
  - Reinstall
- 运行信息：
  - 项目名
  - 包管理器
  - 当前端口/URL
- 日志区：支持自动滚动与清空
- 预览区：iframe + “新窗口打开”

TopBar 增强：
- 可选增加运行状态小圆点（绿/黄/红）

## 10. 数据与接口草图

### 10.1 Store State（建议）

```ts
type RuntimeStatus =
  | 'idle'
  | 'booting'
  | 'syncing'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

interface WebContainerState {
  status: RuntimeStatus
  projectId: string | null
  directoryName: string | null
  packageManager: 'pnpm' | 'yarn' | 'npm' | null
  previewUrl: string | null
  previewPort: number | null
  logs: string[]
  errorCode: string | null
  errorMessage: string | null
  isBusy: boolean

  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  reinstall: () => Promise<void>
  syncNow: () => Promise<void>
  appendLog: (line: string) => void
  clearLogs: () => void
}
```

### 10.2 Runtime Service（建议）

```ts
interface StartOptions {
  directoryHandle: FileSystemDirectoryHandle
  preferredPackageManager?: 'pnpm' | 'yarn' | 'npm'
}

interface RuntimeStartResult {
  previewUrl: string
  previewPort: number
  packageManager: 'pnpm' | 'yarn' | 'npm'
}

interface IWebContainerRuntimeService {
  start(options: StartOptions): Promise<RuntimeStartResult>
  stop(): Promise<void>
  restart(): Promise<RuntimeStartResult>
  reinstall(): Promise<void>
  syncNow(): Promise<void>
  onLog(cb: (line: string) => void): () => void
  onServerReady(cb: (port: number, url: string) => void): () => void
}
```

## 11. 实施计划

### Phase 1（MVP）
1. 引入依赖：`@webcontainer/api`
2. 新增 runtime/sync/detector 三个 service
3. 新增 `webcontainer.store`
4. 新增 `WebContainerPanel`，接入 `WorkspaceLayout`
5. 打通 Start/Stop/Restart/Reinstall/Sync

### Phase 2（增强）
1. 增量同步优化
2. 更精细的错误分类与重试策略
3. 日志检索与导出

### Phase 3（扩展）
1. Monorepo 子项目选择器
2. 项目级运行配置持久化（命令、端口偏好）

## 12. 验收标准（MVP）

1. 用户授权本地 Next.js 目录后，点击 Start 能进入 `running`
2. 首次安装依赖成功率可接受，失败可重试
3. 能在面板中看到完整日志输出（install + dev）
4. 能拿到 `server-ready` URL 并在 iframe 正常预览
5. Stop 后进程退出，状态回到 `idle`
6. 在权限失效时能正确提示并恢复

## 13. 风险与注意事项

    1. WebContainer 对浏览器环境有要求，需保留兼容性提示
    2. 大项目全量同步耗时高，MVP 先可用，后续优化增量同步
    3. 同步排除规则需要严格,避免写入 `node_modules/.next`
    4. 运行时只保留单实例,避免多进程抢占端口和资源

### 13.1 已知限制

    **Next.js 版本限制**: WebContainer 当前仅支持 Next.js 14.x 及以下版本。 Next.js 15+ 版本由于 LightningCSS 依赖问题，无法在 WebContainer 中正常运行。 如果用户项目使用 Next.js 15+, 系统会检测并显示兼容性警告，建议降级到 `next@14` 以避免运行时错误.1. WebContainer 对浏览器环境有要求，需保留兼容性提示
2. 大项目全量同步耗时高，MVP 先可用，后续优化增量同步
3. 同步排除规则必须严格，避免写入 `node_modules/.next`
4. 运行时只保留单实例，避免多进程抢占端口和资源

## 14. 测试建议

单测：
- 项目识别逻辑（Next 检测、包管理器选择）
- 状态机迁移与错误回退
- 同步排除规则

集成测试：
- Start 全链路（mock WebContainer）
- install 失败与 restart/reinstall 行为
- server-ready 事件驱动预览

手工测试：
- 小型 Next 项目
- 大型 Next 项目
- 权限恢复场景
- 手动 Sync 生效场景

