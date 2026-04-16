# 全面国际化实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 web/src 下 153 个文件中的 2938 处硬编码中文替换为国际化 t() 调用

**Architecture:** 增量替换策略，按组件优先级分阶段执行。先处理高频 UI 组件，再处理低优先级文件。翻译 key 统一添加到 packages/i18n/src/locales/ 下四个语言文件。

**Tech Stack:** @creatorweave/i18n (useT hook), i18next 模式

---

## 整体策略

| 阶段 | 范围 | 优先级 | 预估文件数 |
|------|------|--------|-----------|
| Phase 1 | 核心 UI 组件 | 🔴 高 | ~15 文件 |
| Phase 2 | 设置/对话框/工具面板 | 🟡 中 | ~25 文件 |
| Phase 3 | Store/Agent/Workflow | 🟢 低 | ~40 文件 |
| Phase 4 | 文档/测试/其他 | ⚪ 可选 | ~73 文件 |

---

## Phase 1: 核心 UI 组件 (高优先级)

### Task 1: Sidebar.tsx 国际化

**Files:**
- Modify: `web/src/components/layout/Sidebar.tsx`
- Add keys: `packages/i18n/src/locales/{en-US,zh-CN,ja-JP,ko-KR}.ts`

**Step 1: 读取当前文件并识别所有中文串**

```bash
grep -n '[\u4e00-\u9fa5]' web/src/components/layout/Sidebar.tsx
```

**Step 2: 添加缺失的翻译 key 到 locale 文件**

在 `conversation.thinking` 下添加:
```ts
thinkingMode: 'Thinking Mode',
thinkingLevels: {
  minimal: 'Minimal',
  low: 'Low', 
  medium: 'Medium',
  high: 'High',
  xhigh: 'Ultra',
},
// 工作区
workspace: 'Workspace',
newWorkspace: 'New Workspace',
clearWorkspace: 'Clear',
confirmClearWorkspace: 'Clear all workspace for current project?',
// 文件/变更/快照/插件
files: 'Files',
changes: 'Changes',
snapshots: 'Snapshots',
plugins: 'Plugins',
pluginManagerHint: 'Plugin management will be displayed here',
// 操作
cancel: 'Cancel',
confirm: 'Confirm',
workspaceDeleted: 'Workspace deleted',
deleteWorkspaceFailed: 'Failed to delete workspace',
clearing: 'Clearing...',
```

**Step 3: 替换 Sidebar.tsx 中的中文**

Pattern 1 - 思考级别映射:
```tsx
// Before:
{ minimal: '浅', low: '低', medium: '中', ... }

// After:
{ minimal: t('conversation.thinkingLevels.minimal'), low: t('conversation.thinkingLevels.low'), ... }
```

Pattern 2 - aria-label/title:
```tsx
// Before:
title="展开侧栏"

// After:
title={t('sidebar.expandSidebar')}
```

**Step 4: 验证无中文残留**

```bash
grep -c '[\u4e00-\u9fa5]' web/src/components/layout/Sidebar.tsx
# Expected: 0
```

---

### Task 2: ConversationView.tsx 国际化

**Files:**
- Modify: `web/src/components/agent/ConversationView.tsx`

**Step 1: 识别中文**

```bash
grep -n '[\u4e00-\u9fa5]' web/src/components/agent/ConversationView.tsx
```

**Step 2: 需要添加的 key**

```ts
// conversation
editAndResend: 'Edit and Resend',
deleteTurn: 'Delete this turn',
thinking: 'Thinking...',
copy: 'Copy',
tokens: 'Tokens',
// 输入框
inputPlaceholder: 'Type a message... (Shift+Enter for new line)',
inputNoApiKey: 'Please configure API Key in settings first',
// 空状态
emptyStateTitle: 'Start New Conversation',
emptyStateDescription: 'I can help you with code, data analysis, documentation, and more.',
```

**Step 3: 替换中文串**

---

### Task 3: MessageBubble.tsx 国际化

**Files:**
- Modify: `web/src/components/agent/MessageBubble.tsx`

---

### Task 4: WelcomeScreenV2.tsx 国际化

**Files:**
- Modify: `web/src/components/WelcomeScreenV2.tsx`

---

### Task 5: TopBar.tsx 国际化

**Files:**
- Modify: `web/src/components/layout/TopBar.tsx`

---

## Phase 2: 设置/对话框/工具面板 (中优先级)

### Task 6: SettingsDialog.tsx 国际化

### Task 7: ModelSettings.tsx 国际化

### Task 8: WorkspaceSettingsDialog.tsx 国际化

### Task 9: SyncPreviewPanel.tsx 国际化

### Task 10: PendingSyncPanel.tsx 国际化

---

## Phase 3: Store/Agent/Workflow (低优先级)

### Task 11: workspace.store.ts 国际化

### Task 12: conversation.store.sqlite.ts 国际化

### Task 13: agent.store.ts 国际化

### Task 14: Workflow components 国际化

---

## Phase 4: 文档和测试 (可选)

### Task 15: README 文件检查

### Task 16: 测试文件中的中文

---

## 执行方式

**推荐方式: Subagent-Driven (本会话)**
- 每个 Phase 由 subagent 并行处理
- 我在 Phase 之间进行审查
- 快速迭代

**请选择执行方式:**
1. **Subagent-Driven (本会话)** - 我派 subagent 处理每个文件，快速迭代
2. **Parallel Session (新会话)** - 在 worktree 中开新会话，批量执行

