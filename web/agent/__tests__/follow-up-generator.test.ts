import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createUserMessage, createAssistantMessage } from '@/agent/message-types'

const createLLMProviderMock = vi.hoisted(() => vi.fn())
const chatMock = vi.hoisted(() => vi.fn())

vi.mock('../llm/provider-factory', () => ({
  createLLMProvider: createLLMProviderMock,
}))

import { generateFollowUp } from '../follow-up-generator'

describe('follow-up-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatMock.mockResolvedValue({
      choices: [{ message: { content: '继续' } }],
    })
    createLLMProviderMock.mockReturnValue({
      chat: chatMock,
    })
  })

  it('uses glm-4.7-flash for glm provider', async () => {
    const messages = [createUserMessage('你好'), createAssistantMessage('你好，有什么可以帮你？')]

    await generateFollowUp(messages, 'glm', 'test-key')

    expect(createLLMProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: 'glm',
        model: 'glm-4.7-flash',
      })
    )
  })

  it('uses glm-4.7-flash for glm-coding provider', async () => {
    const messages = [createUserMessage('帮我写代码'), createAssistantMessage('好的，我来帮你。')]

    await generateFollowUp(messages, 'glm-coding', 'test-key')

    expect(createLLMProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: 'glm-coding',
        model: 'glm-4.7-flash',
      })
    )
  })
})

