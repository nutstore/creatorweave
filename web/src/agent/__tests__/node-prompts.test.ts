import { describe, expect, it } from 'vitest'
import { buildNodeSystemPrompt } from '../workflow/node-prompts'
import type { ConditionConfig } from '../workflow/types'

describe('buildNodeSystemPrompt', () => {
  it('builds system prompt for plan node', () => {
    const prompt = buildNodeSystemPrompt('plan', 'plot_planner', undefined)
    expect(prompt).toContain('Plot Planner')
    expect(prompt).toContain('outline')
  })

  it('builds system prompt for condition node in rule mode', () => {
    const conditionConfig: ConditionConfig = {
      mode: 'rule',
      branches: [
        { label: 'pass', condition: '${review.score} >= 80' },
        { label: 'fail', condition: 'true' },
      ],
      fallbackBranch: 'fail',
    }
    const prompt = buildNodeSystemPrompt('condition', 'quality_router', undefined, conditionConfig)
    expect(prompt).toContain('quality_router')
    expect(prompt).toContain('pass')
    expect(prompt).toContain('fail')
  })

  it('builds system prompt for condition node in ai mode', () => {
    const conditionConfig: ConditionConfig = {
      mode: 'ai',
      branches: [
        { label: 'accept', description: '质量优秀' },
        { label: 'revise', description: '需要改进' },
      ],
      fallbackBranch: 'revise',
      prompt: '判断内容质量并选择路径',
    }
    const prompt = buildNodeSystemPrompt('condition', 'content_router', undefined, conditionConfig)
    expect(prompt).toContain('accept')
    expect(prompt).toContain('revise')
    expect(prompt).toContain('质量优秀')
  })

  it('uses custom task instruction when provided', () => {
    const prompt = buildNodeSystemPrompt('plan', 'planner', '创建一个关于AI的故事大纲')
    expect(prompt).toContain('创建一个关于AI的故事大纲')
    expect(prompt).not.toContain('The outline should be clear and well-structured')
  })
})
