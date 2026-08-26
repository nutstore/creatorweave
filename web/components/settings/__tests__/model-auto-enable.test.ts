import { describe, expect, it } from 'vitest'
import { getInvalidModelAutoEnableDecision } from '@/components/settings/model-auto-enable'

describe('getInvalidModelAutoEnableDecision', () => {
  it('should auto-enable custom input for an unseen invalid model', () => {
    const decision = getInvalidModelAutoEnableDecision({
      providerKey: 'openai',
      modelName: 'gpt-missing',
      availableModelIds: ['gpt-4.1', 'gpt-4o-mini'],
      handledInvalidModelKeys: new Set<string>(),
    })

    expect(decision.shouldEnable).toBe(true)
    expect(decision.key).toBe('openai:gpt-missing')
    expect(decision.normalizedModelName).toBe('gpt-missing')
  })

  it('should not auto-enable repeatedly for the same invalid model key', () => {
    const decision = getInvalidModelAutoEnableDecision({
      providerKey: 'openai',
      modelName: 'gpt-missing',
      availableModelIds: ['gpt-4.1', 'gpt-4o-mini'],
      handledInvalidModelKeys: new Set<string>(['openai:gpt-missing']),
    })

    expect(decision.shouldEnable).toBe(false)
    expect(decision.key).toBe('openai:gpt-missing')
  })

  it('should not auto-enable when model exists in dropdown options', () => {
    const decision = getInvalidModelAutoEnableDecision({
      providerKey: 'openai',
      modelName: 'gpt-4.1',
      availableModelIds: ['gpt-4.1', 'gpt-4o-mini'],
      handledInvalidModelKeys: new Set<string>(),
    })

    expect(decision.shouldEnable).toBe(false)
    expect(decision.key).toBeNull()
  })
})
