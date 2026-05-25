# /compact Slash 命令 — 技术设计

## 1. 需求

在 `AgentRichInput` 输入框中支持 `/compact` slash 命令，允许用户主动触发上下文压缩。

### 行为定义

1. 用户在输入框中输入 `/`，弹出 Suggestion 下拉菜单（与 `#` 文件提及、`@` Agent 提及交互一致）
2. 下拉菜单列出可用的 slash 命令（v1 只有 `compact`），支持键盘上下选择 + Enter 确认
3. 用户选中 `/compact` 后，系统将 `/compact` 作为一条 **用户消息** 写入会话历史
4. 立即触发上下文压缩：将旧对话通过 LLM 生成摘要
5. 摘要生成后注入 `context_summary` 消息
6. **停止**，不进入 agent loop 的后续对话循环（不调 LLM 回复、不执行工具）
7. 后续用户正常对话时，LLM 基于摘要 + 新消息继续

### 与自动压缩的区别

| | 自动压缩 | /compact |
|---|---|---|
| 触发条件 | token ≥ 85% | 用户主动 |
| 时机 | 某次 run 的 convertToLlm 调用中 | 独立 run |
| 压缩后行为 | 继续当前 agent loop（LLM 回复、工具调用） | 立即结束 run |
| 用户消息 | 无 | `/compact` |

---

## 2. 数据流

```
用户输入 "/" → Suggestion 下拉菜单弹出
    │
    ▼
SlashCommandExtension (tiptap Suggestion plugin, char='/')
    │ items() 过滤匹配的命令列表
    │ 用户选中 "compact" → command() 回调
    ▼
AgentRichInput.tsx
    │ slashSuggestion render 回调
    │ 保存 command 回调和 items 到 React state
    │ 用户点击/Enter 选中 → 调用 slashCommand(item)
    │ 清空编辑器中的 / 触发文字
    │ 调用 onSlashCommand('compact')
    ▼
useConversationLogic.ts → handleSlashCommand('compact')
    │ 调用 useConversationStore.getState().compactConversation(convId)
    ▼
conversation.store.sqlite.ts → compactConversation(convId)
    │ 1. 追加用户消息 "/compact"
    │ 2. 更新 messages 到 store
    │ 3. 创建 AgentLoop（复用 runAgent 的 provider/toolRegistry 逻辑）
    │ 4. 调用 agentLoop.runCompactOnly(messages, callbacks)
    ▼
AgentLoop.runCompactOnly(messages, callbacks)
    │ 1. 将 messages 转为 ChatMessage
    │ 2. 提取所有非 context_summary 消息的内容作为 droppedContent
    │ 3. 触发 callbacks.onContextCompressionStart()
    │ 4. 调用 generateContextSummaryWithLLM(droppedContent, tokenBudget)
    │ 5. 生成 cutoffTimestamp
    │ 6. 创建 context_summary 消息（role='user', kind='context_summary'）
    │ 7. 触发 callbacks.onContextCompressionComplete()
    │ 8. 返回 [summaryMessage, ...messagesAfterCutoff]
    ▼
conversation.store.sqlite.ts (callbacks)
    │ onMessagesUpdated → 将 context_summary 写入 store
    │ onContextCompressionStart/Complete → 更新 draftAssistant 状态
    │ finalizeRun → 持久化到 SQLite
    ▼
UI 显示压缩状态 → 结束
```

---

## 3. 改动文件清单

### 3.1 `agent/agent-loop.ts`

新增 `runCompactOnly()` 方法：

```typescript
/**
 * 压缩专用：将所有非 context_summary 消息压缩为一条摘要，
 * 注入 context_summary 消息后立即返回，不进入 agent loop 对话循环。
 */
async runCompactOnly(
  messages: Message[],
  callbacks?: AgentCallbacks
): Promise<Message[]>
```

核心逻辑：
1. 设置 `this.abortController = new AbortController()`
2. 将 messages 中非 `context_summary` 的消息内容拼接为 `droppedContent`
3. 回调 `onContextCompressionStart`
4. 调用 `generateContextSummaryWithLLM` 生成摘要
5. 计算 `cutoffTimestamp = max(所有消息 timestamp) + 1`
6. 更新 `this.compressionBaseline`
7. 创建 `context_summary` 消息，prepend 到消息列表
8. 回调 `onContextCompressionComplete`
9. 回调 `onMessagesUpdated`（让 store 拿到新消息列表）
10. 回调 `onComplete`
11. 返回新消息列表

### 3.2 `store/conversation.store.sqlite.ts`

新增 action：

```typescript
compactConversation: async (conversationId: string) => void
```

核心逻辑：
1. 检查 `!isConversationRunning(convId)`，正在跑的不允许压缩
2. 创建用户消息 `"/compact"`，追加到 `conv.messages`
3. 复用 `runAgent` 中创建 `provider` / `contextManager` / `toolRegistry` 的逻辑
4. 创建 `AgentLoop`（同 `runAgent`）
5. 调用 `agentLoop.runCompactOnly(messages, callbacks)`
6. `finalizeRun('idle', resultMessages)`

> 这里会有一段与 `runAgent` 重复的 provider/toolRegistry/contextManager 创建代码。
> 为了 v1 最小改动，先复制；后续可提取公共工厂函数。

### 3.3 `components/agent/useConversationLogic.ts`

新增 handler：

```typescript
const handleSlashCommand = useCallback(async (command: string) => {
  // ...
  if (command === 'compact') {
    const currentConvId = convIdRef.current
    if (!currentConvId) {
      // 没有 conversation，先创建
      const conv = createNew('/compact')
      await setActive(conv.id)
      currentConvId = conv.id
    }
    await useConversationStore.getState().compactConversation(currentConvId)
    setInputResetToken((v) => v + 1) // 清空编辑器
  }
}, [createNew, setActive])
```

暴露到返回值：

```typescript
return {
  // ... 现有
  handleSlashCommand,
}
```

### 3.4 `components/agent/ConversationView.tsx`

传递 prop：

```tsx
<AgentRichInput
  // ... 现有 props
  onSlashCommand={logic.handleSlashCommand}
/>
```

### 3.5 `components/agent/SlashCommandExtension.ts`（新文件）

仿照 `FileMentionExtension.ts`，创建一个 tiptap Extension，用 Suggestion 插件实现 `/` 触发的命令菜单。

```typescript
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'

// -----------------------------------------------------------------------
// 命令定义
// -----------------------------------------------------------------------

export interface SlashCommandItem {
  /** 命令 ID，如 'compact' */
  id: string
  /** 显示标签，如 'Compact' */
  label: string
  /** 简短描述 */
  description: string
}

/** v1 硬编码命令列表 */
export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'compact',
    label: 'Compact',
    description: '压缩上下文，释放 token 空间',
  },
]

// -----------------------------------------------------------------------
// Extension（不注册自定义 node，只挂 Suggestion plugin）
// -----------------------------------------------------------------------

export const SlashCommandPluginKey = new PluginKey('slashCommand')

/**
 * Slash 命令 extension — 输入 `/` 时弹出命令下拉菜单。
 * 不插入任何 node，选中后通过外部回调通知父组件。
 */
export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      /** 用户选中命令后的回调 */
      onSelect: (_command: SlashCommandItem) => {},
      /** Suggestion render 函数（由 AgentRichInput 传入） */
      render: () => ({
        onStart() {},
        onUpdate() {},
        onExit() {},
        onKeyDown() { return false },
      }),
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: SlashCommandPluginKey,
        char: '/',
        items: ({ query }) => {
          const q = query.toLowerCase().trim()
          return SLASH_COMMANDS.filter((cmd) =>
            cmd.id.includes(q) || cmd.label.toLowerCase().includes(q)
          )
        },
        render: this.options.render,
        command: ({ editor, range, props }) => {
          // 删除触发的 '/' 字符
          editor.chain().focus().deleteRange(range).run()
          // 通知外部
          this.options.onSelect(props)
        },
      }),
    ]
  },
})
```

> **为什么不像 FileMention 那样注册自定义 Node？**
> 因为 slash 命令不需要在编辑器中插入 chip node。选中后直接删掉触发字符，通知外部执行命令即可。

### 3.6 `components/agent/AgentRichInput.tsx`

#### 新增 prop

```typescript
interface AgentRichInputProps {
  // ... 现有
  /** Slash 命令回调 */
  onSlashCommand?: (command: string) => void
}
```

#### 新增 ref + state（与 file suggestion 模式完全一致）

```typescript
// Slash command suggestion state
const [slashSuggestionItems, setSlashSuggestionItems] = useState<SlashCommandItem[]>([])
const [slashSuggestionCommand, setSlashSuggestionCommand] = useState<(() => void) | null>(null)
const slashSuggestionDropdownRef = useRef<SuggestionDropdownHandle>(null)

// Ref for onSlashCommand callback（避免闭包）
const onSlashCommandRef = useRef(onSlashCommand)
useEffect(() => { onSlashCommandRef.current = onSlashCommand }, [onSlashCommand])
```

#### 注册 extension

在 `useEditor` 的 extensions 数组中添加：

```typescript
SlashCommandExtension.configure({
  onSelect: (item: SlashCommandItem) => {
    // 清空编辑器中可能残留的内容
    editor.commands.clearContent()
    emitValue(editor)
    onSlashCommandRef.current?.(item.id)
  },
  render: () => {
    return {
      onStart: (props) => {
        setSlashSuggestionItems(props.items as SlashCommandItem[])
        setSlashSuggestionCommand(() => () => props.command(props.item))
      },
      onUpdate: (props) => {
        setSlashSuggestionItems(props.items as SlashCommandItem[])
        setSlashSuggestionCommand(() => () => props.command(props.item))
      },
      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          setSlashSuggestionItems([])
          setSlashSuggestionCommand(null)
          return true
        }
        return slashSuggestionDropdownRef.current?.onKeyDown(props.event) ?? false
      },
      onExit: () => {
        setSlashSuggestionItems([])
        setSlashSuggestionCommand(null)
      },
    }
  },
})
```

#### Suggestion 下拉菜单渲染

与现有 `@` `#` dropdown 并列，新增：

```tsx
{showSlashSuggestion && slashSuggestionCommand && (
  <SuggestionDropdown<SlashCommandItem>
    ref={slashSuggestionDropdownRef}
    items={slashSuggestionItems}
    getItemKey={(cmd) => cmd.id}
    onSelect={(cmd) => slashSuggestionCommand?.()}
    renderItem={(cmd, _selected) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">/{cmd.id}</span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {cmd.description}
        </span>
      </div>
    )}
    selectedColor="bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
  />
)}
```

其中 `showSlashSuggestion` 计算方式与现有 `showFileSuggestion` 一致：

```typescript
const showSlashSuggestion = !disabled && slashSuggestionItems.length > 0 && !!slashSuggestionCommand
```

#### handleKeyDown 中 Enter 的处理

现有的 Enter 逻辑已经会在 `suggestionItemsRef` 有内容时委托给 dropdown，slash suggestion 的 items 也需要加进去。在现有 Enter 拦截中追加 slash suggestion 检查：

```typescript
// Guard: slash command suggestion popup is showing
const slashItems = slashSuggestionItemsRef.current
if (slashItems.length > 0) {
  const handled = slashSuggestionDropdownRef.current?.onKeyDown(event) ?? false
  if (handled) return true
}
```

#### Escape 处理

在现有 Escape 逻辑的 hasAgentSuggestion / hasFileSuggestion 检查中追加 slash suggestion：

```typescript
const hasSlashSuggestion = slashSuggestionItemsRef.current.length > 0
if (hasAgentSuggestion || hasFileSuggestion || hasSlashSuggestion) {
  return false // delegate to suggestion plugin's onKeyDown
}
```

#### placeholder 提示

在现有的 `#` `@` hint 旁加一个 `/` hint：

```tsx
<span className="inline-flex items-center gap-0.5">
  <kbd className="...">/</kbd>
  <span>{t('conversation.input.hints.slashCommand')}</span>
</span>
```

---

## 5. 边界情况

### 5.1 空 conversation

用户在新对话中直接输入 `/compact`：
- 需要先 `createNew()` 创建 conversation，再执行压缩
- 但空对话没有内容可压缩 → `generateContextSummaryWithLLM` 传入空内容
- 处理：在 `compactConversation` 中检查 `messages.length <= 1`（只有 /compact 自己），直接 toast 提示"没有可压缩的上下文"，return

### 5.2 正在运行时输入 /compact

- `compactConversation` 检查 `isConversationRunning(convId)` → toast 提示"请等待当前任务完成"
- 或者：先 `cancelAgent` 再压缩 → v1 不做，先阻止

### 5.3 压缩被取消

- 用户在压缩 LLM 调用期间按 Escape → `abortController.abort()` → `runCompactOnly` catch 中止，返回原始 messages
- store 的 finalizeRun 不会注入 summary

### 5.4 压缩 LLM 调用失败

- `generateContextSummaryWithLLM` 抛异常
- `runCompactOnly` catch，回调 `onError`
- store finalizeRun('error')，toast 提示"压缩失败"

### 5.5 已有 context_summary

- 拼接 droppedContent 时过滤掉 `kind === 'context_summary'` 的消息
- 新的 summary 会覆盖旧的 compressionBaseline

### 5.6 与自动压缩共存

- `/compact` 后，`compressionBaseline` 被更新
- 后续正常对话时，`convertAgentMessagesToLlm` 读取 baseline，只发 summary + cutoff 之后的消息
- 自动压缩的 trigger 检查不受影响（基于 real token usage）

---

## 6. 不改动的部分

| 层 | 文件 | 原因 |
|---|---|---|
| convert-bridge.ts | 不改 | 不走 convertToLlm 路径 |
| pi-core-runner.ts | 不改 | 不走 agentLoopContinue |
| context-manager.ts | 不改 | trimMessages 不涉及 |
| AgentLoopConfig 类型 | 不改 | runCompactOnly 是独立方法，不经过 config |

---

## 7. v1 限制 / 后续扩展

- v1 只支持 `/compact` 一个命令
- 命令列表硬编码在 `SlashCommandExtension.ts` 中
- 后续可扩展为：
  - `/clear` — 清空对话
  - `/model` — 切换模型
  - 通用 slash command 注册表（动态注册命令 + suggestion dropdown）
- Suggestion 下拉菜单中可分组显示命令
