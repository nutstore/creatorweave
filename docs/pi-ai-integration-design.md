# `pi-ai` 接入设计（CreatorWeave）

## 1. 目标

1. 引入 `@mariozechner/pi-ai` 作为统一模型调用层。
2. 保持现有核心链路不变：`AgentLoop`、`ToolRegistry`、`OPFS/同步预览`、`Review` 主流程。
3. 支持灰度发布与一键回滚，避免影响线上可用性。

## 2. 当前架构现状

### 2.1 已有能力

- 已有统一 Provider 抽象：`web/src/agent/llm/llm-provider.ts`
- `AgentLoop` 已支持：
  - 流式内容
  - 工具调用（含 delta 拼接）
  - `reasoning_content`
  - usage 统计

### 2.2 当前问题

- 运行时主要使用 `GLMProvider`，多模型能力依赖 OpenAI-compatible 接口拼接，扩展成本高。
- 若后续扩展更多模型/能力（尤其工具调用细节差异），维护成本会快速上升。

## 3. 接入原则

1. **接口不变**：`LLMProvider` 不改，新增适配器实现。
2. **最小侵入**：只替换 Provider 构建处，不改 `AgentLoop` 协议逻辑。
3. **可回滚**：引入运行时开关，保留 legacy provider。
4. **浏览器优先**：沿用现有浏览器端 key 管理策略。

## 4. 目标架构

## 4.1 新增模块

1. `web/src/agent/llm/pi-ai-provider.ts`
   - 实现 `LLMProvider` 接口
   - 把 `pi-ai` 协议映射为项目内部 `ChatCompletionChunk` 结构

2. `web/src/agent/llm/provider-factory.ts`
   - 根据 settings / feature flag 选择 provider：
     - `PiAIProvider`
     - `GLMProvider`（fallback）

## 4.2 运行时接入点

- 替换 `conversation.store.sqlite.ts` 里直接 `new GLMProvider(...)` 的逻辑，改为 `createProvider(...)`。
- 如 `follow-up-generator` 里存在独立 provider 构建，也统一走 factory。

## 5. 协议映射设计

## 5.1 输入映射

- `ChatCompletionRequest.messages` -> `pi-ai` message schema
- `tools` -> `pi-ai` tools/function schema
- `toolChoice` -> `pi-ai` 对应策略
- `temperature/maxTokens` 保持透传

## 5.2 输出映射（流式）

- 文本 delta -> `choices[0].delta.content`
- reasoning delta -> `choices[0].delta.reasoning_content`
- 工具调用 delta -> `choices[0].delta.tool_calls[index].function.arguments`
- 结束态 -> `finish_reason`（`stop` / `tool_calls` / `length`）
- usage -> 映射到 `chunk.usage`（至少最终 chunk 有）

## 5.3 兼容降级

- 不支持 reasoning 的模型：仅输出 content，不中断流程。
- 不支持 tool delta 的模型：在 chunk 聚合后一次性输出完整 tool call。

## 6. 配置与开关

## 6.1 settings 扩展

新增字段（建议）：

- `llmRuntime: 'legacy' | 'pi-ai'`

默认：`legacy`（初始无行为变化）

## 6.2 Feature Flag

支持快速切换：

- localStorage: `bfsa_llm_runtime=pi-ai`
- 或 query 参数控制（仅开发环境）

## 7. 实施计划（分阶段）

## 阶段 1：基础接入（1-2 天）

- 新建 `PiAIProvider`
- 打通非工具流式对话
- 保证 `chat` / `chatStream` / `estimateTokens` 可用

## 阶段 2：工具调用能力（2-3 天）

- 打通 tool calling（含 stream args）
- 对齐 finish_reason 与 usage
- 跑通 agent loop 工具链

## 阶段 3：接线灰度（1-2 天）

- `conversation.store.sqlite.ts` 切换到 provider factory
- 增加 runtime 开关
- 小范围内部灰度

## 阶段 4：稳定化（1-2 天）

- 完善测试与日志
- 扩大默认启用范围
- 保留可回滚路径

## 8. 测试计划

## 8.1 单元测试

新增：

- `web/src/agent/llm/__tests__/pi-ai-provider.test.ts`
  - message 映射
  - stream delta 映射
  - tool_calls 映射
  - usage 映射

- `web/src/agent/llm/__tests__/provider-factory.test.ts`
  - runtime 选择逻辑
  - fallback 路径

## 8.2 集成测试

- 基于现有 `agent-loop` 测试场景，补一套 `PiAIProvider` mock stream 用例：
  - 单工具调用
  - 多工具调用
  - reasoning + content + tool_calls phase 切换
  - 错误与取消

## 8.3 手工回归清单

1. 普通流式问答
2. 工具调用（参数流式展示）
3. 工具调用后继续回复
4. 长上下文截断
5. 同步预览流程不受影响

## 9. 监控与回滚

## 9.1 观测指标

- 首 token 延迟
- 首轮完成时延
- tool_call 成功率
- agent loop 错误率
- 用户取消率

## 9.2 回滚策略

- 将 `llmRuntime` 切回 `legacy`
- 保留 `GLMProvider` 代码路径至少一个稳定版本周期

## 10. 风险与边界

1. `pi-ai` 不替代业务状态管理（`cache/files/pending/undo` 仍由项目自身负责）。
2. 模型间工具调用协议存在细节差异，需在 provider 层做兼容。
3. 浏览器端 key 策略维持现状，但应继续通过 CSP 与权限最小化降低风险面。

## 11. 预期收益

1. 降低多模型接入成本与协议维护成本。
2. 保持现有产品主流程稳定的前提下，加速能力扩展。
3. 团队精力可更多投入到差异化能力：同步预览、review 清单、记忆系统。

