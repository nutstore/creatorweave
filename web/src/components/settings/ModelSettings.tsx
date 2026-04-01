/**
 * ModelSettings - Multi-model selection and configuration component.
 *
 * Features:
 * - Provider selection grouped by category (international/chinese/custom)
 * - Model selection with capability badges
 * - API Key management per provider
 * - Parameter tuning (temperature, max tokens, max iterations)
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
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settings.store'
import type { ThinkingLevel } from '@mariozechner/pi-ai'
import { saveApiKey, loadApiKey, deleteApiKey } from '@/security/api-key-store'
import {
  LLM_PROVIDER_CONFIGS,
  PROVIDER_META,
  getProvidersByCategory,
  getModelsForProvider,
} from '@/agent/providers/types'
import type {
  LLMProviderType,
  ModelCapability,
  ModelInfo,
  ProviderCategory,
} from '@/agent/providers/types'
import { useT } from '@/i18n'
import { BrandInput } from '@creatorweave/ui'
import { BrandSlider } from '@creatorweave/ui'
import { BrandButton } from '@creatorweave/ui'
import { BrandSwitch } from '@creatorweave/ui'
import {
  BrandSelect,
  BrandSelectContent,
  BrandSelectItem,
  BrandSelectTrigger,
  BrandSelectValue,
} from '@creatorweave/ui'

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
      <div className="rounded-lg border border bg-muted p-3 dark:border-border dark:bg-muted/50">
        <div className="flex items-center gap-2 text-sm text-tertiary dark:text-muted">
          <Info className="h-4 w-4" />
          <span>暂无使用统计</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">总 Tokens</p>
          <p className="mt-1 text-lg font-semibold text-secondary dark:text-muted">
            {stats.totalTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">请求次数</p>
          <p className="mt-1 text-lg font-semibold text-secondary dark:text-muted">
            {stats.requestCount.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">输入 Tokens</p>
          <p className="mt-1 text-sm font-medium text-secondary dark:text-muted">
            {stats.promptTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">输出 Tokens</p>
          <p className="mt-1 text-sm font-medium text-secondary dark:text-muted">
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
    customProviders,
    activeCustomProviderId,
    temperature,
    maxTokens,
    maxIterations,
    enableThinking,
    thinkingLevel,
    setProviderType,
    setModelName,
    setCustomBaseUrl,
    createCustomProvider,
    updateCustomProvider,
    removeCustomProvider,
    setActiveCustomProvider,
    addCustomProviderModel,
    removeCustomProviderModel,
    setTemperature,
    setMaxTokens,
    setMaxIterations,
    setEnableThinking,
    setThinkingLevel,
    setHasApiKey,
    invalidateApiKeyCache,
  } = useSettingsStore()
  const t = useT()

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customNameDraft, setCustomNameDraft] = useState('')
  const [customBaseUrlDraft, setCustomBaseUrlDraft] = useState('')
  const [customModelDraft, setCustomModelDraft] = useState('')
  const [newModelDraft, setNewModelDraft] = useState('')
  const [useCustomModelName, setUseCustomModelName] = useState(false)
  const [customModelInput, setCustomModelInput] = useState('')

  const groupedProviders = useMemo(() => getProvidersByCategory(), [])
  const currentProviderMeta = PROVIDER_META[providerType]
  const activeCustomProvider =
    customProviders.find((provider) => provider.id === activeCustomProviderId) || customProviders[0]
  const availableModels = useMemo<ModelInfo[]>(() => {
    if (providerType === 'custom') {
      return (activeCustomProvider?.models || []).map((id) => ({
        id,
        name: id,
        capabilities: ['code'] as ModelCapability[],
        contextWindow: 128000,
      }))
    }
    return getModelsForProvider(providerType)
  }, [providerType, activeCustomProvider])

  const providerKey = useMemo(() => {
    if (providerType !== 'custom') return providerType
    return activeCustomProvider ? `custom:${activeCustomProvider.id}` : 'custom'
  }, [providerType, activeCustomProvider])
  const selectedModel = useMemo(
    () => availableModels.find((m) => m.id === modelName),
    [availableModels, modelName]
  )
  const effectiveBaseUrl = useMemo(() => {
    if (providerType === 'custom') {
      if (activeCustomProvider?.baseUrl) return activeCustomProvider.baseUrl
      return customBaseUrl.trim()
    }
    return LLM_PROVIDER_CONFIGS[providerType]?.baseURL || ''
  }, [providerType, activeCustomProvider, customBaseUrl])

  // Load existing API key on mount and when dialog opens or provider changes
  useEffect(() => {
    loadApiKey(providerKey)
      .then((key) => {
        setApiKey(key || '')
        setHasApiKey(!!key)
      })
      .catch((error) => {
        console.error('[ModelSettings] Failed to load API key:', error)
      })
  }, [providerKey, setHasApiKey, open])

  useEffect(() => {
    if (providerType !== 'custom') return
    if (!activeCustomProvider && customProviders.length > 0) {
      setActiveCustomProvider(customProviders[0].id)
    }
    if (activeCustomProvider) {
      setCustomNameDraft(activeCustomProvider.name)
      setCustomBaseUrlDraft(activeCustomProvider.baseUrl)
      setCustomModelDraft(activeCustomProvider.models[0] || '')
    } else {
      setCustomNameDraft('')
      setCustomBaseUrlDraft(customBaseUrl)
      setCustomModelDraft(modelName)
    }
  }, [
    providerType,
    activeCustomProvider,
    customProviders,
    setActiveCustomProvider,
    customBaseUrl,
    modelName,
  ])

  const handleSaveKey = useCallback(async () => {
    const trimmedKey = apiKey.trim()

    if (!trimmedKey) {
      await deleteApiKey(providerKey)
      setHasApiKey(false)
      invalidateApiKeyCache(providerKey)
      toast.success('API Key 已清空')
      return
    }

    await saveApiKey(providerKey, trimmedKey)
    setHasApiKey(true)
    setSaved(true)
    invalidateApiKeyCache(providerKey)
    setTimeout(() => setSaved(false), 2000)
  }, [apiKey, providerKey, setHasApiKey, invalidateApiKeyCache])

  const handleProviderChange = useCallback(
    (type: string) => {
      const provider = type as LLMProviderType
      setProviderType(provider)
      const config = LLM_PROVIDER_CONFIGS[provider]
      setModelName(config.modelName)

      // Reset custom model input when switching provider
      setUseCustomModelName(false)
      setCustomModelInput('')

      // Reset custom URL if not custom provider
      if (provider !== 'custom') {
        setCustomBaseUrl('')
      }

      // Load the new provider's key
      const keyName =
        provider === 'custom' && activeCustomProvider ? `custom:${activeCustomProvider.id}` : provider
      loadApiKey(keyName)
        .then((key) => {
          setApiKey(key || '')
          setHasApiKey(!!key)
        })
        .catch((error) => {
          console.error('[ModelSettings] Failed to load API key:', error)
        })
    },
    [setProviderType, setModelName, setCustomBaseUrl, setHasApiKey, activeCustomProvider]
  )

  const handleCreateCustomProvider = useCallback(() => {
    const ok = createCustomProvider({
      name: customNameDraft,
      baseUrl: customBaseUrlDraft,
      model: customModelDraft,
    })
    if (!ok) {
      toast.error('请填写服务商名称、Base URL 和模型名称')
      return
    }
    setNewModelDraft('')
    toast.success('已添加自定义服务商')
  }, [createCustomProvider, customNameDraft, customBaseUrlDraft, customModelDraft])

  const handleSaveCustomProvider = useCallback(() => {
    if (!activeCustomProvider) return
    const ok = updateCustomProvider(activeCustomProvider.id, {
      name: customNameDraft,
      baseUrl: customBaseUrlDraft,
      model: customModelDraft,
    })
    if (!ok) {
      toast.error('请填写有效的服务商信息')
      return
    }
    if (customModelDraft.trim()) {
      setModelName(customModelDraft.trim())
    }
    toast.success('自定义服务商已更新')
  }, [
    activeCustomProvider,
    updateCustomProvider,
    customNameDraft,
    customBaseUrlDraft,
    customModelDraft,
    setModelName,
  ])

  const handleAddCustomModel = useCallback(() => {
    if (!activeCustomProvider) {
      toast.error('请先创建并选择一个服务商')
      return
    }
    const ok = addCustomProviderModel(activeCustomProvider.id, newModelDraft)
    if (!ok) {
      toast.error('模型名称不能为空')
      return
    }
    setModelName(newModelDraft.trim())
    setNewModelDraft('')
    toast.success('模型已添加')
  }, [activeCustomProvider, addCustomProviderModel, newModelDraft, setModelName])

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
  const handleMaxIterationsChange = useCallback(
    (value: number[]) => {
      setMaxIterations(value[0] || 20)
    },
    [setMaxIterations]
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
                  <div className="px-2 py-1.5 text-xs font-semibold text-tertiary dark:text-muted">
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

        <div className="rounded-md border border bg-muted/30 p-2 dark:border-border dark:bg-muted/30">
          <p className="text-[11px] font-medium text-secondary">API Base URL</p>
          <p className="mt-1 break-all font-mono text-[11px] text-tertiary">
            {effectiveBaseUrl || '未配置'}
          </p>
        </div>
      </div>

      {/* ── Custom Provider Management ── */}
      {providerType === 'custom' && (
        <div className="space-y-3 rounded-lg border border p-3 dark:border-border">
          <div className="space-y-2">
            <label className="text-sm font-medium text-primary">自定义服务商</label>
            {customProviders.length > 0 ? (
              <BrandSelect
                value={activeCustomProvider?.id || ''}
                onValueChange={(id) => setActiveCustomProvider(id)}
              >
                <BrandSelectTrigger className="h-10">
                  <BrandSelectValue placeholder="选择服务商" />
                </BrandSelectTrigger>
                <BrandSelectContent>
                  {customProviders.map((provider) => (
                    <BrandSelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </BrandSelectItem>
                  ))}
                </BrandSelectContent>
              </BrandSelect>
            ) : (
              <p className="text-xs text-muted">尚未添加自定义服务商</p>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <BrandInput
              value={customNameDraft}
              onChange={(e) => setCustomNameDraft(e.target.value)}
              placeholder="服务商名称"
              className="h-10"
            />
            <BrandInput
              value={customBaseUrlDraft}
              onChange={(e) => setCustomBaseUrlDraft(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="h-10 md:col-span-2"
            />
          </div>
          <div className="flex gap-2">
            <BrandInput
              value={customModelDraft}
              onChange={(e) => setCustomModelDraft(e.target.value)}
              placeholder="默认模型，如 gpt-4o-mini"
              className="h-10 flex-1"
            />
            {activeCustomProvider ? (
              <>
                <BrandButton variant="outline" onClick={handleSaveCustomProvider}>
                  保存
                </BrandButton>
                <BrandButton
                  variant="ghost"
                  onClick={() => removeCustomProvider(activeCustomProvider.id)}
                  title="删除服务商"
                >
                  <Trash2 className="h-4 w-4" />
                </BrandButton>
              </>
            ) : (
              <BrandButton onClick={handleCreateCustomProvider}>
                <Plus className="mr-1 h-4 w-4" />
                添加
              </BrandButton>
            )}
          </div>

          {activeCustomProvider && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary">模型列表</label>
              <div className="flex gap-2">
                <BrandInput
                  value={newModelDraft}
                  onChange={(e) => setNewModelDraft(e.target.value)}
                  placeholder="新增模型名称"
                  className="h-9 flex-1"
                />
                <BrandButton variant="outline" className="h-9 px-3" onClick={handleAddCustomModel}>
                  添加模型
                </BrandButton>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeCustomProvider.models.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 rounded-full border border px-2 py-1 text-xs text-secondary"
                  >
                    {item}
                    {activeCustomProvider.models.length > 1 && (
                      <button
                        type="button"
                        className="text-tertiary hover:text-red-500"
                        onClick={() => removeCustomProviderModel(activeCustomProvider.id, item)}
                        aria-label={`移除模型 ${item}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Model Selection ── */}
      {availableModels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-primary">{t('settings.modelName')}</label>
            <label className="flex items-center gap-2 text-xs text-secondary">
              <input
                type="checkbox"
                checked={useCustomModelName}
                onChange={(e) => {
                  setUseCustomModelName(e.target.checked)
                  if (e.target.checked) {
                    setCustomModelInput(modelName)
                  }
                }}
                className="h-3.5 w-3.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              手动输入
            </label>
          </div>

          {useCustomModelName ? (
            <BrandInput
              type="text"
              value={customModelInput}
              onChange={(e) => {
                setCustomModelInput(e.target.value)
                setModelName(e.target.value)
              }}
              placeholder="输入模型名称，如 gpt-4.1, claude-3-5-sonnet-20241022"
              className="h-10"
            />
          ) : (
            <BrandSelect value={modelName} onValueChange={handleModelChange}>
              <BrandSelectTrigger className="h-10">
                <BrandSelectValue />
              </BrandSelectTrigger>
              <BrandSelectContent>
                {availableModels.map((model) => (
                  <BrandSelectItem key={model.id} value={model.id}>
                    <div className="flex items-center gap-2">
                      <span>{model.name}</span>
                      <span className="text-[10px] text-tertiary">
                        {formatContextWindow(model.contextWindow)}
                      </span>
                    </div>
                  </BrandSelectItem>
                ))}
              </BrandSelectContent>
            </BrandSelect>
          )}

          {/* Model capabilities */}
          {!useCustomModelName && selectedModel && (
            <div className="flex flex-wrap gap-1.5">
              {selectedModel.capabilities.map((cap) => (
                <CapabilityBadge key={cap} capability={cap} />
              ))}
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-secondary dark:bg-muted dark:text-muted">
                <Timer className="h-2.5 w-2.5" />
                {formatContextWindow(selectedModel.contextWindow)} tokens
              </span>
            </div>
          )}

          {useCustomModelName && (
            <p className="text-xs text-muted">
              开启后可输入任意模型名称，适用于新发布的模型
            </p>
          )}
        </div>
      )}

      {/* ── Custom Model Name (for custom/no models) ── */}
      {((providerType !== 'custom' && availableModels.length === 0) ||
        (providerType === 'custom' && (!activeCustomProvider || availableModels.length === 0))) && (
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
      {providerType === 'custom' && !activeCustomProvider && (
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
              className="flex w-full rounded-lg border border-neutral-200 bg-transparent px-[14px] py-[10px] pr-10 text-sm focus-visible:border-primary-600 focus-visible:shadow-[0_0_6px_rgba(13,148,136,0.13)] focus-visible:outline-none dark:border-border"
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
          className="flex w-full items-center gap-2 text-sm font-medium text-secondary hover:text-secondary dark:text-muted dark:hover:text-muted"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
          高级参数
        </button>

        {showAdvanced && (
          <div className="space-y-4 rounded-lg border border p-3 dark:border-border">
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
              <div className="flex justify-between text-[10px] text-tertiary">
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

            {/* Max Iterations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-primary">最大迭代次数</label>
                <span className="text-sm text-secondary">{maxIterations}</span>
              </div>
              <BrandSlider
                value={[maxIterations]}
                onValueChange={handleMaxIterationsChange}
                min={1}
                max={100}
                step={1}
              />
              <p className="text-[10px] text-tertiary">限制单次 Agent Loop 的最大 assistant 回合数</p>
            </div>

            {/* Thinking Mode */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-secondary" />
                  <label className="text-sm font-medium text-primary">思考模式</label>
                </div>
                <BrandSwitch
                  checked={enableThinking}
                  onCheckedChange={setEnableThinking}
                />
              </div>

              {enableThinking && (
                <div className="space-y-2.5 pl-6">
                  <div className="relative">
                    {/* Intensity gradient track */}
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-primary-200 via-primary-400 to-primary-600 dark:from-primary-800 dark:via-primary-600 dark:to-primary-400" />
                    {/* Level pills */}
                    <div className="mt-2 flex gap-1">
                      {([
                        { value: 'minimal' as ThinkingLevel, label: '浅度', depth: 1 },
                        { value: 'low' as ThinkingLevel, label: '低', depth: 2 },
                        { value: 'medium' as ThinkingLevel, label: '中', depth: 3 },
                        { value: 'high' as ThinkingLevel, label: '深度', depth: 4 },
                        { value: 'xhigh' as ThinkingLevel, label: '极深', depth: 5 },
                      ]).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setThinkingLevel(value)}
                          className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all ${
                            thinkingLevel === value
                              ? 'bg-primary-600 text-white shadow-sm dark:bg-primary-500'
                              : 'bg-neutral-50 text-tertiary hover:bg-neutral-100 hover:text-secondary dark:bg-neutral-800/60 dark:text-muted dark:hover:bg-neutral-700 dark:hover:text-secondary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 flex justify-between px-0.5">
                      <span className="text-[10px] text-tertiary">快速</span>
                      <span className="text-[10px] text-tertiary">深入</span>
                    </div>
                  </div>
                </div>
              )}
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
