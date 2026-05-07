/**
 * ModelSettings - LLM 设置面板
 *
 * 拆分为两个子区域：
 * 1. 默认模型选择 (Select) - 选择当前使用的服务商和模型
 * 2. 服务商管理 (ProviderManager) - 管理所有服务商的配置
 *
 * 高级参数和 Token 统计保留在此组件中
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Code,
  PenTool,
  Brain,
  ScanEye,
  Zap,
  BookOpen,
  Info,
  ChevronDown,
} from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import type { ThinkingLevel } from '@mariozechner/pi-ai'
import type { LLMProviderType, ModelCapability } from '@/agent/providers/types'
import { useT } from '@/i18n'
import { BrandInput } from '@creatorweave/ui'
import { BrandSlider } from '@creatorweave/ui'
import { BrandButton } from '@creatorweave/ui'
import { BrandSwitch } from '@creatorweave/ui'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@creatorweave/ui'
import { ProviderManager } from './ProviderManager'

// =============================================================================
// Constants
// =============================================================================

const CAPABILITY_COLORS: Record<ModelCapability, string> = {
  code: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  writing: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  reasoning: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  vision: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  fast: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'long-context': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

const CAPABILITY_ICONS: Record<ModelCapability, typeof Code> = {
  code: Code,
  writing: PenTool,
  reasoning: Brain,
  vision: ScanEye,
  fast: Zap,
  'long-context': BookOpen,
}

// =============================================================================
// Capability Badge (shared)
// =============================================================================

export function CapabilityBadge({ capability }: { capability: ModelCapability }) {
  const t = useT()
  const color = CAPABILITY_COLORS[capability]
  const Icon = CAPABILITY_ICONS[capability]
  const label = t(`settings.capabilities.${capability}` as const)

  if (!color || !Icon) return null

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
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
  const t = useT()
  const stats = useTokenStats()

  if (stats.requestCount === 0) {
    return (
      <div className="rounded-lg border border bg-muted p-3 dark:border-border dark:bg-muted/50">
        <div className="flex items-center gap-2 text-sm text-tertiary dark:text-muted">
          <Info className="h-4 w-4" />
          <span>{t('settings.tokenStats.noUsage')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">{t('settings.tokenStats.totalTokens')}</p>
          <p className="mt-1 text-lg font-semibold text-secondary dark:text-muted">
            {stats.totalTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">{t('settings.tokenStats.requestCount')}</p>
          <p className="mt-1 text-lg font-semibold text-secondary dark:text-muted">
            {stats.requestCount.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">{t('settings.tokenStats.inputTokens')}</p>
          <p className="mt-1 text-sm font-medium text-secondary dark:text-muted">
            {stats.promptTokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border p-3 dark:border-border">
          <p className="text-xs text-tertiary dark:text-muted">{t('settings.tokenStats.outputTokens')}</p>
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
  const rootRef = useRef<HTMLDivElement>(null)
  const {
    providerType,
    modelName,
    temperature,
    maxTokens,
    maxIterations,
    enableThinking,
    thinkingLevel,
    setTemperature,
    setMaxTokens,
    setMaxIterations,
    setEnableThinking,
    setThinkingLevel,
    switchProviderAndModel,
    getAvailableProviders,
  } = useSettingsStore()
  const t = useT()

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [providers, setProviders] = useState<
    Array<{
      providerType: LLMProviderType
      displayName: string
      models: Array<{ id: string; name: string }>
      providerKey: string
    }>
  >([])

  // Load available providers
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await getAvailableProviders()
        if (!cancelled) {
          setProviders(result)
        }
      } catch {
        // ignore
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [getAvailableProviders, open])

  // Build flat options for Select: value = "providerType:modelId"
  const currentSelectValue = `${providerType}:${modelName}`

  const handleSelectChange = useCallback(
    (value: string) => {
      const idx = value.indexOf(':')
      if (idx < 0) return
      const pType = value.slice(0, idx) as LLMProviderType
      const mId = value.slice(idx + 1)
      switchProviderAndModel(pType, mId)
    },
    [switchProviderAndModel],
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
    <div ref={rootRef} className="space-y-6">
      {/* ── Section 1: Default Model Selection ── */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-primary">
          {t('settings.defaultModel.title')}
        </label>
        <Select value={currentSelectValue} onValueChange={handleSelectChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('topbar.modelSwitcher.unavailable')}>
              {currentSelectValue && (() => {
                const idx = currentSelectValue.indexOf(':')
                const pType = currentSelectValue.slice(0, idx) as LLMProviderType
                const mId = currentSelectValue.slice(idx + 1)
                const prov = providers.find((p) => p.providerType === pType)
                const mod = prov?.models.find((m) => m.id === mId)
                return mod ? `${prov?.displayName} / ${mod.name}` : mId
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent container={rootRef.current} className="max-h-[280px]">
            {providers.map((provider) => (
              <SelectGroup key={provider.providerKey}>
                <SelectLabel>{provider.displayName}</SelectLabel>
                {provider.models.map((model) => (
                  <SelectItem
                    key={`${provider.providerKey}:${model.id}`}
                    value={`${provider.providerType}:${model.id}`}
                  >
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Section 2: Provider Management ── */}
      <div className="border-t border-border/40 pt-4">
        <ProviderManager />
      </div>

      {/* ── Section 3: Advanced Parameters (collapsible) ── */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center gap-2 text-sm font-medium text-secondary hover:text-secondary dark:text-muted dark:hover:text-muted"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
          {t('settings.advancedParameters')}
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
                <span>{t('settings.temperatureOptions.precise')}</span>
                <span>{t('settings.temperatureOptions.creative')}</span>
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
                <label className="text-sm font-medium text-primary">{t('settings.maxIterations')}</label>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      maxIterations === 0 ? 'text-brand-500' : 'text-secondary'
                    }`}
                  >
                    {maxIterations === 0 ? '∞' : maxIterations}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-tertiary">{t('settings.maxIterationsUnlimited')}</span>
                    <BrandSwitch
                      checked={maxIterations === 0}
                      onCheckedChange={(checked) => setMaxIterations(checked ? 0 : 20)}
                    />
                  </div>
                </div>
              </div>
              {maxIterations !== 0 && (
                <BrandSlider
                  value={[maxIterations]}
                  onValueChange={handleMaxIterationsChange}
                  min={1}
                  max={100}
                  step={1}
                />
              )}
              <p className="text-[10px] text-tertiary">
                {maxIterations === 0
                  ? t('settings.maxIterationsUnlimitedHint')
                  : t('settings.maxIterationsHint')}
              </p>
            </div>

            {/* Thinking Mode */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-secondary" />
                  <label className="text-sm font-medium text-primary">{t('settings.thinkingMode')}</label>
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
                        { value: 'minimal' as ThinkingLevel, label: t('settings.thinkingLevels.minimal') },
                        { value: 'low' as ThinkingLevel, label: t('settings.thinkingLevels.low') },
                        { value: 'medium' as ThinkingLevel, label: t('settings.thinkingLevels.medium') },
                        { value: 'high' as ThinkingLevel, label: t('settings.thinkingLevels.high') },
                        { value: 'xhigh' as ThinkingLevel, label: t('settings.thinkingLevels.xhigh') },
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
                      <span className="text-[10px] text-tertiary">{t('settings.thinkingModeFast')}</span>
                      <span className="text-[10px] text-tertiary">{t('settings.thinkingModeDeep')}</span>
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
        <h4 className="text-sm font-medium text-primary">{t('settings.tokenStats.title')}</h4>
        <TokenStatsDisplay />
      </div>
    </div>
  )
}
