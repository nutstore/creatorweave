# SubAgent 能力规范（独立）

## 1. 范围

本文只讨论通用 `SubAgent` 能力，不讨论任何领域业务。

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
2. `completed|failed|killed` 可进入 `resume`（若 transcript/metadata 可用）。
3. 所有状态迁移必须持久化后再对外可见。

## 4. API 契约（MVP）

字段约定：

1. 外部 API（请求/响应/通知）统一使用 `agentId`（camelCase）。
2. 内部持久化结构可使用 `agent_id`（snake_case）。

### 4.1 spawn_subagent

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| description | string | 是 | 3-5 词摘要 |
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

### 4.2 send_message_to_subagent

输入：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| to | string | 是 | agentId 或注册别名 |
| message | string | 是 | 消息内容 |
| timeout_ms | number | 否 | 发送超时，默认 5000 |

行为：

1. 目标 `running`：排队，下一轮工具执行点消费。
   - 消息队列：`Array<{message: string, enqueued_at: number}>`
   - 队列最大长度：100（可配置）
   - 队列满时：`overflow_action: "reject" | "drop_oldest"`
2. 目标 `failed|killed`：自动触发 `resume_subagent`，并将当前 `message` 原文作为 `resume_subagent.prompt`。
3. 目标 `completed`：返回 `TASK_ALREADY_COMPLETED`，需显式调用 `resume_subagent` 或重新 `spawn_subagent`。
4. 目标不存在：返回不可恢复错误。
5. 若 `message` 为空：返回 `INVALID_MESSAGE`，不触发 `resume_subagent`。

队列规格：
```typescript
{
  max_queue_size: 100,           // 默认 100
  overflow_action: "reject" | "drop_oldest",  // 默认 "reject"
  message_timeout_ms: 300000,     // 默认 5 分钟
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
  resumed?: boolean              // 是否通过自动 resume 处理
}
```

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

失败条件：
- 子代理处于 zombie 状态（无法终止）

幂等要求：
- 若子代理已处于 `completed|failed|killed`，应返回成功（`already_stopped=true`），不作为错误。

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
| 隔离目录无效且无法回退 | ISOLATION_FAILED | 可用 isolation="none" 重试 |
| 子代理进程处于 zombie 状态 | PROCESS_ZOMBIE | 需 kill -9 |
| 资源耗尽无法重建上下文 | RESOURCE_EXHAUSTED | 需释放资源后重试 |
| 依赖服务不可用 | SERVICE_UNAVAILABLE | 等待后重试 |

### 4.5 batch_spawn（Phase 2）

用途：一次提交多个独立子任务，降低主循环多次工具调用开销。

输入：
```typescript
{
  tasks: Array<{
    description: string,
    prompt: string,
    subagent_type?: string,
    name?: string,
    mode?: string,                   // 覆盖全局 mode
    isolation?: string,              // 覆盖全局 isolation
    timeout_ms?: number
  }>,
  run_in_background?: boolean,     // 默认 true
  mode?: string,                   // 全局默认，可被单任务覆盖
  isolation?: string,               // 全局默认，可被单任务覆盖
  max_concurrency?: number,         // 默认 10
  lock_key?: string,               // Phase 2
  dedupe_key?: string              // Phase 2
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
3. 调度层执行 `lock_key`（同一 key 串行）和 `dedupe_key`（同 key 保留一个活动任务）检查。

## 5. 通知协议

`task_notification` 事件结构：

```typescript
{
  event_type: "task_notification",
  agentId: string,
  status: "running" | "completed" | "failed" | "killed",
  summary: string,                    // 摘要（最多 500 字符）
  result?: string,                    // 文本结果（人读）
  result_json?: object,                // Phase 2：结构化结果
  result_schema_id?: string,           // Phase 2：结果结构版本
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

1. 高权限模式（bypassPermissions, dontAsk）必须可审计（日志含 mode 来源）。
2. 子代理可指定 mode，未指定时使用系统默认。

### 7.2 工具边界

1. 子代理工具集应可按 allowlist/denylist 配置。
2. 异步子代理可配置更严格工具白名单。
3. 禁止默认暴露以下管理类工具：
   - `stop_subagent`（禁止子代理停止自己或他人）
   - `spawn_subagent`（禁止递归派生，除非明确授权）
   - `get_agent_info`（禁止查询其他任务状态）

### 7.3 隔离模式

| 模式 | 说明 | 适用场景 |
|-----|------|---------|
| none | 与主代理共享工作目录 | 轻量任务 |
| worktree | 在临时工作副本执行，主目录隔离 | 危险操作 |

隔离元数据：
```typescript
{
  isolation_mode: "none" | "worktree",
  worktree_path?: string,      // worktree 模式时
  cleanup_on_exit: boolean      // 默认 true
}
```

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
  schema_version: "1.0",        // 必需：用于格式迁移
  metadata: {
    exit_reason?: string,
    last_checkpoint?: string,
    tool_call_count: number
  }
}
```

恢复流程：

1. 读取 transcript + metadata。
2. 验证 schema_version，处理格式迁移。
3. 清理不完整消息块（判断标准：tool_use 无对应 tool_result）。
4. 重建上下文。
5. 重新注册任务并进入后台生命周期。

## 9. 调度与并发

### 9.1 调度规则（MVP）

| 规则 | 值 | 说明 |
|-----|---|-----|
| 单会话最大并发数 | 20 | 可配置 |
| 单子代理最大队列长度 | 100 | 可配置 |
| 子代理默认超时 | 300000ms | 5 分钟 |
| 子代理最大超时 | 3600000ms | 1 小时（需确认） |

行为规范：

1. 支持同一回合并发启动多个子代理。
2. 主代理不阻塞等待后台子任务。
3. 同一子代理按消息顺序消费 queued message。
4. 超时后自动终止并发送 `task_notification(status=failed)`。

### 9.2 资源锁与去重（Phase 2）

| 机制 | 说明 | 冲突行为 |
|-----|------|---------|
| lock_key | 同一 key 任务串行执行 | 后续任务进入等待队列 |
| dedupe_key | 同 key 只保留一个活动任务 | 返回已有任务引用 |

约束：

1. `batch_spawn` 内部同样执行 lock/dedupe 检查。
2. dedupe_key 命中时返回：`{reused: true, agentId: existing_id}`。

## 10. 可观测性与运维

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
  },
  trace_id?: string           // 用于关联分析
}
```

生命周期事件（必须记录）：

| 事件 | 级别 | 说明 |
|-----|------|-----|
| SUBAGENT_SPAWN | INFO | 子代理启动 |
| SUBAGENT_MESSAGE_SENT | DEBUG | 消息发送 |
| SUBAGENT_MESSAGE_QUEUED | DEBUG | 消息排队 |
| SUBAGENT_COMPLETE | INFO | 子代理完成 |
| SUBAGENT_FAIL | ERROR | 子代理失败 |
| SUBAGENT_KILL | WARN | 子代理被终止 |
| SUBAGENT_RESUME | INFO | 子代理恢复 |
| SUBAGENT_TIMEOUT | WARN | 子代理超时 |

### 10.3 追踪上下文

- trace_id 在 spawn 时生成，沿用至任务结束
- 子代理默认生成独立 trace_id，并记录 `parent_trace_id` 指向主代理 trace_id
- `fork`（Phase 2）仅表示上下文继承，不改变 trace 关联规则

## 11. 验收标准（Phase 1）

| ID | 标准 | 可验证标准 | 测试场景 |
|----|------|----------|---------|
| AC-1 | 能启动子代理并返回可追踪 agentId | agentId 非空且唯一 | spawn 后查询 task_notification |
| AC-2 | 能向运行中子代理发送消息并按顺序消费 | 发送 3 条消息，消费顺序验证 | send_message 后检查队列状态 |
| AC-3 | 能停止子代理并收到 killed 通知 | 收到 status=killed 通知 | stop_subagent 后验证 |
| AC-4 | 完成/失败均能稳定通知且带摘要 | 100 次测试中 ≥99 次在 5s 内收到通知 | 压力测试 |
| AC-5 | 会话中断后可恢复执行 | 模拟进程重启，resume 成功 | kill -9 后 resume |
| AC-6 | 主代理在子任务运行期间仍可处理其他请求 | 并发 5 个子代理，主代理响应时间 <500ms | 并发测试 |

### 11.1 故障注入测试用例

| 场景 | 注入方式 | 预期行为 |
|-----|---------|---------|
| 子代理卡死 | 发送虚假 stop 信号 | 超时后自动终止 |
| 消息队列满 | 发送 101 条消息 | 根据 overflow_action 处理 |
| 持久化失败 | mock 文件系统错误 | 返回 PERSISTENCE_WRITE_FAILED |
| 并发竞争 | 同时发送 20 个 spawn | 验证并发限制生效 |

## 12. 实施阶段

### Phase 1（MVP）

| 功能 | 状态 | 优先级 |
|-----|------|-------|
| spawn/send/stop/resume | 待实现 | P0 |
| task_notification | 待实现 | P0 |
| 超时机制 | 待实现 | P0 |
| transcript + metadata 持久化 | 待实现 | P0 |
| fresh + continue 上下文策略 | 待实现 | P0 |
| 基础权限与 worktree 隔离参数透传 | 待实现 | P0 |
| 基础指标与日志 | 待实现 | P1 |
| 队列规格（max_queue_size） | 待实现 | P1 |

### Phase 2

| 功能 | 状态 |
|-----|------|
| fork 上下文策略 | 规划中 |
| 细粒度工具与权限控制 | 规划中 |
| batch_spawn 批量派发 | 规划中 |
| 结构化结果协议（result_schema_id + result_json） | 规划中 |
| 资源锁与去重（lock_key + dedupe_key） | 规划中 |
| 更完整的进度观测与自动重试策略 | 规划中 |
