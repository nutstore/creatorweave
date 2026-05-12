import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
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
  }, [getAvailableProviders, open, providerRefreshVersion])

  // Filter out providers with no models available
  const visibleProviders = useMemo(() =>
    providers.filter((p) => p.models.length > 0),
    [providers]
  )

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
        {loading ? (
          <div className="px-2 py-4 text-center text-xs text-tertiary">
            ...
          </div>
        ) : visibleProviders.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-tertiary">
            {t('topbar.modelSwitcher.noPinnedModels')}
          </div>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-auto">
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
