/**
 * Skill-searcher subagent — same architecture as tool-searcher.
 *
 * NOT a real AgentLoop. It's a single LLM call with forced tool choice.
 * The LLM result is read from response.choices[0].message.tool_calls.
 *
 * Two entry points:
 *   - runSkillSearcher: full semantic search over ALL skills (Path C)
 *   - runSkillReranker: re-rank BM25-retrieved candidates (Path B)
 */

import type { PiAIProvider } from '../../llm/pi-ai-provider'
import { buildSkillSearcherSystemPrompt, buildSkillRerankPrompt } from './prompt'
import {
  submitSkillSearchResultsDefinition,
  submitSkillRerankedResultsDefinition,
} from './tools'
import type {
  SkillSearcherInput,
  SkillSearcherResult,
  SkillSearcherResultItem,
  SkillRerankerInput,
  SkillRerankerResult,
  SkillRerankCandidate,
} from './types'

/**
 * Full semantic skill search — one LLM call over all skill descriptions.
 * Used when BM25 recall is poor or query contains CJK.
 */
export async function runSkillSearcher(
  input: SkillSearcherInput,
  deps: { provider: PiAIProvider; signal?: AbortSignal },
): Promise<SkillSearcherResult | null> {
  const { query, allSkillDescriptionsText } = input
  const { provider, signal } = deps

  const systemPrompt = buildSkillSearcherSystemPrompt(allSkillDescriptionsText)

  try {
    const response = await provider.chat(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        tools: [submitSkillSearchResultsDefinition],
        toolChoice: {
          type: 'function',
          function: { name: 'submit_skill_search_results' },
        },
        disableThinking: true,
        temperature: 0,
        maxTokens: 2000,
      },
      signal,
    )

    const choice = response.choices[0]
    const toolCall = choice?.message?.tool_calls?.find(
      (tc) => tc.function.name === 'submit_skill_search_results',
    )
    if (!toolCall) return null

    let parsed: { skills?: SkillSearcherResultItem[] }
    try {
      parsed = JSON.parse(toolCall.function.arguments)
    } catch {
      return null
    }

    const skills = Array.isArray(parsed?.skills) ? parsed.skills : []
    const validSkills = skills.filter(
      (s): s is SkillSearcherResultItem =>
        typeof s?.skill_name === 'string' &&
        s.skill_name.length > 0 &&
        typeof s?.relevance_reason === 'string',
    )
    return { skills: validSkills }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null
    console.error('[skill-searcher] single-call failed:', err)
    return null
  }
}

/**
 * Re-rank BM25-retrieved skill candidates — cheaper than full semantic.
 * Used when BM25 has good recall but ordering may need correction.
 */
export async function runSkillReranker(
  input: SkillRerankerInput,
  deps: { provider: PiAIProvider; signal?: AbortSignal },
): Promise<SkillRerankerResult | null> {
  const { intent, candidates, topK = 5 } = input
  const { provider, signal } = deps

  const candidatesText = candidates
    .map(
      (c: SkillRerankCandidate, i: number) =>
        `${i + 1}. ${c.name}\n` +
        `   Category: ${c.category}\n` +
        `   Description: ${c.description || '(no description)'}`,
    )
    .join('\n\n')

  const systemPrompt = buildSkillRerankPrompt(intent, candidatesText)

  try {
    const response = await provider.chat(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: intent },
        ],
        tools: [submitSkillRerankedResultsDefinition],
        toolChoice: {
          type: 'function',
          function: { name: 'submit_skill_reranked_results' },
        },
        disableThinking: true,
        temperature: 0,
        maxTokens: 1500,
      },
      signal,
    )

    const choice = response.choices[0]
    const toolCall = choice?.message?.tool_calls?.find(
      (tc) => tc.function.name === 'submit_skill_reranked_results',
    )
    if (!toolCall) return null

    let parsed: { skills?: SkillSearcherResultItem[] }
    try {
      parsed = JSON.parse(toolCall.function.arguments)
    } catch {
      return null
    }

    const skills = Array.isArray(parsed?.skills) ? parsed.skills : []
    const validSkills = skills
      .filter(
        (s): s is SkillSearcherResultItem =>
          typeof s?.skill_name === 'string' &&
          s.skill_name.length > 0 &&
          typeof s?.relevance_reason === 'string',
      )
      .slice(0, Math.min(topK, 5))
    return { skills: validSkills }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return null
    console.error('[skill-reranker] single-call failed:', err)
    return null
  }
}
