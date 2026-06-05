/**
 * ImageModelDropdown — compact popover for selecting image generation model.
 *
 * Shows the current model's short name as a small button.
 * Click to open a searchable popover with all available models,
 * grouped by provider.
 *
 * Models are sourced from pi-ai's image model registry but **filtered** against
 * the provider's actual cached model list (from /models API). This ensures we
 * never show models that don't exist on the user's provider (e.g. seedream-4.5
 * on OpenRouter if it's not actually available there).
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ImageIcon, Search, ChevronDown } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { getImageModels } from '@earendil-works/pi-ai'
import { getCachedModels, onModelsUpdated } from '@/agent/providers/model-store'
import type { LLMProviderType } from '@/agent/providers/types'
import { Popover, PopoverContent, PopoverTrigger, BrandButton } from '@creatorweave/ui'
import { useT } from '@/i18n'

/** Shorten model display name for the button */
function shortName(modelId: string): string {
  // "google/gemini-2.5-flash-image" → "Gemini 2.5 Flash"
  // "openai/gpt-5-image" → "GPT-5 Image"
  const slashIdx = modelId.indexOf('/')
  const raw = slashIdx >= 0 ? modelId.slice(slashIdx + 1) : modelId
  // Capitalize first letter of each segment
  return raw
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
    .replace(/Image$/i, '')
    .trim() || raw
}

interface ModelEntry {
  id: string
  name: string
  provider: string
}

/**
 * Filter image models from pi-ai registry against the provider's actual cached models.
 * Returns the filtered list and a version counter that bumps when cache updates.
 */
function useFilteredImageModels() {
  const providerType = useSettingsStore((s) => s.providerType) as LLMProviderType
  const [cacheVersion, setCacheVersion] = useState(0)

  useEffect(() => {
    return onModelsUpdated(() => setCacheVersion((v) => v + 1))
  }, [])

  return useMemo(() => {
    const registryModels = getImageModels('openrouter' as any)
    const cached =
      getCachedModels(providerType, providerType) ||
      getCachedModels(providerType)

    const cachedIds = new Set<string>()
    if (cached) {
      for (const m of cached) {
        cachedIds.add(m.id)
      }
    }

    return registryModels
      .filter((m) => {
        // No cache yet → show all (better than empty)
        if (!cached || cachedIds.size === 0) return true
        if (cachedIds.has(m.id)) return true
        const slashIdx = m.id.indexOf('/')
        const shortId = slashIdx >= 0 ? m.id.slice(slashIdx + 1) : m.id
        if (cachedIds.has(shortId)) return true
        for (const cid of cachedIds) {
          if (cid.includes(shortId) || shortId.includes(cid)) return true
        }
        return false
      })
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.id.includes('/') ? m.id.split('/')[0]! : 'other',
      })) as ModelEntry[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerType, cacheVersion])
}

/** Whether the current provider has any image generation models available. */
export function useHasImageModels(): boolean {
  return useFilteredImageModels().length > 0
}

export function ImageModelDropdown() {
  const imageGenModel = useSettingsStore((s) => s.imageGenModel)
  const setImageGenModel = useSettingsStore((s) => s.setImageGenModel)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const t = useT()

  const allModels = useFilteredImageModels()

  // Group by provider
  const grouped = useMemo(() => {
    const groups = new Map<string, ModelEntry[]>()
    for (const m of allModels) {
      const label = m.provider.charAt(0).toUpperCase() + m.provider.slice(1).replace(/-/g, ' ')
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(m)
    }
    return groups
  }, [allModels])

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return grouped
    const q = search.toLowerCase()
    const result = new Map<string, ModelEntry[]>()
    for (const [provider, models] of grouped) {
      const matched = models.filter(
        (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      )
      if (matched.length > 0) result.set(provider, matched)
    }
    return result
  }, [grouped, search])

  const currentShortName = useMemo(() => shortName(imageGenModel), [imageGenModel])

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  const handleSelect = useCallback(
    (id: string) => {
      setImageGenModel(id)
      setOpen(false)
      setSearch('')
    },
    [setImageGenModel],
  )

  // No image models available for this provider → hide
  // IMPORTANT: must be after all hooks (Rules of Hooks)
  if (allModels.length === 0) return null

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
      <PopoverTrigger asChild>
        <BrandButton variant="outline" className="h-8 max-w-[200px] justify-between gap-1.5 px-2.5 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{currentShortName}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </BrandButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {/* Search */}
        <div className="border-b border-border/60 p-2">
          <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('settings.imageGen.searchModel') || 'Search models...'}
              className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Model list */}
        <div className="max-h-64 overflow-y-auto p-1.5">
          {Array.from(filtered.entries()).map(([provider, models]) => (
            <div key={provider}>
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-tertiary">
                {provider}
              </div>
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m.id)}
                  className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                    imageGenModel === m.id
                      ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-secondary hover:bg-muted'
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
          ))}
          {filtered.size === 0 && (
            <div className="px-2 py-3 text-center text-xs text-tertiary">
              {t('settings.imageGen.noModelFound') || 'No matching models found'}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
