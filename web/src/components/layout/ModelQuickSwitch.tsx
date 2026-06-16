import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, Sparkles } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import type { LLMProviderType } from '@/agent/providers/types'
import { Popover, PopoverContent, PopoverTrigger, BrandButton } from '@creatorweave/ui'
import { useT } from '@/i18n'

interface AvailableProvider {
  providerType: LLMProviderType
  displayName: string
  models: Array<{ id: string; name: string }>
  providerKey: string
}

/** Flattened model entry used when searching across providers. */
interface FlatModel {
  provider: AvailableProvider
  model: { id: string; name: string }
}

export function ModelQuickSwitch() {
  const t = useT()
  const providerType = useSettingsStore((s) => s.providerType)
  const modelName = useSettingsStore((s) => s.modelName)
  const hasApiKey = useSettingsStore((s) => s.hasApiKey)
  const getAvailableProviders = useSettingsStore((s) => s.getAvailableProviders)
  const switchProviderAndModel = useSettingsStore((s) => s.switchProviderAndModel)
  const providerRefreshVersion = useSettingsStore((s) => s._providerRefreshVersion)

  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<AvailableProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const result = await getAvailableProviders()
        if (!cancelled) {
          setProviders(result)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // NOTE: `open` is intentionally excluded — providers are cached after first load
    // and refreshed only when _providerRefreshVersion changes (pin/unpin/custom provider edits).
    // Including `open` here caused a full reload every time the popover opens.
  }, [getAvailableProviders, providerRefreshVersion])

  // Auto-focus the search input when popover opens
  useEffect(() => {
    if (open) {
      // Defer focus until content is painted
      const id = requestAnimationFrame(() => {
        searchInputRef.current?.focus()
      })
      return () => cancelAnimationFrame(id)
    }
    // Reset query when popover closes
    setQuery('')
  }, [open])

  // Filter out providers with no models available
  const visibleProviders = useMemo(() =>
    providers.filter((p) => p.models.length > 0),
    [providers]
  )

  // Build a flat list of all models for cross-provider search
  const flatModels = useMemo<FlatModel[]>(() => {
    const list: FlatModel[] = []
    for (const provider of visibleProviders) {
      for (const model of provider.models) {
        list.push({ provider, model })
      }
    }
    return list
  }, [visibleProviders])

  const trimmedQuery = query.trim().toLowerCase()
  const isSearching = trimmedQuery.length > 0

  // Token-AND matching: every space-separated token must hit name or id
  const filteredFlatModels = useMemo<FlatModel[]>(() => {
    if (!isSearching) return []
    const tokens = trimmedQuery.split(/\s+/).filter(Boolean)
    return flatModels.filter(({ model }) => {
      const hay = `${model.name} ${model.id}`.toLowerCase()
      return tokens.every((tk) => hay.includes(tk))
    })
  }, [flatModels, trimmedQuery])

  const currentLabel = useMemo(() => {
    // No API key configured → always show "unavailable" regardless of persisted values
    if (!hasApiKey) {
      return t('topbar.modelSwitcher.unavailable')
    }
    // No model selected yet
    if (!providerType || !modelName) {
      return t('topbar.modelSwitcher.unavailable')
    }
    // Always show current provider/model, even if not in pinned list
    const currentProvider = providers.find(
      (p) => p.providerType === providerType
    )
    if (currentProvider) {
      const model = currentProvider.models.find((m) => m.id === modelName)
      return `${currentProvider.displayName} / ${model?.name || modelName}`
    }
    return modelName || t('topbar.modelSwitcher.unavailable')
  }, [hasApiKey, providerType, providers, modelName, t])

  const handleSelect = (provider: AvailableProvider, nextModelName: string) => {
    switchProviderAndModel(provider.providerType, nextModelName)
    setOpen(false)
  }

  // Keyboard: Enter selects the first matched model, Esc clears or closes
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isSearching && filteredFlatModels.length > 0) {
      e.preventDefault()
      const { provider, model } = filteredFlatModels[0]
      handleSelect(provider, model.id)
    } else if (e.key === 'Escape') {
      if (isSearching) {
        e.preventDefault()
        setQuery('')
      }
      // If not searching, let the popover handle Esc (closes naturally)
    }
  }

  // Always show the button so users can see it even when nothing is configured
  // (previously it was hidden when no providers existed)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BrandButton variant="outline" className="h-8 max-w-[280px] justify-between gap-2 px-2.5 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{currentLabel}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </BrandButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-2">
        <div className="mb-2 px-2 py-1 text-xs font-medium text-tertiary">
          {t('topbar.modelSwitcher.title')}
        </div>

        {/* Search input — always visible when providers exist */}
        {!loading && visibleProviders.length > 0 && (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('topbar.modelSwitcher.searchPlaceholder')}
              className="w-full rounded-md border border-border/60 bg-transparent py-1.5 pl-8 pr-2 text-sm outline-none placeholder:text-tertiary focus:border-primary/40"
            />
          </div>
        )}

        {loading ? (
          <div className="px-2 py-4 text-center text-xs text-tertiary">
            ...
          </div>
        ) : visibleProviders.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-tertiary">
            {t('topbar.modelSwitcher.noPinnedModels')}
          </div>
        ) : isSearching ? (
          /* Search mode: flat list, each item tagged with provider name */
          filteredFlatModels.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-tertiary">
              {t('topbar.modelSwitcher.noResults')}
            </div>
          ) : (
            <div className="max-h-[320px] space-y-0.5 overflow-auto">
              {filteredFlatModels.map(({ provider, model }) => {
                const selected =
                  provider.providerType === providerType && model.id === modelName
                return (
                  <button
                    key={`${provider.providerKey}:${model.id}`}
                    type="button"
                    onClick={() => handleSelect(provider, model.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate">{model.name}</span>
                      <span className="shrink-0 text-xs text-tertiary">
                        {provider.displayName}
                      </span>
                    </span>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                )
              })}
            </div>
          )
        ) : (
          /* Default mode: grouped by provider (original layout) */
          <div className="max-h-[320px] space-y-2 overflow-auto">
            {visibleProviders.map((provider) => {
              const isCurrentProvider = provider.providerType === providerType

              return (
                <div key={provider.providerKey} className="rounded-lg border border-border/60 p-2">
                  <div className="mb-1 px-1 text-xs font-semibold text-secondary">
                    {provider.displayName}
                  </div>
                  <div className="space-y-1">
                    {provider.models.map((model) => {
                      const selected = isCurrentProvider && model.id === modelName
                      return (
                        <button
                          key={`${provider.providerKey}:${model.id}`}
                          type="button"
                          onClick={() => handleSelect(provider, model.id)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          <span className="truncate">{model.name}</span>
                          {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default ModelQuickSwitch
