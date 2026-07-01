/**
 * OpenRouter Pricing & Context-Window Reference (static snapshot)
 *
 * Single source of truth for per-token USD pricing and context-window
 * lengths, sourced from OpenRouter's public /api/v1/models endpoint.
 *
 * The snapshot is bundled at build time (src/data/openrouter-models.json)
 * and imported directly — no runtime fetch, no localStorage, no async.
 * This avoids the GLM-5.2 prefix-match bug (missing from a hand-maintained
 * table → fell back to glm-5's wrong price) by covering 338 models from
 * all major providers automatically.
 *
 * To refresh the snapshot:
 *   curl https://openrouter.ai/api/v1/models > src/data/openrouter-models.json
 */

// Static JSON import (resolveJsonModule: true in base tsconfig).
// `as unknown as` is required — TypeScript infers each entry as a precise
// literal with per-object optional fields (e.g. web_search?: undefined),
// which doesn't directly satisfy the relaxed `Record<string, string>`
// pricing shape we read.
import orSnapshotRaw from '@/data/openrouter-models.json'

interface ORSnapshotShape {
  data?: Array<{
    id: string
    pricing?: Record<string, string>
    context_length?: number
  }>
}
const orSnapshot = orSnapshotRaw as unknown as ORSnapshotShape

// ─── Types ───────────────────────────────────────────────────────────────────

/** Pricing in USD per 1M tokens (already converted from per-token). */
export interface ORPricing {
  input: number
  output: number
  cacheRead?: number
}

interface ORModelEntry {
  id: string // full OpenRouter id, e.g. "z-ai/glm-5.2"
  input: number | null
  output: number | null
  cacheRead: number | null
  contextLength: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip a leading "vendor/" prefix, e.g. "z-ai/glm-5.2" → "glm-5.2". */
function stripVendorPrefix(id: string): string {
  const idx = id.lastIndexOf('/')
  return idx >= 0 ? id.slice(idx + 1) : id
}

/** Parse a per-token USD string → USD/1M, or null if absent/invalid. */
function perTokenToPerMillion(s: string | undefined | null): number | null {
  if (s == null) return null
  const n = parseFloat(s)
  // Reject sentinel values like "-1" (OpenRouter uses this for "dynamic")
  if (!Number.isFinite(n) || n < 0) return null
  return n * 1_000_000
}

// ─── Index (built once at module load) ───────────────────────────────────────

function buildIndex(
  data: {
    data?: Array<{
      id: string
      pricing?: Record<string, string>
      context_length?: number
    }>
  }
): {
  byBare: Record<string, ORModelEntry>
  byFull: Record<string, ORModelEntry>
} {
  const models = data.data ?? []
  const byBare: Record<string, ORModelEntry> = {}
  const byFull: Record<string, ORModelEntry> = {}

  for (const m of models) {
    const p = m.pricing ?? {}
    const entry: ORModelEntry = {
      id: m.id,
      input: perTokenToPerMillion(p.prompt),
      output: perTokenToPerMillion(p.completion),
      cacheRead: perTokenToPerMillion(p.input_cache_read),
      contextLength:
        typeof m.context_length === 'number' && m.context_length > 0
          ? m.context_length
          : null,
    }
    // Skip entries with no usable pricing AND no context length
    if (
      entry.input == null &&
      entry.output == null &&
      entry.contextLength == null
    )
      continue

    byFull[m.id] = entry
    const bare = stripVendorPrefix(m.id)
    if (bare) byBare[bare] = entry
  }

  return { byBare, byFull }
}

const { byBare, byFull } = buildIndex(orSnapshot)

/** Look up a raw ORModelEntry by model id (sync). Returns null if unknown.
 *  Case-insensitive — OpenRouter ids are always lowercase, but callers may
 *  pass mixed-case (e.g. "Minimax/MiniMax-m3" from a passthrough provider). */
function findEntry(modelId: string): ORModelEntry | null {
  if (!modelId) return null
  // Lowercase the input so OpenRouter's lowercase ids match regardless of
  // how the caller capitalised the model name.
  const lower = modelId.toLowerCase()
  const candidates = [lower, stripVendorPrefix(lower)].filter(Boolean)
  for (const c of candidates) {
    const e = byFull[c] ?? byBare[c]
    if (e) return e
  }
  return null
}

// ─── Public API (all synchronous) ────────────────────────────────────────────

/**
 * Look up pricing for a model by its name or OpenRouter id.
 *
 * Tries (in order):
 *   1. Exact full-id match (e.g. "z-ai/glm-5.2")
 *   2. Bare-name match after stripping vendor prefix (e.g. "glm-5.2")
 *
 * Returns null if the model is unknown or has no pricing.
 */
export function getOpenRouterPricing(modelId: string): ORPricing | null {
  const entry = findEntry(modelId)
  if (!entry) return null
  if (entry.input == null && entry.output == null) return null

  return {
    input: entry.input ?? 0,
    output: entry.output ?? 0,
    ...(entry.cacheRead != null ? { cacheRead: entry.cacheRead } : {}),
  }
}

/**
 * Look up a model's max context length (in tokens).
 * Returns null if the model is unknown; the caller should fall back
 * to its own default (e.g. 128000) when null.
 */
export function getOpenRouterContextWindow(modelId: string): number | null {
  const entry = findEntry(modelId)
  if (!entry || entry.contextLength == null) return null
  return entry.contextLength
}
