/**
 * SettingsDialog - API key configuration and model settings.
 */

import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Check } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { saveApiKey, loadApiKey } from '@/security/api-key-store'
import { LLM_PROVIDER_CONFIGS } from '@/agent/providers/types'
import type { LLMProviderType } from '@/agent/providers/types'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  glm: '智谱 GLM',
  kimi: 'Kimi (Moonshot)',
  minimax: 'MiniMax',
  qwen: '通义千问 (Qwen)',
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
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
  } = useSettingsStore()

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load existing API key on mount
  useEffect(() => {
    if (open) {
      loadApiKey(providerType).then((key) => {
        if (key) setApiKey(key)
      })
    }
  }, [open, providerType])

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    await saveApiKey(providerType, apiKey.trim())
    setHasApiKey(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleProviderChange = (type: LLMProviderType) => {
    setProviderType(type)
    const config = LLM_PROVIDER_CONFIGS[type]
    setModelName(config.modelName)
    setApiKey('')
    loadApiKey(type).then((key) => {
      if (key) setApiKey(key)
    })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Provider Selection */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">LLM 服务商</label>
            <select
              value={providerType}
              onChange={(e) => handleProviderChange(e.target.value as LLMProviderType)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入 API Key..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveKey}
                className="flex items-center gap-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                {saved ? <Check className="h-4 w-4" /> : '保存'}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">密钥使用 AES-256 加密存储在本地浏览器中</p>
          </div>

          {/* Model Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">模型名称</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Temperature: {temperature}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Max Tokens */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              最大输出 Tokens
            </label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
              min={256}
              max={32768}
              step={256}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
