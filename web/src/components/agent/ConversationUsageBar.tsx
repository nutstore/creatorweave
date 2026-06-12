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
 * derived from a small hardcoded pricing table.
 */

import { useMemo } from 'react'
import { Database, TrendingUp } from 'lucide-react'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings.store'
import { getModelPricing } from '@/agent/providers/model-store'
import type { Message } from '@/agent/message-types'

// ── Pricing table (USD per 1M tokens) ─────────────────────────────
// Sources: provider pricing pages (Anthropic, OpenAI, Google, Zhipu,
// MiniMax, Moonshot, DashScope, DeepSeek) at the project's reference
// date. Rates are approximate — verify against the provider's pricing
// page for billing. Add new entries as new models are adopted.
// Models not listed → cost shows "—" (we don't assume "free").
interface ModelPricing {
  input: number
  output: number
  /** Cache read; undefined → cache treated as free (or same as input) */
  cacheRead?: number
}

// All prices are USD per 1M tokens. Sourced from OpenRouter
// /api/v1/models snapshot (2026-06-13). Cache read is a separate rate —
// billed as `cache_read` per-token, not as a discount on input.
const PRICING: Record<string, ModelPricing> = {
  // ── Anthropic ──
  'claude-sonnet-latest': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-opus-latest': { input: 15, output: 75, cacheRead: 1.5 },
  'claude-haiku-latest': { input: 0.8, output: 4, cacheRead: 0.08 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheRead: 0.08 },
  'claude-3-opus-20240229': { input: 15, output: 75, cacheRead: 1.5 },
  // ── OpenAI ──
  'gpt-5.5': { input: 5, output: 30, cacheRead: 0.5 },
  'gpt-5.5-pro': { input: 30, output: 180 },
  'gpt-5.4-image-2': { input: 8, output: 15, cacheRead: 2 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  o1: { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  // ── Google Gemini ──
  'gemini-3.5-flash': { input: 1.5, output: 9, cacheRead: 0.15 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5, cacheRead: 0.025 },
  'gemini-pro-latest': { input: 2, output: 12, cacheRead: 0.2 },
  'gemini-flash-latest': { input: 0.3, output: 2.5, cacheRead: 0.03 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  // ── xAI Grok ──
  'grok-4.3': { input: 1.25, output: 2.5, cacheRead: 0.2 },
  'grok-3': { input: 3, output: 15 },
  'grok-3-mini': { input: 0.3, output: 0.5 },
  // ── Zhipu GLM ──
  'glm-5.1': { input: 0.98, output: 3.08, cacheRead: 0.182 },
  'glm-5.1-20260406': { input: 0.98, output: 3.08, cacheRead: 0.182 },
  'glm-4-flash': { input: 0, output: 0, cacheRead: 0 },
  'glm-4.7-flash': { input: 0, output: 0, cacheRead: 0 },
  'glm-4-air': { input: 0.14, output: 0.14, cacheRead: 0.014 },
  'glm-4-airx': { input: 0.14, output: 0.14, cacheRead: 0.014 },
  'glm-4.7': { input: 7, output: 7, cacheRead: 0.7 },
  'glm-5': { input: 7, output: 7, cacheRead: 0.7 },
  // ── MiniMax (MiniMax) ──
  'MiniMax-M2.7': { input: 0.30, output: 0.30, cacheRead: 0.03 },
  'MiniMax-M2.7-highspeed': { input: 0.30, output: 0.30, cacheRead: 0.03 },
  'MiniMax-Text-01': { input: 0.14, output: 0.14, cacheRead: 0.014 },
  'MiniMax-abab-6.5s': { input: 0.014, output: 0.014, cacheRead: 0.0014 },
  'MiniMax-abab-6.5': { input: 2, output: 2, cacheRead: 0.2 },
  // ── Moonshot Kimi ──
  'kimi-k2.6': { input: 0.68, output: 3.41, cacheRead: 0.34 },
  'kimi-k2.7-code': { input: 0.95, output: 4, cacheRead: 0.19 },
  'kimi-latest': { input: 0.68, output: 3.41, cacheRead: 0.34 },
  'kimi-k2': { input: 0.68, output: 3.41, cacheRead: 0.34 },
  'moonshot-v1-8k': { input: 1.67, output: 1.67, cacheRead: 0.17 },
  'moonshot-v1-32k': { input: 3.33, output: 3.33, cacheRead: 0.33 },
  'moonshot-v1-128k': { input: 8.33, output: 8.33, cacheRead: 0.83 },
  // ── Qwen (通义千问) ──
  'qwen3.7-max': { input: 1.25, output: 3.75, cacheRead: 0.25 },
  'qwen3.6-max': { input: 1.04, output: 6.24 },
  'qwen3.7-plus': { input: 0.32, output: 1.28, cacheRead: 0.064 },
  'qwen3-max': { input: 1.25, output: 3.75, cacheRead: 0.25 },
  'qwen3-235b-a22b': { input: 0.32, output: 1.28, cacheRead: 0.064 },
  'qwen3-32b': { input: 0.32, output: 1.28, cacheRead: 0.064 },
  'qwen-turbo': { input: 0.40, output: 0.80 },
  'qwen-plus': { input: 0.55, output: 1.67 },
  'qwen-max': { input: 2.78, output: 8.33 },
  'qwen-long': { input: 0.07, output: 0.28 },
  'qwen-2.5-72b-instruct': { input: 0.40, output: 0.80 },
  'qwen-2.5-max': { input: 2.78, output: 8.33 },
  // ── DeepSeek ──
  'deepseek-v4-pro': { input: 0.435, output: 0.87, cacheRead: 0.0036 },
  'deepseek-v4-flash': { input: 0.098, output: 0.196, cacheRead: 0.02 },
  'deepseek-v3': { input: 0.14, output: 0.28, cacheRead: 0.014 },
  'deepseek-v3.1': { input: 0.14, output: 0.28, cacheRead: 0.014 },
  'deepseek-r1': { input: 0.55, output: 2.19, cacheRead: 0.14 },
  'deepseek-chat': { input: 0.435, output: 0.87, cacheRead: 0.0036 },
  'deepseek-reasoner': { input: 0.55, output: 2.19, cacheRead: 0.14 },
  'deepseek-coder': { input: 0.14, output: 0.28, cacheRead: 0.014 },
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
 * Returns null if missing or unparseable — caller decides whether to
 * fall back to hardcoded pricing or treat the field as absent.
 */
function parseUsdPerToken(s: string | undefined | null): number | null {
  if (s == null) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
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

  const pricing = useMemo(() => {
    if (!modelName) return null

    // Normalize: strip a leading "<vendor>/" prefix if present
    // (e.g. "z-ai/glm-5.1" → "glm-5.1", "anthropic/claude-3-5-sonnet" → "claude-3-5-sonnet").
    // Common in OpenRouter / HuggingFace / LiteLLM routing.
    const slashIdx = modelName.lastIndexOf('/')
    const bare = slashIdx >= 0 ? modelName.slice(slashIdx + 1) : modelName
    const candidates = [
      modelName,
      ...(slashIdx >= 0 && bare ? [bare] : []), // skip empty bare (e.g. "z-ai/")
    ]

    // 1. Dynamic pricing from the provider's /models endpoint (preferred).
    //    OpenRouter publishes per-token USD strings (e.g. "0.0000025");
    //    convert to USD/1M. Used by openai-compat providers that pass through
    //    OpenRouter-style pricing (OpenRouter itself, and any provider we
    //    route through it).
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

    // 2. Hardcoded fallback (for providers that don't publish pricing:
    //    OpenAI direct, Anthropic direct, Google direct APIs, etc.)
    for (const c of candidates) {
      if (PRICING[c]) return PRICING[c]
    }
    // 3. Prefix match on hardcoded
    for (const c of candidates) {
      const m = Object.keys(PRICING).find(
        (k) => c.startsWith(k) || k.startsWith(c),
      )
      if (m) return PRICING[m]
    }
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
