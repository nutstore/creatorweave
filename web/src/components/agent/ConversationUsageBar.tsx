/**
 * ConversationUsageBar - sticky bar at the top of the conversation showing
 * cumulative token usage across all turns (all agent loops).
 *
 * Aggregates from EVERY assistant message in the conversation:
 *  - input  (non-cache prompt tokens)
 *  - output (completion tokens)
 *  - cache  (cached prompt tokens, discounted by most providers)
 *
 * Renders as a 3-segment stacked horizontal bar with a cost estimate
 * sourced from OpenRouter's public /api/v1/models pricing data.
 */

import { useMemo } from 'react'
import { Database, TrendingUp } from 'lucide-react'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings.store'
import { getModelPricing } from '@/agent/providers/model-store'
import {
  getOpenRouterPricing,
  type ORPricing,
} from '@/agent/providers/openrouter-pricing'
import type { Message } from '@/agent/message-types'

/** Unified pricing shape used by the cost calculator. */
interface ModelPricing {
  input: number
  output: number
  /** Cache read; undefined → cache treated as free */
  cacheRead?: number
}

// ── Aggregation ──────────────────────────────────────────────────

interface AggregatedUsage {
  input: number
  output: number
  cache: number
}

function aggregateAllMessages(messages: Message[]): AggregatedUsage {
  let input = 0
  let output = 0
  let cache = 0
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    const u = m.usage
    if (!u) continue
    input += u.promptTokens
    output += u.completionTokens
    cache += u.cacheReadTokens || 0
  }
  return { input, output, cache }
}

// ── Formatting helpers ────────────────────────────────────────────

/** Format token count: 999 → "999", 1234 → "1.2K", 1_234_567 → "1.23M" */
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 2 : 1) + 'K'
  return (n / 1_000_000).toFixed(2) + 'M'
}

/** Format cost as $0.00 / $0.0023 / $1.23 */
function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * Parse a per-token USD string from a provider's /models response
 * (e.g. OpenRouter returns "0.0000025" meaning $0.0000025/token).
 * Returns null if missing or unparseable. Negative values are rejected
 * — OpenRouter uses "-1" as a sentinel for "dynamic pricing" and we
 * must not surface it as a negative cost.
 */
function parseUsdPerToken(s: string | undefined | null): number | null {
  if (s == null) return null
  const n = parseFloat(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** Coerce ORPricing (already USD/1M) into the local ModelPricing shape. */
function fromORPricing(p: ORPricing): ModelPricing {
  return {
    input: p.input,
    output: p.output,
    ...(p.cacheRead != null ? { cacheRead: p.cacheRead } : {}),
  }
}

// ── Component ────────────────────────────────────────────────────

export interface ConversationUsageBarProps {
  messages: Message[]
}

export function ConversationUsageBar({ messages }: ConversationUsageBarProps) {
  const t = useT()
  const providerType = useSettingsStore((s) => s.providerType)
  const modelName = useSettingsStore((s) => s.modelName)

  const usage = useMemo(() => aggregateAllMessages(messages), [messages])

  const pricing = useMemo<ModelPricing | null>(() => {
    if (!modelName) return null

    // Normalize: strip a leading "<vendor>/" prefix if present
    // (e.g. "z-ai/glm-5.1" → "glm-5.1", "anthropic/claude-3-5-sonnet" → "claude-3-5-sonnet").
    const slashIdx = modelName.lastIndexOf('/')
    const bare = slashIdx >= 0 ? modelName.slice(slashIdx + 1) : modelName
    const candidates = [
      modelName,
      ...(slashIdx >= 0 && bare ? [bare] : []),
    ]

    // 1. Dynamic pricing from the user's actual provider /models endpoint
    //    (preferred when available — e.g. OpenRouter direct users).
    for (const c of candidates) {
      const dyn = getModelPricing(providerType, c)
      if (dyn) {
        const prompt = parseUsdPerToken(dyn.prompt)
        const completion = parseUsdPerToken(dyn.completion)
        const cacheRead = parseUsdPerToken(dyn.input_cache_read)
        if (prompt != null || completion != null) {
          return {
            input: (prompt ?? 0) * 1_000_000,
            output: (completion ?? 0) * 1_000_000,
            ...(cacheRead != null ? { cacheRead: cacheRead * 1_000_000 } : {}),
          }
        }
      }
    }

    // 2. OpenRouter public pricing (universal fallback — covers all
    //    providers that don't publish pricing via their own /models
    //    endpoint, e.g. Zhipu direct, Tencent Cloud, OpenAI direct).
    //    Pure static lookup from the bundled JSON snapshot.
    for (const c of candidates) {
      const or = getOpenRouterPricing(c)
      if (or) return fromORPricing(or)
    }

    // 3. No pricing found — show "—" (never fabricate a price).
    return null
  }, [modelName, providerType])

  const cost = useMemo(() => {
    if (!pricing) return null
    const input = (usage.input / 1_000_000) * pricing.input
    const output = (usage.output / 1_000_000) * pricing.output
    const cache =
      usage.cache > 0 && pricing.cacheRead != null
        ? (usage.cache / 1_000_000) * pricing.cacheRead
        : 0
    return {
      input,
      output,
      cache,
      total: input + output + cache,
    }
  }, [pricing, usage])

  const total = usage.input + usage.output + usage.cache
  // Avoid /0 — if no usage at all, render nothing (the bar would be 0% width).
  if (total === 0) return null

  const inputPct = (usage.input / total) * 100
  const outputPct = (usage.output / total) * 100
  const cachePct = (usage.cache / total) * 100

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-neutral-200/70 bg-neutral-50/80 px-4 py-2 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-900/70">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        {/* Left: label + breakdown */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 font-medium text-neutral-600 dark:text-neutral-300">
            <TrendingUp className="h-3 w-3" />
            {t('conversation.usageBar.title')}
          </span>
          <span
            className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400"
            title={t('conversation.usage.input')}
          >
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            ↑{formatTokens(usage.input)}
          </span>
          <span
            className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400"
            title={t('conversation.usage.output')}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            ↓{formatTokens(usage.output)}
          </span>
          {usage.cache > 0 && (
            <span
              className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400"
              title={t('conversation.usage.cache')}
            >
              <Database className="h-3 w-3 text-violet-500" />
              {formatTokens(usage.cache)}
            </span>
          )}
        </div>

        {/* Right: cost */}
        <div className="flex items-center gap-1 text-neutral-500 tabular-nums dark:text-neutral-400">
          {cost ? (
            <span title={t('conversation.usageBar.costBreakdown', {
              input: formatCost(cost.input),
              output: formatCost(cost.output),
              cache: formatCost(cost.cache),
              model: modelName || providerType || 'unknown',
            })}>
              {t('conversation.usageBar.cost', { amount: formatCost(cost.total) })}
            </span>
          ) : (
            // Unknown pricing — show em-dash so we don't claim "free"
            // for models that are actually paid (e.g. GLM, MiniMax).
            <span title={t('conversation.usageBar.unknownPricing', { model: modelName || providerType || 'unknown' })}>—</span>
          )}
        </div>
      </div>

      {/* 3-segment stacked horizontal bar */}
      <div
        className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/60 dark:bg-neutral-800/60"
        title={t('conversation.usageBar.barTooltip', {
          input: formatTokens(usage.input),
          output: formatTokens(usage.output),
          cache: formatTokens(usage.cache),
        })}
      >
        {inputPct > 0 && (
          <div
            className="h-full bg-blue-500 dark:bg-blue-400"
            style={{ width: `${inputPct}%` }}
          />
        )}
        {outputPct > 0 && (
          <div
            className="h-full bg-emerald-500 dark:bg-emerald-400"
            style={{ width: `${outputPct}%` }}
          />
        )}
        {cachePct > 0 && (
          <div
            className="h-full bg-violet-500 dark:bg-violet-400"
            style={{ width: `${cachePct}%` }}
          />
        )}
      </div>
    </div>
  )
}
