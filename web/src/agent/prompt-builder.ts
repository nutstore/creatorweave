/**
 * Agent Prompt Builder
 *
 * 将 Agent 配置文件转换为 LLM 系统提示词。
 */

import type { AgentInfo } from '@/opfs'
import { DEFAULT_AGENT_TEMPLATE } from '@/opfs/agent/agent-templates'

export interface PromptOptions {
  /** 是否包含今日日记 */
  includeTodayLog?: boolean
  /** 今日日记内容 */
  todayLog?: string | null
  /** 额外的系统提示 */
  extraSystemPrompt?: string
}

/**
 * 构建 Agent 系统提示词
 */
export function buildAgentPrompt(agent: AgentInfo, options: PromptOptions = {}): string {
  const sections: string[] = []

  // 1. SOUL - 核心人格
  if (agent.soul.trim()) {
    sections.push(`# 核心人格\n\n${agent.soul.trim()}`)
  }

  // 2. IDENTITY - 身份
  if (agent.identity.trim()) {
    sections.push(`# 身份\n\n${agent.identity.trim()}`)
  }

  // 3. AGENTS - 工作流程
  if (agent.agents.trim()) {
    sections.push(`# 工作流程\n\n${agent.agents.trim()}`)
  }

  // 4. USER - 用户信息 (skip default unfilled template)
  if (agent.user.trim() && agent.user.trim() !== DEFAULT_AGENT_TEMPLATE.USER.trim()) {
    sections.push(`# 用户\n\n${agent.user.trim()}`)
  }

  // 5. MEMORY - 长期记忆 (skip default unfilled template)
  if (agent.memory.trim() && agent.memory.trim() !== DEFAULT_AGENT_TEMPLATE.MEMORY.trim()) {
    sections.push(`# 长期记忆\n\n${agent.memory.trim()}`)
  }

  // 6. 今日日记（可选）
  if (options.includeTodayLog && options.todayLog?.trim()) {
    sections.push(`# 今日日志\n\n${options.todayLog.trim()}`)
  }

  // 7. 额外系统提示（可选）
  if (options.extraSystemPrompt?.trim()) {
    sections.push(options.extraSystemPrompt.trim())
  }

  return sections.join('\n\n---\n\n')
}

/**
 * 构建简洁版提示词（仅核心部分）
 */
export function buildCompactPrompt(agent: AgentInfo): string {
  const sections: string[] = []

  // 只包含 SOUL 和 IDENTITY
  if (agent.soul.trim()) {
    sections.push(agent.soul.trim())
  }

  if (agent.identity.trim()) {
    sections.push(agent.identity.trim())
  }

  return sections.join('\n\n')
}

/**
 * 估算提示词 token 数（粗略估算）
 */
export function estimatePromptTokens(agent: AgentInfo, options: PromptOptions = {}): number {
  const prompt = buildAgentPrompt(agent, options)
  // 粗略估算：英文约 4 字符 = 1 token，中文约 2 字符 = 1 token
  // 取平均值 3 字符 = 1 token
  return Math.ceil(prompt.length / 3)
}

/**
 * 获取提示词各部分的 token 估算
 */
export function getPromptTokenBreakdown(
  agent: AgentInfo,
  options: PromptOptions = {}
): Record<string, number> {
  const breakdown: Record<string, number> = {}

  breakdown.soul = Math.ceil((agent.soul?.length || 0) / 3)
  breakdown.identity = Math.ceil((agent.identity?.length || 0) / 3)
  breakdown.agents = Math.ceil((agent.agents?.length || 0) / 3)
  breakdown.user = Math.ceil((agent.user?.length || 0) / 3)
  breakdown.memory = Math.ceil((agent.memory?.length || 0) / 3)

  if (options.includeTodayLog && options.todayLog) {
    breakdown.todayLog = Math.ceil(options.todayLog.length / 3)
  }

  if (options.extraSystemPrompt) {
    breakdown.extra = Math.ceil(options.extraSystemPrompt.length / 3)
  }

  breakdown.total = Object.values(breakdown).reduce((a, b) => a + b, 0)

  return breakdown
}
