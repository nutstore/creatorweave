/**
 * ProviderManager - 服务商管理面板
 *
 * 功能：
 * - 列出所有服务商（内置 + 自定义），分组展示
 * - 每个服务商可展开管理：API Key、模型列表
 * - 模型列表：/models 动态获取 + 硬编码 + 手动输入补充
 * - 自定义服务商额外支持编辑 baseURL
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Plus,
  X,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settings.store'
import type { CustomProviderConfig } from '@/store/settings.store'
import { saveApiKey, loadApiKey, deleteApiKey } from '@/security/api-key-store'
import {
  getProvidersByCategory,
  getModelsForProvider,
  getProviderConfig,
  isCustomProviderType,
} from '@/agent/providers/types'
import type {
  LLMProviderType,
  ModelInfo,
  ProviderCategory,
} from '@/agent/providers/types'
import { useDynamicModels } from '@/agent/providers/use-dynamic-models'
import { getCachedModels } from '@/agent/providers/model-store'
import { useT } from '@/i18n'
import { BrandInput, BrandButton, BrandDialog, BrandDialogContent, BrandDialogHeader, BrandDialogBody, BrandDialogFooter, BrandDialogTitle, BrandDialogClose } from '@creatorweave/ui'

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_ORDER: ProviderCategory[] = ['international', 'chinese', 'custom']

// =============================================================================
// ProviderCard - 单个服务商卡片
// =============================================================================

interface ProviderCardProps {
  providerType: LLMProviderType
  displayName: string
  website?: string
  isCustom: boolean
  customProvider?: CustomProviderConfig
  isExpanded: boolean
  onToggle: () => void
}

function ProviderCard({
  providerType,
  displayName,
  website,
  isCustom,
  customProvider,
  isExpanded,
  onToggle,
}: ProviderCardProps) {
  const t = useT()
  const {
    customProviders,
    updateCustomProvider,
    removeCustomProvider,
    addCustomProviderModel,
    removeCustomProviderModel,
    setCustomProviderApiMode,
    invalidateApiKeyCache,
    pinnedModelsByProvider,
    pinModel,
    unpinModel,
  } = useSettingsStore()

  const providerKey = providerType
  const config = getProviderConfig(providerType)
  const baseUrl = isCustom
    ? customProvider?.baseUrl || ''
    : config?.baseURL || ''

  // API Key state
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasKey, setHasKey] = useState(false)

  // Dynamic models
  const {
    models: dynamicModels,
    source: modelsSource,
    loading: modelsLoading,
    refresh: refreshModels,
  } = useDynamicModels(providerType, providerKey)

  // Model management state
  const [addingModel, setAddingModel] = useState(false)
  const [newModelDraft, setNewModelDraft] = useState('')
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editDefaultModel, setEditDefaultModel] = useState('')

  // Add model dialog state
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const [addModelSearch, setAddModelSearch] = useState('')

  // Merge model lists: dynamic + static + custom provider models
  const allModels = useMemo<ModelInfo[]>(() => {
    if (isCustom && customProvider) {
      return customProvider.models.map((id) => ({
        id,
        name: id,
        capabilities: ['code'] as const,
        contextWindow: 128000,
      }))
    }

    const seen = new Set<string>()
    const result: ModelInfo[] = []

    // Static models first (have capability info)
    const staticModels = getModelsForProvider(providerType)
    for (const m of staticModels) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        result.push(m)
      }
    }

    // Then dynamic models (from /models API)
    for (const m of dynamicModels) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        result.push(m)
      }
    }

    return result
  }, [isCustom, customProvider, providerType, dynamicModels])

  // Pinned models for this provider (resolved to ModelInfo for display)
  const pinnedModels = useMemo(() => {
    const pinnedIds = pinnedModelsByProvider[providerType] || []
    return pinnedIds
      .map((id) => {
        const found = allModels.find((m) => m.id === id)
        return found || { id, name: id, capabilities: [] as const, contextWindow: 0 }
      })
  }, [pinnedModelsByProvider, providerType, allModels])

  // Filtered models for the "add model" dialog (all - pinned)
  const filteredModels = useMemo(() => {
    const pinnedIds = new Set(pinnedModelsByProvider[providerType] || [])
    const remaining = allModels.filter((m) => !pinnedIds.has(m.id))
    if (!addModelSearch.trim()) return remaining
    const q = addModelSearch.toLowerCase()
    return remaining.filter((m) =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    )
  }, [allModels, pinnedModelsByProvider, providerType, addModelSearch])

  // Load API Key (always check on mount; reload when expanded for freshness)
  useEffect(() => {
    loadApiKey(providerKey)
      .then((key) => {
        setApiKey(key || '')
        setHasKey(!!key)
      })
      .catch(console.error)
  }, [providerKey, isExpanded])

  // Populate edit form
  useEffect(() => {
    if (isEditing && customProvider) {
      setEditName(customProvider.name)
      setEditBaseUrl(customProvider.baseUrl)
      setEditDefaultModel(customProvider.models[0] || '')
    }
  }, [isEditing, customProvider])

  const handleSaveKey = useCallback(async () => {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      await deleteApiKey(providerKey)
      setHasKey(false)
      invalidateApiKeyCache(providerKey)
      toast.success(t('settings.toast.apiKeyCleared'))
      return
    }
    await saveApiKey(providerKey, trimmedKey)
    setHasKey(true)
    setSaved(true)
    invalidateApiKeyCache(providerKey)

    // Auto-refresh model list after saving API key so users don't need a manual refresh click.
    const url = isCustom
      ? customProvider?.baseUrl || ''
      : config?.baseURL || ''
    await refreshModels(trimmedKey, url)

    // For custom providers, sync fetched dynamic models into persisted customProvider.models.
    if (isCustom && customProvider) {
      const cached = getCachedModels(providerType, providerKey)
      if (cached && cached.length > 0) {
        for (const model of cached) {
          if (!customProvider.models.includes(model.id)) {
            addCustomProviderModel(customProvider.id, model.id)
          }
        }
      }
    }

    setTimeout(() => setSaved(false), 2000)
  }, [
    apiKey,
    providerKey,
    invalidateApiKeyCache,
    isCustom,
    customProvider,
    config,
    refreshModels,
    providerType,
    addCustomProviderModel,
    t,
  ])

  const handleRefreshModels = useCallback(async () => {
    const key = await loadApiKey(providerKey)
    if (!key) {
      toast.error(t('settings.toast.apiKeyRequired'))
      return
    }
    const url = isCustom
      ? customProvider?.baseUrl || ''
      : config?.baseURL || ''
    await refreshModels(key || undefined, url)

    // For custom providers, sync fetched models to customProvider.models
    if (isCustom && customProvider) {
      const cached = getCachedModels(providerType, providerKey)
      if (cached && cached.length > 0) {
        let added = 0
        for (const model of cached) {
          if (!customProvider.models.includes(model.id)) {
            addCustomProviderModel(customProvider.id, model.id)
            added++
          }
        }
        if (added > 0) {
          toast.success(t('settings.toast.modelsRefreshed'))
        } else {
          toast.success(t('settings.toast.modelsRefreshed'))
        }
      }
    } else if (modelsSource === 'dynamic') {
      toast.success(t('settings.toast.modelsRefreshed'))
    }
  }, [providerKey, isCustom, customProvider, config, refreshModels, modelsSource, t, providerType, addCustomProviderModel])

  const handleAddModel = useCallback(() => {
    if (!customProvider) return
    const trimmed = newModelDraft.trim()
    if (!trimmed) {
      toast.error(t('settings.toast.modelNameRequired'))
      return
    }
    addCustomProviderModel(customProvider.id, trimmed)
    setNewModelDraft('')
    setAddingModel(false)
    toast.success(t('settings.toast.modelAdded'))
  }, [customProvider, newModelDraft, addCustomProviderModel, t])

  const handleSaveCustom = useCallback(() => {
    if (!customProvider) return
    const ok = updateCustomProvider(customProvider.id, {
      name: editName,
      baseUrl: editBaseUrl,
      model: editDefaultModel,
    })
    if (!ok) {
      toast.error(t('settings.toast.invalidProviderInfo'))
      return
    }
    setIsEditing(false)
    toast.success(t('settings.toast.customProviderUpdated'))
  }, [customProvider, editName, editBaseUrl, editDefaultModel, updateCustomProvider, t])

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-tertiary" />
          )}
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background: hasKey
                ? 'var(--brand,#0d9488)'
                : 'var(--border,#2a2a2a)',
              boxShadow: hasKey ? '0 0 6px var(--brand,#0d9488)' : 'none',
            }}
          />
          <span className="text-[13px] font-semibold text-primary">{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasKey ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand,#0d9488)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--brand,#0d9488)]">
              ✓ Key
            </span>
          ) : (
            <span className="text-[10px] text-tertiary/60">—</span>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-tertiary hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border/60 px-3.5 py-3 space-y-4">
          {/* Base URL (read-only for built-in) */}
          <div>
            <p className="text-[11px] font-medium text-secondary">{t('settings.customBaseUrl.label')}</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-tertiary">
              {baseUrl || t('settings.notConfigured')}
            </p>
          </div>

          {/* API Mode indicator for custom providers (non-edit mode) */}
          {isCustom && customProvider && !isEditing && (
            <div>
              <p className="text-[11px] font-medium text-secondary">{t('settings.apiMode.label')}</p>
              <p className="mt-0.5 text-[11px] text-tertiary">
                {(customProvider.apiMode || 'chat-completions') === 'chat-completions'
                  ? 'Chat Completions (/chat/completions)'
                  : 'Responses API (/responses)'}
              </p>
            </div>
          )}

          {/* Custom Provider Edit (only for custom) */}
          {isCustom && customProvider && (
            <div>
              {isEditing ? (
                <div className="space-y-2.5 rounded-md border border-[var(--brand-border,rgba(13,148,136,0.25))] p-3" style={{ background: 'var(--brand-bg, rgba(13,148,136,0.04))' }}>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-secondary">{t('settings.modelManagement.providerName')}</label>
                    <BrandInput
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-9 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-secondary">{t('settings.customBaseUrl.label')}</label>
                    <BrandInput
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      className="h-9 font-mono text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-secondary">{t('settings.apiMode.label')}</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                          (customProvider.apiMode || 'chat-completions') === 'chat-completions'
                            ? 'text-white'
                            : 'text-tertiary border border-border hover:bg-muted'
                        }`}
                        style={
                          (customProvider.apiMode || 'chat-completions') === 'chat-completions'
                            ? { background: 'var(--brand, #0d9488)' }
                            : undefined
                        }
                        onClick={() => setCustomProviderApiMode(customProvider.id, 'chat-completions')}
                      >
                        Chat Completions
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                          customProvider.apiMode === 'responses'
                            ? 'text-white'
                            : 'text-tertiary border border-border hover:bg-muted'
                        }`}
                        style={
                          customProvider.apiMode === 'responses'
                            ? { background: 'var(--brand, #0d9488)' }
                            : undefined
                        }
                        onClick={() => setCustomProviderApiMode(customProvider.id, 'responses')}
                      >
                        Responses API
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-tertiary">{t('settings.apiMode.hint')}</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-secondary">{t('settings.modelManagement.defaultModel')}</label>
                    <BrandInput
                      value={editDefaultModel}
                      onChange={(e) => setEditDefaultModel(e.target.value)}
                      className="h-9 text-[13px]"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <BrandButton variant="outline" className="h-8 text-[12px]" onClick={() => setIsEditing(false)}>
                      {t('settings.modelManagement.cancel')}
                    </BrandButton>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md px-3 h-8 text-[12px] font-medium text-white transition-colors"
                      style={{ background: 'var(--brand, #0d9488)' }}
                      onClick={handleSaveCustom}
                    >
                      {t('settings.modelManagement.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-1 mb-2">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-tertiary hover:bg-muted hover:text-primary transition-colors"
                    onClick={() => setIsEditing(true)}
                  >
                    ✏️ {t('settings.modelManagement.editProvider')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-tertiary hover:bg-[rgba(239,68,68,0.08)] hover:text-[#ef4444] transition-colors"
                    onClick={() => setDeletingProviderId(customProvider.id)}
                  >
                    🗑 {t('settings.modelManagement.deleteProvider')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-primary">{t('settings.apiKey')}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('settings.apiKeyPlaceholder')}
                  className="flex w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-2 pr-10 text-[12px] focus-visible:border-primary-600 focus-visible:outline-none dark:border-border"
                  style={{ WebkitTextSecurity: showKey ? 'none' : 'disc' } as React.CSSProperties}
                  autoComplete="off"
                  data-form-type="other"
                  data-lpignore="true"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-primary"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <BrandButton variant="primary" className="h-9 text-[12px]" onClick={handleSaveKey}>
                {saved ? <Check className="h-4 w-4" /> : t('settings.save')}
              </BrandButton>
            </div>
          </div>

          {/* My Models (pinned) — works for both built-in and custom providers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-primary">
                {t('settings.pinnedModels.title')}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-tertiary">
                  {t('settings.pinnedModels.count', { count: pinnedModels.length })}
                </span>
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  disabled={modelsLoading}
                  className="text-tertiary hover:text-primary disabled:opacity-50"
                  title={t('settings.modelSelection.refreshModels')}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Pinned model tags */}
            {pinnedModels.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {pinnedModels.map((model) => (
                  <span
                    key={model.id}
                    className="group inline-flex items-center gap-1 rounded-full border border-[var(--brand-border,rgba(13,148,136,0.12))] bg-[var(--brand-bg,rgba(13,148,136,0.05))] px-2 py-[3px] text-[11px] text-[var(--brand-light,#14b8a6)]/80 transition-colors cursor-default"
                  >
                    {model.name}
                    <span className="text-[9px] text-tertiary">
                      {model.contextWindow >= 1000000
                        ? `${(model.contextWindow / 1000000).toFixed(0)}M`
                        : model.contextWindow >= 1000
                          ? `${(model.contextWindow / 1000).toFixed(0)}K`
                          : ''}
                    </span>
                    <button
                      type="button"
                      className="invisible text-tertiary hover:text-[#ef4444] group-hover:visible"
                      onClick={() => unpinModel(providerType, model.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-tertiary/60">
                {t('settings.pinnedModels.empty')}
              </p>
            )}

            {/* Add model button + manual input */}
            <div className="flex flex-wrap items-center gap-1.5">
              {hasKey && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border,#2a2a2a)] px-2 py-[3px] text-[11px] text-tertiary transition-colors hover:border-[var(--brand-border,rgba(13,148,136,0.25))] hover:bg-[var(--brand-bg,rgba(13,148,136,0.06))] hover:text-[var(--brand-light,#14b8a6)]"
                  onClick={() => {
                    setShowAddModelDialog(true)
                    setAddModelSearch('')
                  }}
                >
                  <Plus className="h-3 w-3" />
                  {t('settings.pinnedModels.addFromApi')}
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border,#2a2a2a)] px-2 py-[3px] text-[11px] text-tertiary transition-colors hover:border-[var(--brand-border,rgba(13,148,136,0.25))] hover:bg-[var(--brand-bg,rgba(13,148,136,0.06))] hover:text-[var(--brand-light,#14b8a6)]"
                onClick={() => {
                  setAddingModel(!addingModel)
                  setNewModelDraft('')
                }}
              >
                <Plus className="h-3 w-3" />
                {t('settings.pinnedModels.addManual')}
              </button>
            </div>

            {/* Manual model input */}
            {addingModel && (
              <div className="flex gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <BrandInput
                  value={newModelDraft}
                  onChange={(e) => setNewModelDraft(e.target.value)}
                  placeholder={t('settings.modelManagement.newModelName')}
                  className="h-8 flex-1 text-[12px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newModelDraft.trim()) {
                      pinModel(providerType, newModelDraft.trim())
                      if (isCustom && customProvider) {
                        addCustomProviderModel(customProvider.id, newModelDraft.trim())
                      }
                      setNewModelDraft('')
                      setAddingModel(false)
                    }
                    if (e.key === 'Escape') setAddingModel(false)
                  }}
                />
                <BrandButton variant="outline" className="h-8 px-2 text-[11px]" onClick={() => setAddingModel(false)}>
                  {t('settings.modelManagement.cancel')}
                </BrandButton>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2.5 h-8 text-[11px] font-medium text-white"
                  style={{ background: 'var(--brand, #0d9488)' }}
                  onClick={() => {
                    const trimmed = newModelDraft.trim()
                    if (!trimmed) return
                    pinModel(providerType, trimmed)
                    if (isCustom && customProvider) {
                      addCustomProviderModel(customProvider.id, trimmed)
                    }
                    setNewModelDraft('')
                    setAddingModel(false)
                  }}
                >
                  {t('settings.modelManagement.addModel')}
                </button>
              </div>
            )}
          </div>

          {/* Add Model from API Dialog */}
          <BrandDialog open={showAddModelDialog} onOpenChange={setShowAddModelDialog}>
            <BrandDialogContent className="!max-w-[420px] !w-[420px] !max-h-[70vh] !flex !flex-col !p-0">
              <BrandDialogHeader className="!h-auto !py-3 !px-4">
                <BrandDialogTitle className="!text-[13px]">
                  {t('settings.pinnedModels.dialogTitle')}
                </BrandDialogTitle>
                <BrandDialogClose className="text-tertiary hover:text-primary">
                  <X className="h-4 w-4" />
                </BrandDialogClose>
              </BrandDialogHeader>

              {/* Search */}
              <div className="px-4 py-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tertiary" />
                  <input
                    type="text"
                    value={addModelSearch}
                    onChange={(e) => setAddModelSearch(e.target.value)}
                    placeholder={t('settings.pinnedModels.searchPlaceholder')}
                    className="flex w-full rounded-md border border-border bg-transparent py-1.5 pl-8 pr-3 text-[12px] focus-visible:outline-none focus-visible:border-[var(--brand-border,rgba(13,148,136,0.25))]"
                    autoFocus
                  />
                </div>
              </div>

              {/* Model list */}
              <div className="flex-1 overflow-auto px-2 py-2">
                {filteredModels.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[12px] text-tertiary">
                    {allModels.length === 0
                      ? t('settings.pinnedModels.noApiModels')
                      : t('settings.pinnedModels.noMatch')}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredModels.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-muted transition-colors"
                        onClick={() => {
                          pinModel(providerType, model.id)
                          setAddModelSearch('')
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] text-primary">
                            {model.name}
                          </div>
                          <div className="truncate text-[10px] text-tertiary font-mono">
                            {model.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {model.contextWindow > 0 && (
                            <span className="text-[9px] text-tertiary">
                              {model.contextWindow >= 1000000
                                ? `${(model.contextWindow / 1000000).toFixed(0)}M`
                                : model.contextWindow >= 1000
                                  ? `${(model.contextWindow / 1000).toFixed(0)}K`
                                  : ''}
                            </span>
                          )}
                          <Plus className="h-3.5 w-3.5 text-tertiary" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer hint */}
              <BrandDialogFooter className="!min-h-0 !py-2 !px-4">
                <p className="text-[10px] text-tertiary">
                  {t('settings.pinnedModels.dialogHint', { count: filteredModels.length })}
                </p>
              </BrandDialogFooter>
            </BrandDialogContent>
          </BrandDialog>

          {/* Delete Confirm Dialog */}
          <BrandDialog open={!!deletingProviderId} onOpenChange={(open) => { if (!open) setDeletingProviderId(null) }}>
            <BrandDialogContent className="!max-w-[340px] !w-[340px] !p-0">
              <BrandDialogBody className="!pt-5">
                <BrandDialogTitle className="!text-[14px]">
                  {t('settings.modelManagement.confirmDeleteTitle')}
                </BrandDialogTitle>
                <p className="mt-2 text-[13px] leading-relaxed text-secondary">
                  {t('settings.modelManagement.confirmDeleteMessage', {
                    name: customProviders.find((p) => p.id === deletingProviderId)?.name || '',
                  })}
                </p>
              </BrandDialogBody>
              <BrandDialogFooter>
                <BrandButton variant="outline" className="h-8 text-[12px]" onClick={() => setDeletingProviderId(null)}>
                  {t('settings.modelManagement.cancel')}
                </BrandButton>
                <BrandButton variant="danger" onClick={() => {
                  removeCustomProvider(deletingProviderId!)
                  setDeletingProviderId(null)
                }}>
                  {t('settings.modelManagement.confirmDelete')}
                </BrandButton>
              </BrandDialogFooter>
            </BrandDialogContent>
          </BrandDialog>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// New Provider Form
// =============================================================================

function NewProviderForm({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { createCustomProvider } = useSettingsStore()
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')

  const handleCreate = useCallback(() => {
    const ok = createCustomProvider({ name, baseUrl, model })
    if (!ok) {
      toast.error(t('settings.toast.providerNameRequired'))
      return
    }
    toast.success(t('settings.toast.customProviderAdded'))
    onClose()
  }, [createCustomProvider, name, baseUrl, model, t, onClose])

  return (
    <div
      className="rounded-lg border p-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200"
      style={{ borderColor: 'var(--brand-border, rgba(13,148,136,0.25))', background: 'var(--brand-bg, rgba(13,148,136,0.06))' }}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--brand-light, #14b8a6)' }}>
        <Plus className="h-3.5 w-3.5" />
        {t('settings.modelManagement.newProvider')}
      </div>
      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-secondary">{t('settings.modelManagement.providerName')}</label>
          <BrandInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.modelManagement.providerNamePlaceholder')}
            className="h-9 text-[13px]"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-secondary">{t('settings.customBaseUrl.label')}</label>
          <BrandInput
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t('settings.customBaseUrl.placeholder')}
            className="h-9 font-mono text-[12px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-secondary">{t('settings.modelManagement.defaultModel')}</label>
          <BrandInput
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('settings.modelManagement.defaultModelPlaceholder')}
            className="h-9 text-[13px]"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-t pt-3 dark:border-t">
        <BrandButton variant="outline" className="h-8 text-[12px]" onClick={onClose}>
          {t('settings.modelManagement.cancel')}
        </BrandButton>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-3 h-8 text-[12px] font-medium text-white transition-colors"
          style={{ background: 'var(--brand, #0d9488)' }}
          onClick={handleCreate}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('settings.modelManagement.create')}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Main ProviderManager Component
// =============================================================================

export function ProviderManager() {
  const t = useT()
  const { customProviders } = useSettingsStore()
  const [expandedProvider, setExpandedProvider] = useState<LLMProviderType | null>(null)
  const [showNewProvider, setShowNewProvider] = useState(false)

  const groupedProviders = useMemo(() => getProvidersByCategory(), [customProviders])

  const toggleProvider = useCallback(
    (type: LLMProviderType) => {
      setExpandedProvider((prev) => (prev === type ? null : type))
    },
    [],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-primary">
          {t('settings.providerManager.title')}
        </label>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2.5 h-7 text-[11px] font-medium text-white"
          style={{ background: 'var(--brand, #0d9488)' }}
          onClick={() => setShowNewProvider(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('settings.modelManagement.add')}
        </button>
      </div>

      {/* New Provider Form */}
      {showNewProvider && (
        <NewProviderForm onClose={() => setShowNewProvider(false)} />
      )}

      {/* Provider Cards by Category */}
      {CATEGORY_ORDER.map((category) => {
        const providers = groupedProviders[category]
        if (providers.length === 0 && category !== 'custom') return null
        return (
          <div key={category} className="space-y-1">
            <div className="px-1 text-[11px] font-semibold text-tertiary uppercase tracking-wider">
              {t(`settings.categories.${category}` as const)}
            </div>
            {providers.map(({ type, meta }) => (
              <ProviderCard
                key={type}
                providerType={type}
                displayName={meta.displayName}
                website={meta.website}
                isCustom={isCustomProviderType(type)}
                customProvider={
                  isCustomProviderType(type)
                    ? customProviders.find((p) => p.id === type)
                    : undefined
                }
                isExpanded={expandedProvider === type}
                onToggle={() => toggleProvider(type)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
