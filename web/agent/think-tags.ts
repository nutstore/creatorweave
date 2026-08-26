/**
 * Parse assistant text payloads that inline reasoning inside
 * <think>...</think> or <thinking>...</thinking>.
 * Some providers return these tags in normal content instead of a dedicated
 * reasoning channel.
 */

const THINK_TAG_PAIRS = [
  { open: '<think>', close: '</think>' },
  { open: '<thinking>', close: '</thinking>' },
] as const

export interface ThinkTagParseResult {
  content: string
  reasoning: string
  hasThinkTag: boolean
}

/**
 * Extract think blocks from text.
 * - Closed blocks are extracted to reasoning.
 * - Dangling open block (without close tag yet) is treated as reasoning tail.
 */
export function parseThinkTags(text: string): ThinkTagParseResult {
  if (!text) {
    return { content: '', reasoning: '', hasThinkTag: false }
  }

  const source = String(text)
  const lower = source.toLowerCase()

  const visibleParts: string[] = []
  const reasoningParts: string[] = []
  let hasThinkTag = false
  let cursor = 0

  while (cursor < source.length) {
    let foundOpenIndex = -1
    let foundCloseTag = ''
    let foundOpenTagLength = 0

    for (const pair of THINK_TAG_PAIRS) {
      const idx = lower.indexOf(pair.open, cursor)
      if (idx === -1) continue
      if (foundOpenIndex === -1 || idx < foundOpenIndex) {
        foundOpenIndex = idx
        foundCloseTag = pair.close
        foundOpenTagLength = pair.open.length
      }
    }

    if (foundOpenIndex === -1) {
      visibleParts.push(source.slice(cursor))
      break
    }

    hasThinkTag = true
    visibleParts.push(source.slice(cursor, foundOpenIndex))
    const reasoningStart = foundOpenIndex + foundOpenTagLength
    const closeIndex = lower.indexOf(foundCloseTag, reasoningStart)

    if (closeIndex === -1) {
      reasoningParts.push(source.slice(reasoningStart))
      cursor = source.length
      break
    }

    reasoningParts.push(source.slice(reasoningStart, closeIndex))
    cursor = closeIndex + foundCloseTag.length
  }

  return {
    content: visibleParts.join('').replace(/\n{3,}/g, '\n\n').trim(),
    reasoning: reasoningParts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    hasThinkTag,
  }
}
