/**
 * SettingsDialog - API key configuration and model settings.
 * Using @browser-fs-analyzer/ui brand components.
 */

import { useState, useEffect, forwardRef } from 'react'
import { Eye, EyeOff, Check, Settings, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settings.store'
import { saveApiKey, loadApiKey, deleteApiKey } from '@/security/api-key-store'
import { LLM_PROVIDER_CONFIGS } from '@/agent/providers/types'
import type { LLMProviderType } from '@/agent/providers/types'
import { useT } from '@/i18n'
import {
  BrandDialog,
  BrandDialogClose,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
} from '@browser-fs-analyzer/ui'
import { BrandInput } from '@browser-fs-analyzer/ui'
import { BrandSlider } from '@browser-fs-analyzer/ui'
import { BrandButton } from '@browser-fs-analyzer/ui'
import {
  BrandSelect,
  BrandSelectContent,
  BrandSelectItem,
  BrandSelectTrigger,
  BrandSelectValue,
} from '@browser-fs-analyzer/ui'

interface SettingsDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
}

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  glm: '智谱 GLM',
  'glm-coding': '智谱 GLM (Coding)',
  kimi: 'Kimi (Moonshot)',
  minimax: 'MiniMax',
  qwen: '通义千问 (Qwen)',
}

const SettingsDialogContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BrandDialogContent> & { open?: boolean }
>(({ className, open, ...props }, ref) => {
  const {
    providerType,
    modelName,
    temperature,
    maxTokens,
    setProviderType,
    setModelName,
    setTemperature,
    setMaxTokens,
    setHasApiKey,
    invalidateApiKeyCache,
  } = useSettingsStore()
  const t = useT()

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load existing API key on mount and when dialog opens
  useEffect(() => {
    loadApiKey(providerType)
      .then((key) => {
        setApiKey(key || '')
        setHasApiKey(!!key)
      })
      .catch((error) => {
        console.error('[SettingsDialog] Failed to load API key:', error)
      })
  }, [providerType, setHasApiKey, open])

  const handleSaveKey = async () => {
    const trimmedKey = apiKey.trim()

    if (!trimmedKey) {
      await deleteApiKey(providerType)
      setHasApiKey(false)
      invalidateApiKeyCache(providerType)
      toast.success('API Key 已清空')
      return
    }

    await saveApiKey(providerType, trimmedKey)
    setHasApiKey(true)
    setSaved(true)
    invalidateApiKeyCache(providerType)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleProviderChange = (type: string) => {
    const provider = type as LLMProviderType
    setProviderType(provider)
    const config = LLM_PROVIDER_CONFIGS[provider]
    setModelName(config.modelName)

    // Load the new provider's key
    loadApiKey(provider)
      .then((key) => {
        setApiKey(key || '')
        setHasApiKey(!!key)
      })
      .catch((error) => {
        console.error('[SettingsDialog] Failed to load API key:', error)
      })
  }

  // Convert temperature (0-1) to slider value (0-100)
  const temperatureValue = Math.round(temperature * 100)
  const handleTemperatureChange = (value: number[]) => {
    setTemperature(value[0] / 100)
  }

  return (
    <BrandDialogContent ref={ref} className="w-[440px]" showOverlay={true} {...props}>
      <BrandDialogHeader>
        <div className="flex items-center gap-2.5">
          <Settings className="h-[18px] w-[18px] text-primary-600" />
          <BrandDialogTitle>{t('settings.title')}</BrandDialogTitle>
        </div>
        <BrandDialogClose asChild>
          <button className="text-tertiary transition-colors hover:text-primary">
            <X className="h-5 w-5" />
          </button>
        </BrandDialogClose>
      </BrandDialogHeader>

      <BrandDialogBody>
        {/* Provider Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">{t('settings.llmProvider')}</label>
          <BrandSelect value={providerType} onValueChange={handleProviderChange}>
            <BrandSelectTrigger className="h-10">
              <BrandSelectValue />
            </BrandSelectTrigger>
            <BrandSelectContent>
              {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                <BrandSelectItem key={key} value={key}>
                  {label}
                </BrandSelectItem>
              ))}
            </BrandSelectContent>
          </BrandSelect>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">{t('settings.apiKey')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('settings.apiKeyPlaceholder')}
                className="flex w-full rounded-lg border border-gray-200 bg-transparent px-[14px] py-[10px] pr-10 text-sm focus-visible:border-primary-600 focus-visible:shadow-[0_0_6px_rgba(13,148,136,0.13)] focus-visible:outline-none"
                style={{ WebkitTextSecurity: showKey ? 'none' : 'disc' } as React.CSSProperties}
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                name="api-key-input"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-tertiary absolute right-3 top-1/2 -translate-y-1/2 hover:text-primary"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <BrandButton variant="primary" onClick={handleSaveKey}>
              {saved ? <Check className="h-4 w-4" /> : t('settings.save')}
            </BrandButton>
          </div>
          <p className="text-xs text-muted">{t('settings.apiKeyNote')}</p>
        </div>

        {/* Model Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">{t('settings.modelName')}</label>
          <BrandInput
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            className="h-10"
          />
        </div>

        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-primary">{t('settings.temperature')}</label>
            <span className="text-sm text-secondary">{temperature}</span>
          </div>
          <BrandSlider
            value={[temperatureValue]}
            onValueChange={handleTemperatureChange}
            max={100}
            step={1}
          />
        </div>

        {/* Max Tokens */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">{t('settings.maxTokens')}</label>
          <BrandInput
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
            min={256}
            max={32768}
            step={256}
            className="h-10"
          />
        </div>
      </BrandDialogBody>
    </BrandDialogContent>
  )
})
SettingsDialogContent.displayName = 'SettingsDialogContent'

const SettingsDialog = forwardRef<
  React.ElementRef<typeof BrandDialog>,
  React.ComponentPropsWithoutRef<typeof BrandDialog> & SettingsDialogProps
>(({ open, onOpenChange, ...props }, ref) => {
  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <SettingsDialogContent ref={ref as React.RefObject<HTMLDivElement>} open={open} {...props} />
    </BrandDialog>
  )
})
SettingsDialog.displayName = 'SettingsDialog'

export { SettingsDialog, SettingsDialogContent }
