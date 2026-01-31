/**
 * Follow-up Question Generator
 *
 * Generates follow-up question suggestions using a lightweight model.
 * Reuses the user's API key but with an internal flash model config.
 */

import { GLMProvider } from './llm/glm-provider'
import type { Message } from './message-types'
import type { LLMProviderType } from '@/agent/providers/types'

/** Flash model configs for each provider type */
const FLASH_MODEL_CONFIGS: Record<LLMProviderType, { model: string; baseURL: string }> = {
  glm: {
    model: 'glm-4-flash',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
  },
  'glm-coding': {
    model: 'glm-4-flash',
    baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4/',
  },
  kimi: {
    model: 'moonshot-v1-8k',
    baseURL: 'https://api.moonshot.cn/v1',
  },
  minimax: {
    model: 'abab6.5s-chat',
    baseURL: 'https://api.minimax.chat/v1',
  },
  qwen: {
    model: 'qwen-turbo',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
}

/**
 * Build messages for follow-up generation
 * Uses only the last turn (user message + assistant response)
 */
function buildFollowUpMessages(messages: Message[]): Array<{
  role: 'user' | 'assistant'
  content: string
}> {
  const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Find last user message
  let lastUserMessage: Message | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMessage = messages[i]
      break
    }
  }

  // Find last assistant message (after the last user message) with actual content
  let lastAssistantMessage: Message | null = null
  if (lastUserMessage) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (
        msg.role === 'assistant' &&
        msg.id > lastUserMessage.id &&
        msg.content &&
        msg.content.trim().length > 0
      ) {
        lastAssistantMessage = msg
        break
      }
    }
  }

  // Add user message
  if (lastUserMessage) {
    chatMessages.push({
      role: 'user',
      content: lastUserMessage.content || '...',
    })
  }

  // Add assistant response (only if it has content, validated above)
  if (lastAssistantMessage) {
    chatMessages.push({
      role: 'assistant',
      content: lastAssistantMessage.content!,
    })
  }

  // Add system prompt as last message
  chatMessages.push({
    role: 'user',
    content:
      '基于以上对话，生成一个简洁的追问问题（不超过15字），直接输出问题，不要任何前缀或解释。',
  })

  return chatMessages
}

/**
 * Generate follow-up suggestion
 *
 * @param messages - Conversation messages
 * @param providerType - User's selected provider type
 * @param apiKey - User's API key
 * @returns Follow-up suggestion or null if failed
 */
export async function generateFollowUp(
  messages: Message[],
  providerType: LLMProviderType,
  apiKey: string
): Promise<string | null> {
  try {
    // Skip if no messages or last message is from user
    if (messages.length === 0) return null
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role === 'user') return null

    const config = FLASH_MODEL_CONFIGS[providerType]

    // Create provider with flash model config
    const provider = new GLMProvider({
      apiKey,
      baseUrl: config.baseURL,
      model: config.model,
    })

    const chatMessages = buildFollowUpMessages(messages)

    // Call with low maxTokens for efficiency
    const response = await provider.chat({
      messages: chatMessages,
      maxTokens: 20,
    })

    const content = response.choices[0]?.message?.content
    if (!content) return null

    // Clean up response
    let cleaned = content.trim()

    // Remove common prefixes if AI added them
    const prefixes = ['追问:', '问题:', '建议:', 'Q:', 'Q。', '问：']
    for (const prefix of prefixes) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length).trim()
      }
    }

    // Remove trailing punctuation that's not part of the question
    cleaned = cleaned.replace(/[。，,；;!?！？]$/, '')

    // Validate length
    if (cleaned.length > 30) {
      cleaned = cleaned.slice(0, 30)
    }

    return cleaned || null
  } catch (error) {
    console.error('[follow-up-generator] Failed to generate follow-up:', error)
    return null
  }
}
