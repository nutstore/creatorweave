import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { LLMProviderType } from '@/agent/providers/types'
import { Popover, PopoverContent, PopoverTrigger, BrandButton } from '@creatorweave/ui'
import { useT } from '@/i18n'

interface AvailableProvider {
  providerType: LLMProviderType
  displayName: string
  models: Array<{ id: string; name: string }>
  providerKey: string
}

function getCustomProviderIdFromKey(providerKey: string): string | undefined {
  if (!providerKey.startsWith('custom:')) return undefined
  return providerKey.slice('custom:'.length)
}

export function ModelQuickSwitch() {
  const t = useT()
  const providerType = useSettingsStore((s) => s.providerType)
  const modelName = useSettingsStore((s) => s.modelName)
  const activeCustomProviderId = useSettingsStore((s) => s.activeCustomProviderId)
  const getAvailableProviders = useSettingsStore((s) => s.getAvailableProviders)
  const switchProviderAndModel = useSettingsStore((s) => s.switchProviderAndModel)

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
  }, [getAvailableProviders, open])

  const currentLabel = useMemo(() => {
    if (providerType === 'custom') {
      const currentCustom = providers.find(
        (p) => p.providerType === 'custom' && getCustomProviderIdFromKey(p.providerKey) === activeCustomProviderId
      )
      if (currentCustom) {
        const model = currentCustom.models.find((m) => m.id === modelName)
        return `${currentCustom.displayName} / ${model?.name || modelName}`
      }
      return modelName || t('topbar.modelSwitcher.unavailable')
    }

    const current = providers.find((p) => p.providerType === providerType)
    if (current) {
      const model = current.models.find((m) => m.id === modelName)
      return `${current.displayName} / ${model?.name || modelName}`
    }
    return t('topbar.modelSwitcher.unavailable')
  }, [providerType, activeCustomProviderId, providers, modelName, t])

  const handleSelect = (provider: AvailableProvider, nextModelName: string) => {
    const customProviderId = provider.providerType === 'custom'
      ? getCustomProviderIdFromKey(provider.providerKey)
      : undefined
    switchProviderAndModel(provider.providerType, nextModelName, customProviderId)
    setOpen(false)
  }

  if (providers.length === 0 && !loading) {
    return null
  }

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
        <div className="max-h-[360px] space-y-2 overflow-auto">
          {providers.map((provider) => {
            const isCurrentProvider = provider.providerType === 'custom'
              ? provider.providerKey === `custom:${activeCustomProviderId}`
              : provider.providerType === providerType

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
      </PopoverContent>
    </Popover>
  )
}

export default ModelQuickSwitch
