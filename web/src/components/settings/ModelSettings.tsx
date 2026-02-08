/**
 * ModelSettings - Multi-model selection and configuration component.
 *
 * Features:
 * - Provider selection grouped by category (international/chinese/custom)
 * - Model selection with capability badges
 * - API Key management per provider
 * - Parameter tuning (temperature, max tokens)
 * - Custom endpoint support for OpenAI-compatible APIs
 * - Token usage statistics display
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Zap,
  Code,
  PenTool,
  Brain,
  ScanEye,
  Timer,
  BookOpen,
  Info,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settings.store'
import { saveApiKey, loadApiKey, deleteApiKey } from '@/security/api-key-store'
import {
  LLM_PROVIDER_CONFIGS,
  PROVIDER_META,
  getProvidersByCategory,
  getModelsForProvider,
} from '@/agent/providers/types'
import type { LLMProviderType, ModelCapability, ProviderCategory } from '@/agent/providers/types'
import { useT } from '@/i18n'
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

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  international: '国际服务商',
  chinese: '国内服务商',
  custom: '自定义',
}

const CATEGORY_ORDER: ProviderCategory[] = ['international', 'chinese', 'custom']

const CAPABILITY_CONFIG: Record<
  ModelCapability,
  { icon: typeof Code; label: string; color: string }
> = {
  code: {
    icon: Code,
    label: '代码',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  writing: {
    icon: PenTool,
    label: '写作',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  reasoning: {
    icon: Brain,
    label: '推理',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  vision: {
    icon: ScanEye,
    label: '视觉',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  fast: {
    icon: Zap,
    label: '快速',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
  'long-context': {
    icon: BookOpen,
    label: '长上下文',
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  },
}

// =============================================================================
// Capability Badge
// =============================================================================

function CapabilityBadge({ capability }: { capability: ModelCapability }) {
  const config = CAPABILITY_CONFIG[capability]
  if (!config) return null
  const Icon = config.icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  )
}

// =============================================================================
// Format Utilities
// =============================================================================

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
  return `${tokens}`
}

// =============================================================================
// Token Stats
// =============================================================================

interface TokenStats {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  requestCount: number
}

function useTokenStats(): TokenStats {
  // Read from localStorage for session token tracking
  const [stats, setStats] = useState<TokenStats>({
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    requestCount: 0,
  })

  useEffect(() => {
    try {
      const stored = localStorage.getItem('bfosa-token-stats')
      if (stored) {
        setStats(JSON.parse(stored))
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  return stats
}

function TokenStatsDisplay() {
  const stats = useTokenStats()

  if (stats.requestCount === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <Info className="h-4 w-4" />
          <span>暂无使用统计</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">总 Tokens</p>
          <p className="mt-1 text-lg font-semibold text-neutral-800 dark:text-neutral-200">
            {stats.totalTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">请求次数</p>
          <p className="mt-1 text-lg font-semibold text-neutral-800 dark:text-neutral-200">
            {stats.requestCount.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">输入 Tokens</p>
          <p className="mt-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {stats.promptTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">输出 Tokens</p>
          <p className="mt-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {stats.completionTokens.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main ModelSettings Component
// =============================================================================

interface ModelSettingsProps {
  /** Whether the parent dialog is open (triggers key reload) */
  open?: boolean
}

export function ModelSettings({ open }: ModelSettingsProps) {
  const {
    providerType,
    modelName,
    customBaseUrl,
    temperature,
    maxTokens,
    setProviderType,
    setModelName,
    setCustomBaseUrl,
    setTemperature,
    setMaxTokens,
    setHasApiKey,
    invalidateApiKeyCache,
  } = useSettingsStore()
  const t = useT()

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const groupedProviders = useMemo(() => getProvidersByCategory(), [])
  const currentProviderMeta = PROVIDER_META[providerType]
  const availableModels = useMemo(() => getModelsForProvider(providerType), [providerType])
  const selectedModel = useMemo(
    () => availableModels.find((m) => m.id === modelName),
    [availableModels, modelName]
  )

  // Load existing API key on mount and when dialog opens or provider changes
  useEffect(() => {
    loadApiKey(providerType)
      .then((key) => {
        setApiKey(key || '')
        setHasApiKey(!!key)
      })
      .catch((error) => {
        console.error('[ModelSettings] Failed to load API key:', error)
      })
  }, [providerType, setHasApiKey, open])

  const handleSaveKey = useCallback(async () => {
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
  }, [apiKey, providerType, setHasApiKey, invalidateApiKeyCache])

  const handleProviderChange = useCallback(
    (type: string) => {
      const provider = type as LLMProviderType
      setProviderType(provider)
      const config = LLM_PROVIDER_CONFIGS[provider]
      setModelName(config.modelName)

      // Reset custom URL if not custom provider
      if (provider !== 'custom') {
        setCustomBaseUrl('')
      }

      // Load the new provider's key
      loadApiKey(provider)
        .then((key) => {
          setApiKey(key || '')
          setHasApiKey(!!key)
        })
        .catch((error) => {
          console.error('[ModelSettings] Failed to load API key:', error)
        })
    },
    [setProviderType, setModelName, setCustomBaseUrl, setHasApiKey]
  )

  const handleModelChange = useCallback(
    (modelId: string) => {
      setModelName(modelId)
    },
    [setModelName]
  )

  // Convert temperature (0-1) to slider value (0-100)
  const temperatureValue = Math.round(temperature * 100)
  const handleTemperatureChange = useCallback(
    (value: number[]) => {
      setTemperature(value[0] / 100)
    },
    [setTemperature]
  )

  return (
    <div className="space-y-5">
      {/* ── Provider Selection ── */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-primary">{t('settings.llmProvider')}</label>
        <BrandSelect value={providerType} onValueChange={handleProviderChange}>
          <BrandSelectTrigger className="h-10">
            <BrandSelectValue />
          </BrandSelectTrigger>
          <BrandSelectContent>
            {CATEGORY_ORDER.map((category) => {
              const providers = groupedProviders[category]
              if (providers.length === 0) return null
              return (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    {CATEGORY_LABELS[category]}
                  </div>
                  {providers.map(({ type, meta }) => (
                    <BrandSelectItem key={type} value={type}>
                      {meta.displayName}
                    </BrandSelectItem>
                  ))}
                </div>
              )
            })}
          </BrandSelectContent>
        </BrandSelect>

        {/* Provider website link */}
        {currentProviderMeta?.website && (
          <a
            href={currentProviderMeta.website}
            target="_blank"
            rel="noopener noreferrer"
            className="dark:text-primary-400 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            获取 API Key
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* ── Model Selection ── */}
      {availableModels.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">{t('settings.modelName')}</label>
          <BrandSelect value={modelName} onValueChange={handleModelChange}>
            <BrandSelectTrigger className="h-10">
              <BrandSelectValue />
            </BrandSelectTrigger>
            <BrandSelectContent>
              {availableModels.map((model) => (
                <BrandSelectItem key={model.id} value={model.id}>
                  <div className="flex items-center gap-2">
                    <span>{model.name}</span>
                    <span className="text-[10px] text-neutral-400">
                      {formatContextWindow(model.contextWindow)}
                    </span>
                  </div>
                </BrandSelectItem>
              ))}
            </BrandSelectContent>
          </BrandSelect>

          {/* Model capabilities */}
          {selectedModel && (
            <div className="flex flex-wrap gap-1.5">
              {selectedModel.capabilities.map((cap) => (
                <CapabilityBadge key={cap} capability={cap} />
              ))}
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                <Timer className="h-2.5 w-2.5" />
                {formatContextWindow(selectedModel.contextWindow)} tokens
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Custom Model Name (for custom/no models) ── */}
      {(providerType === 'custom' || availableModels.length === 0) && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">{t('settings.modelName')}</label>
          <BrandInput
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
            className="h-10"
          />
        </div>
      )}

      {/* ── Custom Base URL ── */}
      {providerType === 'custom' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">API Base URL</label>
          <BrandInput
            type="text"
            value={customBaseUrl}
            onChange={(e) => setCustomBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="h-10"
          />
          <p className="text-xs text-muted">支持 OpenAI 兼容的 API 端点</p>
        </div>
      )}

      {/* ── API Key ── */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-primary">{t('settings.apiKey')}</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('settings.apiKeyPlaceholder')}
              className="flex w-full rounded-lg border border-gray-200 bg-transparent px-[14px] py-[10px] pr-10 text-sm focus-visible:border-primary-600 focus-visible:shadow-[0_0_6px_rgba(13,148,136,0.13)] focus-visible:outline-none dark:border-neutral-700"
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

      {/* ── Advanced Parameters (collapsible) ── */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
          高级参数
        </button>

        {showAdvanced && (
          <div className="space-y-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
            {/* Temperature */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-primary">
                  {t('settings.temperature')}
                </label>
                <span className="text-sm text-secondary">{temperature}</span>
              </div>
              <BrandSlider
                value={[temperatureValue]}
                onValueChange={handleTemperatureChange}
                max={100}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>精确</span>
                <span>创意</span>
              </div>
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
        )}
      </div>

      {/* ── Token Usage Stats ── */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-primary">使用统计</h4>
        <TokenStatsDisplay />
      </div>
    </div>
  )
}
