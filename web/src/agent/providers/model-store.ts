/**
 * Dynamic Model Store
 *
 * Caches dynamically fetched model lists with persistence.
 * - Memory cache (Map) for fast access during a session
 * - localStorage for cross-session persistence (no expiry — always usable)
 * - Cache is only invalidated when API key changes
 *
 * Strategy: stale-while-revalidate
 *   Always show cached data immediately, silently refresh in background.
 */

import type { LLMProviderType, ModelInfo } from './types'
import type { FetchModelsResult } from './model-fetcher'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CachedModels {
  models: ModelInfo[]
  source: 'dynamic' | 'static'
  fetchedAt: number
  error?: string
}

// ─── Config ──────────────────────────────────────────────────────────────────

/** localStorage key prefix */
const STORAGE_PREFIX = 'cw-models:'

// ─── Cache storage ───────────────────────────────────────────────────────────

const memoryCache = new Map<string, CachedModels>()

function getCacheKey(
  providerType: LLMProviderType,
  providerKey?: string
): string {
  return providerKey ? `${providerType}:${providerKey}` : providerType
}

function getStorageKey(cacheKey: string): string {
  return `${STORAGE_PREFIX}${cacheKey}`
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function readFromDisk(cacheKey: string): CachedModels | null {
  try {
    const raw = localStorage.getItem(getStorageKey(cacheKey))
    if (!raw) return null
    return JSON.parse(raw) as CachedModels
  } catch {
    return null
  }
}

function writeToDisk(cacheKey: string, data: CachedModels): void {
  try {
    localStorage.setItem(getStorageKey(cacheKey), JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — silently degrade to memory-only
  }
}

function removeFromDisk(cacheKey: string): void {
  try {
    localStorage.removeItem(getStorageKey(cacheKey))
  } catch {
    // ignore
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get cached models for a provider.
 * Checks memory first, then localStorage. Never expires by time.
 */
export function getCachedModels(
  providerType: LLMProviderType,
  providerKey?: string
): ModelInfo[] | null {
  const key = getCacheKey(providerType, providerKey)

  // 1. Memory (fast)
  const mem = memoryCache.get(key)
  if (mem) return mem.models

  // 2. localStorage (persistent)
  const disk = readFromDisk(key)
  if (disk) {
    // Promote to memory
    memoryCache.set(key, disk)
    return disk.models
  }

  return null
}

/**
 * Get full cached result including metadata (source, fetchedAt, error).
 */
export function getCachedModelsResult(
  providerType: LLMProviderType,
  providerKey?: string
): CachedModels | null {
  const key = getCacheKey(providerType, providerKey)

  const mem = memoryCache.get(key)
  if (mem) return mem

  const disk = readFromDisk(key)
  if (disk) {
    memoryCache.set(key, disk)
    return disk
  }

  return null
}

/**
 * Store fetched models in both memory and localStorage.
 * Only persists dynamic (API-fetched) results.
 */
export function setCachedModels(
  providerType: LLMProviderType,
  result: FetchModelsResult,
  providerKey?: string
): void {
  if (result.source !== 'dynamic') return

  const key = getCacheKey(providerType, providerKey)
  const entry: CachedModels = {
    models: result.models,
    source: result.source,
    fetchedAt: result.fetchedAt,
    error: result.error,
  }

  memoryCache.set(key, entry)
  writeToDisk(key, entry)
}
