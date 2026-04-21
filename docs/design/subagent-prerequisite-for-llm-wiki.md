# SubAgent 能力规范（独立）

## 1. 范围

本文只讨论通用 `SubAgent` 能力，不讨论任何领域业务。

SubAgent 是主代理的工具——不是多 agent 编排系统。设计围绕"主代理派一个后台任务去干活"这个单一场景。运行时假设见 §2.1。

**SubAgent 不注入 agent 身份文件**：不需要 SOUL.md（人格）、IDENTITY.md（身份）、AGENTS.md（agent 定义）、HEARTBEAT.md（心跳协议）等 openclaw 风格的 agent 注入。SubAgent 只接收 `prompt`（任务描述）和 `mode`（权限模式），没有自我意识、没有个性、没有角色定义。

目标：

1. 定义可实现的子代理协议：启动、续跑、停止、通知、恢复。
2. 定义主循环与子代理的协作契约。
3. 定义最小可交付（MVP）与验收标准。

## 2. 设计原则

1. 通用性：协议不绑定业务语义。
2. 可恢复：任何长任务都可中断后恢复。
3. 可观测：每个子任务状态与进度可追踪。
4. 可控性：权限、工具、隔离边界可配置。
5. 渐进实现：先单层主代理 -> 子代理，不做多级编排器。
6. **工具而非成员**：SubAgent 是主代理的工具调用，不是平等的 agent。不需要 agent 间的协商、选举、冲突解决。

## 2.1 运行时假设

CreatorWeave 是浏览器应用，SubAgent 运行在浏览器环境中：

| 概念 | CLI/服务端映射 | 浏览器实际实现 |
|-----|-------------|-------------|
| 进程 | OS 进程 | Web Worker 或主线程异步任务 |
| 终止进程 | kill 信号 | `worker.terminate()` 或取消 AbortController |
| 僵尸进程 | 进程残留 | Worker 已 terminate 但状态未更新 |
| 文件系统 | 本地 FS | OPFS（Origin Private File System） |
| worktree 隔离 | git worktree | OPFS 子目录隔离 |
| transcript 持久化 | 磁盘文件 | OPFS 文件 + SQLite 记录 |
| 进程间通信 | IPC / stdin | Worker postMessage / SharedArrayBuffer |

约束：

1. **单标签页**：所有 SubAgent 运行在同一个浏览器标签页内，标签页关闭则全部终止。
2. **无真实进程隔离**：Worker 之间共享同一 OPFS，隔离靠约定而非 OS 级保障。
3. **内存受限**：浏览器对 Worker 数量和内存有上限，并发数需保守。

实现清单：

- [ ] 明确 SubAgent 运行载体：Web Worker（后台任务）或主线程异步任务（前台任务）
- [ ] `stop_subagent` 的"软中断"映射为向 Worker 发送 stop 消息
- [ ] `stop_subagent` 的"硬终止"映射为 `worker.terminate()`
- [ ] "zombie"场景定义为：Worker 已 terminate 但数据库状态仍为 running
- [ ] worktree 隔离映射为 OPFS 子目录（非 git worktree）
- [ ] 标签页关闭时通过 `beforeunload` 清理所有 running 状态

## 2.2 SubAgent 的 System Prompt

SubAgent 不注入 SOUL.md/IDENTITY.md 等身份文件。它使用一份最小 system prompt：

```
You are a sub-agent executing a specific task. Follow the instructions precisely.
When done, provide a concise summary of what you accomplished.
If you encounter errors, describe them clearly including what you tried and what failed.
```

规则：

1. System prompt 固定且最小，不可自定义（避免注入复杂度）。
2. 用户的 `prompt` 作为第一条 user message。
3. `resume` 时 system prompt 不变，追加 transcript 摘要 + 新 prompt。

实现清单：

- [ ] 定义 SubAgent 最小 system prompt（不可自定义）
- [ ] spawn 时 system prompt + user(prompt) 构成初始上下文
- [ ] resume 时 system prompt + transcript 摘要 + user(prompt) 构成恢复上下文
- [ ] 不注入 SOUL.md / IDENTITY.md / AGENTS.md / HEARTBEAT.md

## 2.3 与现有 agent-loop 的关系

项目已有 `web/src/agent/agent-loop.ts`（主代理循环）。SubAgent 的实现策略：

**复用 agent-loop 核心逻辑，独立管理生命周期。**

```
agent-loop.ts (主代理)
  └── spawnSubAgent() → 创建 SubAgentRunner
        └── SubAgentRunner
              ├── 复用: LLM 调用、工具注册、消息解析
              ├── 独立: 上下文窗口、状态机、超时管理
              └── 不复用: 主代理的对话历史、UI 渲染
```

实现清单：

- [ ] 提取 agent-loop 中可复用逻辑为共享模块（LLM 调用、工具执行、消息解析）
- [ ] SubAgentRunner 使用共享模块，独立管理自己的上下文和状态
- [ ] SubAgent 不写入主代理的 conversation store
- [ ] SubAgent 结果通过 task_notification 回传主代理

## 2.4 SubAgent 默认工具集

| 工具 | 默认可用 | 说明 |
|-----|---------|------|
| 文件读取 (read_file) | 是 | OPFS 文件读取 |
| 文件写入 (write_file) | 是 | OPFS 文件写入 |
| 文件列表 (list_files) | 是 | OPFS 目录浏览 |
| 代码执行 (execute_code) | 是 | Python (Pyodide) 执行 |
| 搜索 (search/grep) | 是 | 文件内容搜索 |
| 网络获取 (web_fetch) | 是 | URL 内容获取 |
| spawn_subagent | 否 | 禁止递归，除非显式授权 |
| stop_subagent | 否 | 禁止停止其他子代理 |
| get_subagent_status | 否 | 禁止查询其他任务 |

实现清单：

- [ ] 定义默认允许工具列表（read_file, write_file, list_files, execute_code, search, web_fetch）
- [ ] 定义默认禁止工具列表（spawn_subagent, stop_subagent, get_subagent_status）
- [ ] 支持 allowlist/denylist 覆盖默认配置
- [ ] 递归 spawn 需 `allow_recursive_spawn: true` 且最大深度 2 层

## 3. 核心模型

### 3.1 三个核心操作

1. `spawn_subagent`
2. `send_message_to_subagent`
3. `stop_subagent`

### 3.2 必需配套能力

1. `task_notification`（异步回传）
2. `resume_subagent`（恢复执行）

### 3.3 任务状态机

```
┌─────────┐   spawn    ┌─────────┐   完成      ┌───────────┐
│ pending │ ─────────► │ running │ ─────────► │ completed │
└─────────┘            └─────────┘             └───────────┘
     ▲                      │                       │
     │                      │ 失败                  │ 失败
     │                      ▼                       ▼
     │                 ┌─────────┐            ┌──────────┐
     │                 │  failed │            │  killed  │
     │                 └─────────┘            └──────────┘
     │                      │                       │
     │                      └───────┬───────────────┘
     │                              │ resume (若 transcript 可用)
     └──────────────────────────────┘
```

状态转换规则：

| 当前状态 | 事件 | 目标状态 | 触发条件 |
|---------|------|---------|---------|
| pending | spawn | running | 子代理进程启动成功 |
| running | 完成 | completed | exit_reason=completed |
| running | 失败 | failed | exit_reason=error\|signal\|timeout\|rejected |
| running | stop | killed | 收到 stop_subagent |
| completed/failed/killed | resume | running | transcript + metadata 可用 |

补充：

1. `running` 状态可接收消息（进入 pending_message_queue）。
2. `pending` 状态也可接收消息（排队，待进入 `running` 后消费）。
3. `completed|failed|killed` 可进入 `resume`（若 transcript/metadata 可用）。
4. 所有状态迁移必须持久化后再对外可见。

#### 3.3.1 状态转换竞态防护

- [ ] 实现乐观锁状态转换：更新时使用 `WHERE agent_id = ? AND status = ?`
- [ ] 若 `affected_rows = 0`，重新读取当前状态并按优先级决策
- [ ] 优先级规则：外部指令（stop）> 自然完成（complete/fail）
- [ ] 并发 stop + complete：stop 先到则结果为 killed，complete 先到则结果为 completed
- [ ] 写入单元测试覆盖所有并发竞态场景

## 4. API 契约（MVP）

### 4.0 字段校验规则

所有 API 输入必须通过统一校验层，校验失败返回 `INVALID_INPUT`。

| 字段 | 类型 | 最小长度 | 最大长度 | 格式约束 |
|-----|------|---------|---------|---------|
| description | string | 1 | 200 | 非空 trim |
| prompt | string | 1 | 100000 | 非空 |
| name | string | 1 | 64 | `[a-zA-Z0-9_-]`，会话内唯一 |
| agentId | string | 1 | 128 | UUID 或系统生成 ID |
| subagent_type | string | 1 | 64 | 必须在合法类型列表中 |

校验清单：

- [ ] 实现 `description` 长度校验（1-200）
- [ ] 实现 `prompt` 长度校验（1-100000）
- [ ] 实现 `name` 格式校验（仅 `[a-zA-Z0-9_-]`）
- [ ] 实现 `name` 唯一性校验（同会话不可重名，冲突返回 `NAME_CONFLICT`）
- [ ] 实现 `subagent_type` 合法性校验，非法值返回 `INVALID_AGENT_TYPE`
- [ ] 实现 `timeout_ms` 范围校验（0 < value ≤ 3600000）
- [ ] 所有校验错误统一返回 `{ error: { code: "INVALID_INPUT", field: string, message: string, recoverable: false } }`

### 4.1 spawn_subagent

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| description | string | 是 | 简短摘要（建议 3-5 词；硬校验按 1-200 字符） |
| prompt | string | 是 | 任务描述 |
| subagent_type | string | 否 | 子代理类型，默认 "general-purpose" |
| run_in_background | boolean | 否 | 默认 true |
| name | string | 否 | 注册别名 |
| mode | string | 否 | "default" \| "plan" \| "acceptEdits" \| "bypassPermissions" \| "dontAsk" |
| isolation | string | 否 | "none" \| "worktree" |
| timeout_ms | number | 否 | 超时时间，默认 300000 (5分钟) |

超时约束：

1. 默认 `timeout_ms=300000`（5 分钟）。
2. 最大 `timeout_ms=3600000`（1 小时）。
3. 若传入值超过最大值，返回 `TIMEOUT_EXCEEDS_MAX`。

输出（二态）：

**同步完成**：
```typescript
{
  status: "completed",
  content: string,          // 执行结果文本
  usage: {
    total_tokens: number,
    input_tokens: number,
    output_tokens: number,
    duration_ms: number,
    tool_calls: number,
    exit_reason: "completed"
  }
}
```

**异步启动**：
```typescript
{
  status: "async_launched",
  agentId: string,          // 唯一标识
  outputFile: string,       // 结果文件路径
  estimated_duration_ms?: number
}
```

实现清单：

- [ ] 同步模式（`run_in_background=false`）：主代理阻塞等待结果
- [ ] 异步模式（`run_in_background=true`，默认）：立即返回 `agentId`
- [ ] 生成唯一 `agentId`（UUID v4）
- [ ] 创建持久化记录（status=pending → running）
- [ ] 注册 `name` 别名到查找表
- [ ] `name` 重名时返回 `NAME_CONFLICT`
- [ ] 设置超时定时器（`timeout_ms`）
- [ ] 超时触发：状态转 `failed`，`exit_reason=timeout`，发送通知
- [ ] 返回值包含 `agentId` 和 `outputFile` 路径
- [ ] 达到并发上限时返回 `CONCURRENCY_LIMIT`
- [ ] 请求高权限但未授权时返回 `PERMISSION_DENIED`（不自动降级）

### 4.2 send_message_to_subagent

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| to | string | 是 | agentId 或注册别名 |
| message | string | 是 | 消息内容 |
| timeout_ms | number | 否 | 等待排队超时，默认 5000 |

行为：

1. 目标 `pending`：排队，与 `running` 相同处理。
2. 目标 `running`：排队，下一轮工具执行点消费。
   - 消息队列：`Array<{message: string, enqueued_at: number}>`
   - 队列最大长度：100（可配置）
   - 队列满时：`overflow_action: "reject" | "drop_oldest"`
3. 目标 `failed|killed`：自动触发 `resume_subagent`，并将当前 `message` 原文作为 `resume_subagent.prompt`。
4. 目标 `completed`：返回 `TASK_ALREADY_COMPLETED`，需显式调用 `resume_subagent` 或重新 `spawn_subagent`。
5. 目标不存在：返回 `TASK_NOT_FOUND`。
6. 若 `message` 为空：返回 `INVALID_MESSAGE`，不触发 `resume_subagent`。
7. 若自动 `resume_subagent` 失败：返回对应错误码（如 `TRANSCRIPT_NOT_FOUND`），并在响应中带 `resumed=false` 与错误详情。

队列规格：
```typescript
{
  max_queue_size: 100,           // 默认 100
  overflow_action: "reject" | "drop_oldest",  // 默认 "reject"
  message_timeout_ms: 300000,     // 默认 5 分钟，消息在队列中最长等待时间
  retry_on_timeout: boolean       // 默认 false
}
```

输出：
```typescript
{
  success: boolean,
  message: string,               // 用户可读状态
  queued_at?: number,            // 排队时间戳
  queue_position?: number,       // 当前队列位置
  resumed?: boolean,             // 是否通过自动 resume 处理
  resume_error?: {               // 自动 resume 失败时返回
    code: string,
    message: string,
    recoverable: boolean
  }
}
```

实现清单：

- [ ] `pending` 状态：消息排队，待进入 `running` 后消费
- [ ] `running` 状态：消息排队，下一轮工具执行点消费
- [ ] `failed|killed` 状态：自动触发 resume，`message` 作为 resume prompt
- [ ] `completed` 状态：返回 `TASK_ALREADY_COMPLETED`
- [ ] 不存在的 agentId：返回 `TASK_NOT_FOUND`
- [ ] 空消息：返回 `INVALID_MESSAGE`
- [ ] 消息队列最大长度 100，满时按 `overflow_action` 处理
- [ ] `overflow_action=reject`：返回 `QUEUE_FULL`
- [ ] `overflow_action=drop_oldest`：丢弃最早消息，新消息入队
- [ ] 消息超时清理：超过 `message_timeout_ms` 未消费的消息自动丢弃
- [ ] `timeout_ms` 含义明确为"等待排队超时"（非等待处理完成）
- [ ] 支持 `name` 别名查找（与 `agentId` 等价）
- [ ] 同一子代理按消息顺序消费（FIFO）
- [ ] 自动 resume 失败时透传 resume 错误码，并返回 `resume_error`

### 4.3 stop_subagent

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| agentId | string | 是 | 子代理唯一标识 |
| force | boolean | 否 | 强制终止，默认 false |
| timeout_ms | number | 否 | 等待清理时间，默认 10000 |

行为：

1. 若 `force=false`：发送软中断信号，等待子代理清理资源（最多 timeout_ms）。
2. 若 `force=true` 或超时：发送硬终止信号。
3. 状态转 `killed`。
4. 发送 `task_notification(status=killed)`。
5. 取消该子代理的超时定时器。

失败条件：
- 子代理处于 zombie 状态（无法终止）

幂等要求：
- 若子代理已处于 `completed|failed|killed`，应返回成功（`already_stopped=true`），不作为错误。

实现清单：

- [ ] `force=false`：发送软中断信号，等待 cleanup
- [ ] `force=true`：直接硬终止
- [ ] 软中断超时后自动升级为硬终止
- [ ] 状态转 `killed`，`exit_reason=stopped`
- [ ] 发送 `task_notification(status=killed)`
- [ ] 取消该子代理的超时定时器
- [ ] 幂等处理：已终止状态返回 `{ success: true, already_stopped: true }`
- [ ] worktree 隔离模式：清理临时工作目录（根据 `cleanup_on_exit` 配置）
- [ ] 注销 `name` 别名（如已注册）
- [ ] zombie 状态检测：连续 3 次硬终止失败返回 `PROCESS_ZOMBIE`

### 4.4 resume_subagent

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| agentId | string | 是 | 任务 ID |
| prompt | string | 是 | 本次续跑指令 |
| from_checkpoint | string | 否 | checkpoint ID，默认从头 |
| timeout_ms | number | 否 | 超时时间，默认 300000（最大 3600000） |

行为：

1. 读取 transcript + metadata。
2. 清理不完整消息块（如孤立的 tool_use）。
3. 重建上下文与执行参数。
4. 进入后台生命周期并发出通知。

输出（与 spawn 异步输出一致）：
```typescript
{
  status: "resumed",
  agentId: string,
  outputFile: string,
  resumed_from: string | null,   // checkpoint ID
  transcript_entries_recovered: number
}
```

超时约束：

1. 默认 `timeout_ms=300000`（5 分钟）。
2. 最大 `timeout_ms=3600000`（1 小时）。
3. 若传入值超过最大值，返回 `TIMEOUT_EXCEEDS_MAX`。

失败条件：

| 失败原因 | 错误码 | 可恢复性 |
|---------|-------|---------|
| transcript 丢失 | TRANSCRIPT_NOT_FOUND | 不可恢复 |
| transcript 格式损坏 | TRANSCRIPT_CORRUPTED | 不可恢复 |
| metadata 不可解析 | METADATA_INVALID | 需人工介入 |
| schema_version 不兼容 | SCHEMA_VERSION_MISMATCH | 需迁移脚本 |
| 隔离目录无效且无法回退 | ISOLATION_FAILED | 可用 isolation="none" 重试 |
| 子代理进程处于 zombie 状态 | PROCESS_ZOMBIE | 需 kill -9 |
| 资源耗尽无法重建上下文 | RESOURCE_EXHAUSTED | 需释放资源后重试 |

实现清单：

- [ ] 读取 transcript 文件并校验为合法 JSONL（按完整行解析）
- [ ] 读取 metadata，校验可解析性
- [ ] 从 metadata 读取并校验 `schema_version`
- [ ] 清理不完整消息块（tool_use 无对应 tool_result）
- [ ] `from_checkpoint` 支持从指定 checkpoint 恢复
- [ ] `from_checkpoint=null` 时从 transcript 最后完整消息恢复
- [ ] 重建上下文并重新注册任务
- [ ] 状态转 `running`，发送 `task_notification(status=running)`
- [ ] 设置新的超时定时器
- [ ] 返回恢复信息（resumed_from、recovered 条目数）
- [ ] `schema_version` 不兼容时返回 `SCHEMA_VERSION_MISMATCH`
- [ ] 恢复失败时保持原状态不变（不污染状态）

### 4.5 主动查询 API

#### 4.5.1 get_subagent_status

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| agentId | string | 是 | 子代理唯一标识 |

输出：
```typescript
{
  agentId: string,
  status: TaskStatus,
  description: string,
  created_at: number,
  updated_at: number,
  last_activity_at: number,
  queue_depth: number,             // 待消费消息数
  usage?: {
    total_tokens: number,
    input_tokens: number,
    output_tokens: number,
    duration_ms: number,
    tool_calls: number
  },
  isolation?: IsolationMetadata,
  error?: { code: string, message: string }
}
```

实现清单：

- [ ] 根据 `agentId` 查询当前状态
- [ ] 返回完整状态信息（含 usage、queue_depth）
- [ ] 不存在的 agentId 返回 `TASK_NOT_FOUND`
- [ ] 支持 `name` 别名查询

#### 4.5.2 list_subagents

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| status | string | 否 | 按状态过滤 |
| limit | number | 否 | 默认 50，最大 200 |
| offset | number | 否 | 默认 0 |

输出：
```typescript
{
  agents: Array<{
    agentId: string,
    name?: string,
    description: string,
    status: TaskStatus,
    created_at: number,
    updated_at: number
  }>,
  total: number
}
```

实现清单：

- [ ] 返回当前会话所有子代理摘要列表
- [ ] 支持 `status` 过滤
- [ ] 支持 `limit`/`offset` 分页
- [ ] 返回 `total` 总数

### 4.6 batch_spawn（Phase 2）

用途：一次提交多个独立子任务，降低主循环多次工具调用开销。

输入：
```typescript
{
  tasks: Array<{
    description: string,
    prompt: string,
    subagent_type?: string,
    name?: string,
    mode?: string,
    isolation?: string,
    timeout_ms?: number
  }>,
  run_in_background?: boolean,
  mode?: string,
  isolation?: string,
  max_concurrency?: number
}
```

输出：
```typescript
{
  launched: Array<{
    task_index: number,
    agentId: string,
    outputFile: string
  }>,
  rejected: Array<{
    task_index: number,
    reason: string,
    error_code: string
  }>
}
```

约束：

1. 单次批量大小上限：20。
2. 调度器按 `max_concurrency` 分批启动。
3. 失败策略：best-effort（部分成功），不回滚已启动的任务。

### 4.7 错误码注册表

所有 API 统一使用以下错误码：

#### 客户端错误

| 错误码 | HTTP 类比 | 说明 | 关联 API |
|-------|----------|------|---------|
| INVALID_INPUT | 400 | 字段校验失败（含具体 field） | 所有 |
| INVALID_MESSAGE | 400 | 消息内容为空 | send_message |
| INVALID_AGENT_TYPE | 400 | subagent_type 不在合法列表中 | spawn |
| TIMEOUT_EXCEEDS_MAX | 400 | timeout_ms 超过上限 | spawn, resume |
| TASK_NOT_FOUND | 404 | agentId 不存在 | send_message, stop, resume, get_status |
| TASK_ALREADY_COMPLETED | 409 | 目标任务已完成 | send_message |
| NAME_CONFLICT | 409 | `name` 别名已存在（同会话） | spawn |
| QUEUE_FULL | 429 | 消息队列已满 | send_message |
| CONCURRENCY_LIMIT | 429 | 并发子代理数达到上限 | spawn, batch_spawn |
| PERMISSION_DENIED | 403 | 请求的 mode 未授权 | spawn |

#### 系统错误

| 错误码 | HTTP 类比 | 说明 | 关联 API |
|-------|----------|------|---------|
| PERSISTENCE_WRITE_FAILED | 500 | 持久化写入失败 | spawn, stop, resume |
| TRANSCRIPT_NOT_FOUND | 500 | transcript 文件丢失 | resume |
| TRANSCRIPT_CORRUPTED | 500 | transcript 格式损坏 | resume |
| METADATA_INVALID | 500 | metadata 不可解析 | resume |
| SCHEMA_VERSION_MISMATCH | 500 | 持久化格式版本不兼容 | resume |
| ISOLATION_FAILED | 500 | 隔离环境创建失败 | spawn, resume |
| PROCESS_ZOMBIE | 500 | 子代理进程无法终止 | stop |
| RESOURCE_EXHAUSTED | 503 | 资源耗尽 | spawn, resume |

错误响应统一格式：
```typescript
{
  error: {
    code: string,          // 错误码
    message: string,       // 人读描述
    field?: string,        // 关联字段（INVALID_INPUT 时）
    recoverable: boolean   // 是否可重试
  }
}
```

实现清单：

- [ ] 定义 `SubAgentError` 类型，包含 code、message、field、recoverable
- [ ] 所有 API 入口统一错误处理
- [ ] 客户端错误（4xx 类）不重试
- [ ] 系统错误中 `recoverable=true` 的可自动重试

### 4.8 输出文件规范

```typescript
{
  output_file_spec: {
    format: "jsonl",                // 每行一个 JSON 事件
    encoding: "utf-8",
    max_size_bytes: 10485760,       // 单文件上限 10MB
    truncation_strategy: "line_safe_head_tail" // 仅按完整 JSON 行裁剪，保留头尾
  }
}
```

每行事件格式：
```typescript
{
  type: "text_output" | "tool_call" | "tool_result" | "error",
  timestamp: number,
  data: string | object
}
```

实现清单：

- [ ] 输出文件使用 JSONL 格式，每行一个事件
- [ ] 单文件大小上限 10MB，超限时按完整行保留头尾（禁止半行 JSON）
- [ ] 截断发生时追加一条 `type="error"`、`data="[truncated]"` 的标记事件
- [ ] 写入时使用原子操作（write-to-temp + rename）
- [ ] 支持并发读（多个消费者同时读取）

## 5. 通知协议

`task_notification` 事件结构：

```typescript
{
  event_type: "task_notification",
  agentId: string,
  status: "running" | "completed" | "failed" | "killed",
  summary: string,                    // 摘要（最多 500 字符）
  result?: string,                    // 文本结果（人读）
  exit_reason?: "completed" | "error" | "signal" | "timeout" | "rejected" | "stopped",
  usage?: {
    total_tokens: number,
    input_tokens: number,
    output_tokens: number,
    duration_ms: number,
    tool_calls: number
  },
  output_file?: string,
  error?: {
    code: string,
    message: string,
    recoverable: boolean
  },
  timestamp: number
}
```

约束：

1. 通知是异步事件，不占用当前工具调用返回通道。
2. 主循环收到通知后，按普通输入事件处理，但可通过 `event_type` 区分来源。
3. `running` 通知在子代理首次工具调用时发送（不是启动时）。
4. `summary` 最长 500 字符，超出截断。
5. 通知投递失败不重试（主代理可通过 `get_subagent_status` 主动查询）。
6. `completed|failed|killed` 通知必须包含 `exit_reason`。

实现清单：

- [ ] 通知事件结构严格遵循上述 TypeScript 类型
- [ ] `summary` 长度限制 500 字符
- [ ] `running` 通知在子代理首次工具调用时触发（非启动时）
- [ ] `completed` 通知包含 `result` 和 `usage`
- [ ] `failed` 通知包含 `error`（含 code、message、recoverable）
- [ ] `killed` 通知包含 `exit_reason`
- [ ] 通知不阻塞子代理执行（异步投递）
- [ ] 通知投递失败时记录 WARN 日志，不重试

### 5.1 结构化结果协议（Phase 2）

为减少"纯文本解析"带来的不稳定性：

1. `result_schema_id?: string`（声明结果结构版本）
2. `result_json?: object`（结构化结果）

约束：

1. `result`（文本）与 `result_json` 可同时存在；文本用于人读，JSON 用于程序消费。
2. `result_schema_id` 版本化管理。
3. 主代理优先消费 `result_json`，回退到 `result` 文本。

## 6. 上下文策略

| 策略 | 说明 | 使用场景 |
|-----|------|---------|
| `fresh` | 新子代理默认不继承主对话 | 独立任务 |
| `continue` | 同一子代理续跑继承其 transcript | 长时间任务 |
| `fork`（Phase 2） | 继承主代理当前上下文 | 需要上下文连续性 |

约束：

1. 子代理上下文预算独立，不挤占主代理上下文窗口。
2. 子代理输出默认不自动并入主代理长期上下文，只通过通知摘要回流。

实现清单：

- [ ] `fresh` 策略：子代理从空上下文开始
- [ ] `continue` 策略：resume 时加载完整 transcript 作为上下文
- [ ] 子代理上下文窗口大小独立配置
- [ ] 子代理输出通过通知摘要回流，不直接注入主代理上下文
- [ ] Phase 2 `fork` 策略：深拷贝主代理当前上下文快照

## 7. 权限与隔离

### 7.1 权限模式

| 模式 | 说明 | 风险等级 |
|-----|------|---------|
| default | 系统默认配置 | 低 |
| plan | 仅规划，不执行 | 低 |
| acceptEdits | 接受编辑请求 | 中 |
| bypassPermissions | 绕过权限检查 | 高 |
| dontAsk | 不询问直接执行 | 高 |

约束：

1. 高权限模式（bypassPermissions, dontAsk）必须记录日志（含 mode 来源）。
2. 子代理可指定 mode，未指定时使用系统默认。
3. 请求高权限但未授权时返回 `PERMISSION_DENIED`，不自动降级。

实现清单：

- [ ] 支持 5 种权限模式
- [ ] 高权限模式使用时记录日志（含 mode、来源）
- [ ] 未授权的高权限请求返回 `PERMISSION_DENIED`（不自动降级）

### 7.2 工具边界

默认工具集定义见 §2.4。本节补充规则：

1. 子代理工具集支持 allowlist/denylist 覆盖默认配置。
2. 异步子代理（后台 Worker）可配置更严格工具白名单。

实现清单：

- [ ] 子代理工具集支持 allowlist/denylist 覆盖 §2.4 默认配置
- [ ] 后台 Worker 模式可配置更严格的工具白名单

### 7.3 隔离模式

浏览器环境下，隔离通过 OPFS 子目录实现（非 git worktree）：

| 模式 | 说明 | 浏览器实现 | 适用场景 |
|-----|------|---------|---------|
| none | 与主代理共享 OPFS 目录 | 直接操作主 OPFS 目录 | 轻量任务 |
| worktree | 独立 OPFS 子目录 | 创建 `.subagents/{agentId}/` 子目录 | 需要文件隔离的操作 |

隔离元数据：
```typescript
{
  isolation_mode: "none" | "worktree",
  opfs_subdir?: string,       // worktree 模式时：".subagents/{agentId}/"
  cleanup_on_exit: boolean    // 默认 true
}
```

实现清单：

- [ ] `none` 模式：共享主 OPFS 目录
- [ ] `worktree` 模式：在 OPFS 创建 `.subagents/{agentId}/` 子目录
- [ ] `cleanup_on_exit=true`：子代理结束后清理子目录
- [ ] `cleanup_on_exit=false`：保留子目录供后续检查
- [ ] 清理时机：子代理状态变为终态后延迟 60 秒（允许读取输出）
- [ ] worktree 创建失败返回 `ISOLATION_FAILED`
- [ ] 子目录初始内容可从主 OPFS 复制（可选）

## 8. 持久化与恢复

每个任务最小持久化结构：

```typescript
{
  agent_id: string,
  agent_type: string,
  status: TaskStatus,
  description: string,
  prompt: string,
  transcript_path: string,
  output_file: string,
  isolation: IsolationMetadata,
  created_at: number,
  updated_at: number,
  metadata: {
    schema_version: "1.0",          // 必需：用于格式迁移（单一真源）
    exit_reason?: string,
    last_checkpoint?: string,
    tool_call_count: number
  }
}
```

恢复流程：

1. 读取 transcript + metadata。
2. 验证 metadata 中的 `schema_version`，处理格式迁移。
3. 清理不完整消息块（判断标准：tool_use 无对应 tool_result）。
4. 重建上下文。
5. 重新注册任务并进入后台生命周期。

### 8.1 Transcript 格式规范

```typescript
{
  transcript_format: {
    type: "jsonl",                  // 每行一个消息事件
    max_size_bytes: 52428800,       // 50MB
    rotation_policy: "truncate_oldest"
  }
}
```

每行格式：
```typescript
{
  role: "user" | "assistant" | "tool_use" | "tool_result",
  content: string | object,
  timestamp: number,
  metadata?: Record<string, unknown>
}
```

实现清单：

- [ ] transcript 使用 JSONL 格式，每行一个消息事件
- [ ] transcript 每行必须是完整 JSON（禁止半行写入）
- [ ] `schema_version` 仅存储在 metadata（单一真源）并用于格式迁移
- [ ] 单文件最大 50MB，超限时按完整行截断最早消息
- [ ] 写入使用 append-only 模式
- [ ] schema_version 不兼容时返回 `SCHEMA_VERSION_MISMATCH`

### 8.2 数据清理与保留策略

```typescript
{
  data_retention: {
    completed_ttl_ms: 86400000,     // 完成后 24h
    failed_ttl_ms: 172800000,       // 失败后 48h（便于调试）
    killed_ttl_ms: 86400000,        // 终止后 24h
    cleanup_interval_ms: 3600000,   // 每小时扫描清理
    max_disk_usage_bytes: 536870912 // 总上限 512MB
  }
}
```

实现清单：

- [ ] 完成任务数据保留 24h 后自动清理
- [ ] 失败任务数据保留 48h 后自动清理
- [ ] 定时扫描：每小时执行一次清理
- [ ] 所有 subagent 数据总大小不超过 512MB
- [ ] 超过总量限制时优先清理最老数据
- [ ] 清理范围：transcript 文件、output 文件、metadata 记录
- [ ] 清理前记录 INFO 日志（含 agentId、数据大小）

## 9. 调度与并发

### 9.1 调度规则（MVP）

| 规则 | 值 | 说明 |
|-----|---|-----|
| 单会话最大并发数 | 20 | 可配置 |
| 单子代理最大队列长度 | 100 | 可配置 |
| 子代理默认超时 | 300000ms | 5 分钟 |
| 子代理最大超时 | 3600000ms | 1 小时 |

行为规范：

1. 支持同一回合并发启动多个子代理。
2. 主代理不阻塞等待后台子任务。
3. 同一子代理按消息顺序消费 queued message。
4. 超时后自动终止并发送 `task_notification(status=failed)`。

实现清单：

- [ ] 最大并发数可配置，默认 20
- [ ] 达到并发上限时 spawn 返回 `CONCURRENCY_LIMIT`
- [ ] 主代理在子代理运行期间可继续处理其他请求
- [ ] 超时后自动终止：状态转 `failed`，`exit_reason=timeout`
- [ ] 超时终止后发送通知

### 9.2 资源预算控制

#### 9.2.1 单子代理预算

```typescript
{
  token_budget?: {
    max_total_tokens: number,     // 单个子代理 token 上限
    max_tool_calls: number        // 单个子代理工具调用次数上限
  }
}
```

#### 9.2.2 会话全局预算

```typescript
{
  session_budget: {
    max_total_subagent_tokens: number,  // 会话内所有子代理 token 总量
    max_total_subagent_count: number    // 会话内子代理总数上限
  }
}
```

#### 9.2.3 工具结果限流

```typescript
{
  tool_result_limits: {
    max_result_size_bytes: 1048576,  // 单次工具结果 1MB
    truncation_strategy: "head_tail" // 截断保留头尾
  }
}
```

实现清单：

- [ ] spawn 时可指定 `token_budget.max_total_tokens`
- [ ] 子代理 token 消耗达到上限时自动终止
- [ ] spawn 时可指定 `token_budget.max_tool_calls`
- [ ] 子代理工具调用次数达到上限时自动终止
- [ ] 会话全局 token 总量限制，超限 spawn 返回 `RESOURCE_EXHAUSTED`
- [ ] 会话全局子代理数量限制，超限 spawn 返回 `CONCURRENCY_LIMIT`
- [ ] 单次工具调用结果大小上限 1MB
- [ ] 超限截断保留头尾，标记 `[truncated]`
- [ ] 预算超限终止时发送 `task_notification(status=failed, error.code=RESOURCE_EXHAUSTED)`

## 10. 可观测性

### 10.1 指标定义

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| subagent_spawn_total | Counter | 累计启动数 |
| subagent_completed_total | Counter | 累计完成数 |
| subagent_failed_total | Counter | 累计失败数 |
| subagent_killed_total | Counter | 累计终止数 |
| subagent_resume_total | Counter | 累计恢复数 |
| subagent_resume_success_total | Counter | 累计恢复成功数 |
| subagent_active_gauge | Gauge | 当前活动任务数 |
| subagent_queue_size | Histogram | 消息队列长度分布 |
| subagent_duration_ms | Histogram | 执行时长分布 |
| subagent_tokens_total | Histogram | token 消耗分布 |

实现清单：

- [ ] 所有 Counter/Gauge/Histogram 指标均可采集
- [ ] 指标通过统一的 metrics 接口暴露
- [ ] `subagent_active_gauge` 实时反映当前运行中子代理数
- [ ] `subagent_duration_ms` 包含 p50/p95/p99 百分位
- [ ] `subagent_tokens_total` 按 subagent_type 分标签

### 10.2 日志规范

每条日志必须包含：

```typescript
{
  timestamp: number,
  level: "DEBUG" | "INFO" | "WARN" | "ERROR",
  event: string,              // 事件类型
  agentId: string,
  mode?: string,
  isolation?: string,
  duration_ms?: number,
  error?: {
    code: string,
    message: string,
    stack?: string
  }
}
```

生命周期事件（必须记录）：

| 事件 | 级别 | 说明 |
|-----|------|------|
| SUBAGENT_SPAWN | INFO | 子代理启动 |
| SUBAGENT_MESSAGE_SENT | DEBUG | 消息发送 |
| SUBAGENT_MESSAGE_QUEUED | DEBUG | 消息排队 |
| SUBAGENT_COMPLETE | INFO | 子代理完成 |
| SUBAGENT_FAIL | ERROR | 子代理失败 |
| SUBAGENT_KILL | WARN | 子代理被终止 |
| SUBAGENT_RESUME | INFO | 子代理恢复 |
| SUBAGENT_TIMEOUT | WARN | 子代理超时 |

实现清单：

- [ ] 所有生命周期事件均记录日志
- [ ] 高权限模式使用时记录日志（含 mode 来源）
- [ ] 错误日志包含 stack trace（非生产环境）

### 10.3 追踪上下文

- trace_id 在 spawn 时生成，沿用至任务结束
- 子代理默认生成独立 trace_id，并记录 `parent_trace_id` 指向主代理 trace_id
- `fork`（Phase 2）仅表示上下文继承，不改变 trace 关联规则

实现清单：

- [ ] spawn 时生成唯一 `trace_id`
- [ ] 子代理记录 `parent_trace_id` 指向主代理
- [ ] resume 时沿用原 `trace_id`
- [ ] 同一子代理的所有日志、通知包含相同 `trace_id`

## 11. 验收标准（Phase 1）

### 11.1 功能验收

| ID | 标准 | 可验证标准 | 测试场景 |
|----|------|----------|---------|
| AC-1 | 能启动子代理并返回可追踪 agentId | agentId 非空且唯一 | spawn 后查询 get_subagent_status |
| AC-2 | 能向运行中子代理发送消息并按顺序消费 | 发送 3 条消息，消费顺序验证 | send_message 后检查队列状态 |
| AC-3 | 能停止子代理并收到 killed 通知 | 收到 status=killed 通知 | stop_subagent 后验证 |
| AC-4 | 完成/失败均能稳定通知且带摘要 | 100 次测试中 ≥99 次在 5s 内收到通知 | 压力测试 |
| AC-5 | 会话中断后可恢复执行 | 模拟进程重启，resume 成功 | kill -9 后 resume |
| AC-6 | 主代理在子任务运行期间仍可处理其他请求 | 并发 5 个子代理，主代理响应时间 <500ms | 并发测试 |

### 11.2 功能验收 Checklist

- [ ] **AC-1**: spawn 返回唯一 agentId
- [ ] **AC-1**: get_subagent_status 能查询到启动的子代理
- [ ] **AC-1**: list_subagents 能列出所有子代理
- [ ] **AC-2**: 向 running 子代理发送消息，按 FIFO 顺序消费
- [ ] **AC-2**: 向 pending 子代理发送消息，进入 running 后消费
- [ ] **AC-2**: 消息队列满时按 overflow_action 处理
- [ ] **AC-2**: 空 message 返回 INVALID_MESSAGE
- [ ] **AC-3**: stop_subagent 后收到 killed 通知
- [ ] **AC-3**: force stop 立即终止
- [ ] **AC-3**: 已终止子代理重复 stop 返回 already_stopped
- [ ] **AC-4**: 完成/失败通知 100 次中 ≥99 次在 5s 内到达
- [ ] **AC-5**: resume 从 transcript 恢复上下文
- [ ] **AC-5**: resume 清理不完整消息块
- [ ] **AC-5**: transcript 丢失返回 TRANSCRIPT_NOT_FOUND
- [ ] **AC-6**: 5 个并发子代理运行时主代理响应 <500ms

### 11.3 非功能验收 Checklist

- [ ] 所有 API 字段校验生效（空值、超长、格式错误）
- [ ] 错误码注册表完整，所有错误路径返回正确错误码
- [ ] 并发竞态：stop + complete 冲突正确处理
- [ ] 超时机制：子代理超时自动终止并发送通知
- [ ] 幂等性：重复 stop/重复 send 不会导致错误状态
- [ ] 数据清理：过期数据自动清理，总量不超限
- [ ] 输出文件：格式正确、大小受限、可并发读
- [ ] Token 预算：超限自动终止
- [ ] SubAgent 不注入 SOUL.md/IDENTITY.md/AGENTS.md 等 agent 身份文件

### 11.4 故障注入测试用例

| 场景 | 注入方式 | 预期行为 |
|-----|---------|---------|
| 子代理卡死 | 发送虚假 stop 信号 | 超时后自动终止 |
| 消息队列满 | 发送 101 条消息 | 根据 overflow_action 处理 |
| 持久化失败 | mock 文件系统错误 | 返回 PERSISTENCE_WRITE_FAILED |
| 并发竞争 | 同时发送 20 个 spawn | 验证并发限制生效 |
| Transcript 损坏 | 手动修改 transcript 文件 | resume 返回 TRANSCRIPT_CORRUPTED |
| 输出文件超限 | 子代理产生 >10MB 输出 | 截断保留头尾 |
| Token 预算耗尽 | 设置极小 token 预算 | 自动终止并通知 |

## 12. 实施阶段

### Phase 1（MVP）

| 功能 | 状态 | 优先级 | Checklist |
|-----|------|-------|----------|
| 运行时适配（Web Worker 载体、OPFS 映射） | 待实现 | P0 | §2.1 |
| SubAgent system prompt 与上下文构建 | 待实现 | P0 | §2.2 |
| agent-loop 复用与 SubAgentRunner | 待实现 | P0 | §2.3 |
| 默认工具集与权限边界 | 待实现 | P0 | §2.4 |
| spawn/send/stop/resume | 待实现 | P0 | §4.1, §4.2, §4.3, §4.4 |
| task_notification | 待实现 | P0 | §5 |
| 超时机制 | 待实现 | P0 | §9.1 |
| transcript + metadata 持久化 | 待实现 | P0 | §8, §8.1 |
| fresh + continue 上下文策略 | 待实现 | P0 | §6 |
| 基础权限与 OPFS 子目录隔离 | 待实现 | P0 | §7.1, §7.3 |
| 字段校验与错误码 | 待实现 | P0 | §4.0, §4.7 |
| 状态转换竞态防护 | 待实现 | P0 | §3.3.1 |
| get_subagent_status / list_subagents | 待实现 | P1 | §4.5 |
| 基础指标与日志 | 待实现 | P1 | §10 |
| 队列规格（max_queue_size） | 待实现 | P1 | §4.2 |
| 输出文件规范 | 待实现 | P1 | §4.8 |
| 数据清理策略 | 待实现 | P2 | §8.2 |
| Token 预算控制 | 待实现 | P2 | §9.2 |

### Phase 2

| 功能 | 状态 |
|-----|------|
| fork 上下文策略 | 规划中 |
| 细粒度工具与权限控制 | 规划中 |
| batch_spawn 批量派发 | 规划中 |
| 结构化结果协议（result_schema_id + result_json） | 规划中 |
