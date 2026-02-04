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
} from '@browser-fs-analyzer/ui'
import { BrandInput } from '@browser-fs-analyzer/ui'
import { BrandSlider } from '@browser-fs-analyzer/ui'
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
  const [hasExistingKey, setHasExistingKey] = useState(false) // 数据库中是否已有 key
  const [isLoadingKey, setIsLoadingKey] = useState(false)

  // Load existing API key on mount and when dialog opens
  // We don't display the actual key for security
  useEffect(() => {
    setIsLoadingKey(true)
    loadApiKey(providerType)
      .then((key) => {
        const exists = !!key
        setHasExistingKey(exists)
        setHasApiKey(exists)
      })
      .catch((error) => {
        console.error('[SettingsDialog] Failed to load API key:', error)
      })
      .finally(() => {
        setIsLoadingKey(false)
      })
  }, [providerType, setHasApiKey, open]) // Add 'open' to reload when dialog opens

  const handleSaveKey = async () => {
    const trimmedKey = apiKey.trim()

    if (!trimmedKey) {
      // Empty key means delete/unset the API key
      await deleteApiKey(providerType)
      setHasApiKey(false)
      setHasExistingKey(false)
      invalidateApiKeyCache(providerType)
      toast.success('API Key 已清空')
      return
    }

    await saveApiKey(providerType, trimmedKey)
    setHasApiKey(true)
    setHasExistingKey(true)
    setSaved(true)
    invalidateApiKeyCache(providerType)
    // Clear the input field after saving for security
    setApiKey('')
    setTimeout(() => setSaved(false), 2000)
  }

  const handleProviderChange = (type: string) => {
    const provider = type as LLMProviderType
    setProviderType(provider)
    const config = LLM_PROVIDER_CONFIGS[provider]
    setModelName(config.modelName)
    setApiKey('') // Clear input when switching provider
    setIsLoadingKey(true)

    // Check if new provider has a key
    loadApiKey(provider)
      .then((key) => {
        const exists = !!key
        setHasExistingKey(exists)
        setHasApiKey(exists)
      })
      .catch((error) => {
        console.error('[SettingsDialog] Failed to load API key:', error)
      })
      .finally(() => {
        setIsLoadingKey(false)
      })
  }

  // Convert temperature (0-1) to slider value (0-100)
  const temperatureValue = Math.round(temperature * 100)
  const handleTemperatureChange = (value: number[]) => {
    setTemperature(value[0] / 100)
  }

  return (
    <BrandDialogContent ref={ref} className="w-[448px] gap-0 rounded-xl p-0" {...props}>
      {/* Header */}
      <BrandDialogHeader className="h-14 border-b border-gray-200 px-6">
        <div className="flex items-center gap-2.5">
          <Settings className="h-[18px] w-[18px] text-primary-600" />
          <BrandDialogTitle className="text-base font-semibold text-primary">
            {t('settings.title')}
          </BrandDialogTitle>
        </div>
        <BrandDialogClose className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </BrandDialogClose>
      </BrandDialogHeader>

      {/* Body */}
      <div className="space-y-5 px-6 py-6">
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
              <BrandInput
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  isLoadingKey
                    ? '加载中...'
                    : hasExistingKey && !apiKey
                      ? '••••••••••••• (已配置，输入新 Key 可更新)'
                      : t('settings.apiKeyPlaceholder')
                }
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-tertiary absolute right-3 top-1/2 -translate-y-1/2 hover:text-primary"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveKey}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              {saved ? <Check className="h-4 w-4" /> : t('settings.save')}
            </button>
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
      </div>
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
