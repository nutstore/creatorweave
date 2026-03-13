/**
 * SettingsDialog - LLM settings and cross-device session sync.
 * Using @creatorweave/ui brand components.
 *
 * Features:
 * - LLM Provider & API Key settings
 * - Model configuration (temperature, max tokens)
 * - Cross-device session synchronization
 */

import { useState, useEffect, useCallback, useMemo, forwardRef } from 'react'
import {
  Settings,
  X,
  Cloud,
  Upload,
  Download,
  RefreshCw,
  Monitor,
  Lock,
  Clock,
  Trash2,
  ExternalLink,
  Check,
  Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/i18n'
import { ModelSettings } from './ModelSettings'
import { OfflineQueue } from '@/components/mobile/OfflineQueue'
import {
  BrandDialog,
  BrandDialogClose,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
} from '@creatorweave/ui'
import { BrandButton } from '@creatorweave/ui'
import { getSessionStateManager } from '@/remote/session-state-serialization'

// =============================================================================
// Types
// =============================================================================

type SettingsTab = 'llm' | 'sync' | 'offline'

interface SessionSyncMetadata {
  syncId: string
  sessionId: string
  title: string
  deviceId: string
  deviceInfo: string
  createdAt: number
  updatedAt: number
  uploadedAt: string
  expiresAt: string
  size: number
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
}

// =============================================================================
// Session Sync API Service
// =============================================================================

interface UploadResponse {
  success: boolean
  syncId: string
  expiresAt: string
  error?: { code: string; message: string }
}

interface DownloadResponse {
  success: boolean
  sessionId: string
  encryptedData: string
  metadata: {
    name: string
    deviceId: string
    browserInfo: string
    version: string
    createdAt: number
    updatedAt: number
  }
  uploadedAt: string
  expiresAt: string
  error?: { code: string; message: string }
}

interface SessionListResponse {
  success: boolean
  sessions: SessionSyncMetadata[]
  total: number
  hasMore: boolean
}

interface DeleteResponse {
  success: boolean
  message?: string
}

class SessionSyncAPI {
  private baseUrl: string

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl || 'http://localhost:3001'
  }

  async upload(
    sessionId: string,
    encryptedData: string,
    metadata: Record<string, unknown>
  ): Promise<UploadResponse> {
    const response = await fetch(`${this.baseUrl}/api/session/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, encryptedData, metadata }),
    })
    return response.json()
  }

  async download(syncId: string): Promise<DownloadResponse> {
    const response = await fetch(`${this.baseUrl}/api/session/download/${syncId}`)
    return response.json()
  }

  async list(deviceId?: string): Promise<SessionListResponse> {
    const params = new URLSearchParams()
    if (deviceId) params.append('deviceId', deviceId)
    params.append('limit', '50')
    const response = await fetch(`${this.baseUrl}/api/sessions?${params}`)
    return response.json()
  }

  async delete(syncId: string): Promise<DeleteResponse> {
    const response = await fetch(`${this.baseUrl}/api/session/${syncId}`, { method: 'DELETE' })
    return response.json()
  }
}

// =============================================================================
// Format Utilities
// =============================================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return `${minutes} 分钟前`
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours} 小时前`
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days} 天前`
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatExpiryDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extractBrowserInfo(browserInfo: string): string {
  if (browserInfo.includes('Chrome')) return 'Chrome'
  if (browserInfo.includes('Firefox')) return 'Firefox'
  if (browserInfo.includes('Safari')) return 'Safari'
  if (browserInfo.includes('Edge')) return 'Edge'
  return 'Unknown Browser'
}

// =============================================================================
// Session Sync Panel Component
// =============================================================================

interface SyncPanelProps {
  deviceId: string
  browserInfo: string
  relayUrl?: string
}

function SyncPanel({ deviceId, browserInfo, relayUrl = 'http://localhost:3001' }: SyncPanelProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'list'>('upload')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSyncMetadata[]>([])

  const api = useMemo(() => new SessionSyncAPI(relayUrl), [relayUrl])

  // Generate encryption key from device ID (simple derivation for demo)
  const getEncryptionKey = useCallback((): Uint8Array => {
    const stored = localStorage.getItem('sync-encryption-key')
    if (stored) {
      return new Uint8Array(JSON.parse(stored))
    }
    const key = crypto.getRandomValues(new Uint8Array(32))
    localStorage.setItem('sync-encryption-key', JSON.stringify(Array.from(key)))
    return key
  }, [])

  // Encrypt data using AES-GCM
  const encryptData = useCallback(
    async (data: string): Promise<string> => {
      try {
        const key = getEncryptionKey()
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const encodedData = new TextEncoder().encode(data)

        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, [
          'encrypt',
        ])

        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          encodedData
        )

        // Combine IV and encrypted data, then convert to base64
        const combined = new Uint8Array(iv.length + encrypted.byteLength)
        combined.set(iv)
        combined.set(new Uint8Array(encrypted), iv.length)

        return btoa(String.fromCharCode(...combined))
      } catch (err) {
        console.error('[SyncPanel] Encryption failed:', err)
        throw new Error('加密失败')
      }
    },
    [getEncryptionKey]
  )

  // Decrypt data using AES-GCM
  const decryptData = useCallback(
    async (encryptedData: string): Promise<string> => {
      try {
        const key = getEncryptionKey()
        const combined = new Uint8Array(
          atob(encryptedData)
            .split('')
            .map((c) => c.charCodeAt(0))
        )

        const iv = combined.slice(0, 12)
        const data = combined.slice(12)

        const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, [
          'decrypt',
        ])

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data)

        return new TextDecoder().decode(decrypted)
      } catch (err) {
        console.error('[SyncPanel] Decryption failed:', err)
        throw new Error('解密失败，数据可能已损坏')
      }
    },
    [getEncryptionKey]
  )

  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await api.list(deviceId)
      setSessions(result.sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }, [api, deviceId])

  // Load sessions when list tab is active
  useEffect(() => {
    if (activeTab === 'list') {
      loadSessions()
    }
  }, [activeTab, loadSessions])

  // Upload session callback
  const handleUploadSession = useCallback(async (): Promise<{
    encryptedData: string
    metadata: Record<string, unknown>
  }> => {
    const manager = getSessionStateManager()
    const state = await manager.loadFromStorage()

    if (!state) {
      throw new Error('没有可同步的会话数据')
    }

    const sessionData = manager.serialize(state)
    const encryptedData = await encryptData(sessionData)

    const metadata: Record<string, unknown> = {
      id: state.metadata.id,
      name: state.metadata.name,
      deviceId: state.metadata.deviceId,
      browserInfo: state.metadata.browserInfo,
      version: state.metadata.version,
      createdAt: state.metadata.createdAt,
      updatedAt: Date.now(),
      conversationsCount: state.conversations.length,
    }

    return { encryptedData, metadata }
  }, [encryptData])

  // Download session callback
  const handleDownloadSession = useCallback(
    async (syncId: string): Promise<void> => {
      const result = await api.download(syncId)

      if (!result.success) {
        throw new Error(result.error?.message || '下载失败')
      }

      const decryptedData = await decryptData(result.encryptedData)
      const manager = getSessionStateManager()
      const state = manager.deserialize(decryptedData)

      if (!state) {
        throw new Error('会话数据解析失败')
      }

      await manager.saveToStorage(state)
      toast.success('会话已恢复，请刷新页面查看')

      // Trigger page reload after short delay
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    },
    [api, decryptData]
  )

  const handleUpload = async () => {
    setIsUploading(true)
    setUploadProgress(0)
    setError(null)
    setSuccess(null)

    try {
      setUploadProgress(20)
      const { encryptedData, metadata } = await handleUploadSession()

      setUploadProgress(50)
      const result = await api.upload(metadata.id as string, encryptedData, metadata)

      if (!result.success) {
        throw new Error(result.error?.message || 'Upload failed')
      }

      setUploadProgress(100)
      setSuccess(`会话已同步！Sync ID: ${result.syncId}`)

      if (activeTab === 'list') {
        loadSessions()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败，请重试')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDownload = async (syncId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      await handleDownloadSession(syncId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (syncId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!confirm('确定要删除此同步会话吗？此操作不可撤销。')) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await api.delete(syncId)
      if (result.success) {
        setSuccess('会话已删除')
        loadSessions()
      } else {
        throw new Error('Delete failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'upload'
              ? 'border-b-2 border-primary-500 text-primary-600'
              : 'text-tertiary hover:text-secondary'
          }`}
        >
          <Upload className="mr-2 inline h-4 w-4" />
          上传
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'list'
              ? 'border-b-2 border-primary-500 text-primary-600'
              : 'text-tertiary hover:text-secondary'
          }`}
        >
          <Download className="mr-2 inline h-4 w-4" />
          下载/管理
        </button>
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          {/* Security Notice */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">端到端加密</p>
              <p className="mt-1 text-xs">
                您的会话数据在上传前会被加密。服务器仅存储加密数据，无法访问您的原始内容。
              </p>
            </div>
          </div>

          {/* Device Info */}
          <div className="rounded-lg border border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-tertiary" />
                <span className="text-sm font-medium text-secondary">当前设备</span>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-secondary">
                {extractBrowserInfo(browserInfo)}
              </span>
            </div>
            <p className="mt-1 text-xs text-tertiary">设备 ID: {deviceId}</p>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-center text-sm text-tertiary">
                {uploadProgress < 50 ? '正在准备数据...' : '正在上传到云端...'}
              </p>
            </div>
          )}

          {/* Upload Button */}
          {!isUploading && (
            <BrandButton variant="default" onClick={handleUpload} className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              同步当前会话
            </BrandButton>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-800">{success}</span>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="ml-auto text-xs text-green-600 hover:underline"
              >
                查看全部
              </button>
            </div>
          )}
        </div>
      )}

      {/* List Tab */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Refresh Button */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-secondary">已同步的会话</h4>
            <BrandButton
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={loadSessions}
              disabled={isLoading}
            >
              <RefreshCw className={`mr-2 h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </BrandButton>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <span className="text-sm text-red-800">{error}</span>
              <button type="button" onClick={clearMessages} className="ml-auto">
                <X className="h-4 w-4 text-red-600" />
              </button>
            </div>
          )}

          {/* Session List */}
          <div className="custom-scrollbar max-h-64 overflow-y-auto">
            {isLoading && sessions.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-tertiary" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-8 text-center">
                <Cloud className="mx-auto h-8 w-8 text-tertiary" />
                <p className="mt-2 text-sm text-tertiary">暂无同步的会话</p>
                <p className="mt-1 text-xs text-tertiary">上传会话后可以在这里管理</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {sessions.map((session) => (
                  <li
                    key={session.syncId}
                    className="hover:border-primary-200 group flex cursor-pointer items-center gap-3 rounded-lg border border p-3 transition-colors hover:bg-primary-50/50"
                    onClick={() => handleDownload(session.syncId)}
                  >
                    {/* Session Icon */}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                      <Monitor className="h-5 w-5 text-primary-600" />
                    </div>

                    {/* Session Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-secondary">
                          {session.title}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-tertiary">
                          {formatSize(session.size)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-tertiary">
                        <span>{extractBrowserInfo(session.deviceInfo)}</span>
                        <span>-</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(session.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-tertiary">
                        过期时间: {formatExpiryDate(session.expiresAt)}
                      </p>
                    </div>

                    {/* Delete Action */}
                    <button
                      type="button"
                      onClick={(e) => handleDelete(session.syncId, e)}
                      disabled={isLoading}
                      className="rounded p-1.5 text-red-500 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                      title="删除此会话"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Server Info */}
          <div className="flex items-center justify-between rounded-lg border border bg-muted p-2 text-xs text-tertiary">
            <span>服务器: {relayUrl}</span>
            <a
              href={`${relayUrl}/health`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary-600"
            >
              状态
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Settings Dialog Content
// =============================================================================

const SettingsDialogContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BrandDialogContent> & { open?: boolean }
>(({ className: _className, open, ...props }, ref) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm')
  const t = useT()

  // Mock device info for sync tab
  const deviceId = useMemo(() => {
    const stored = localStorage.getItem('deviceId')
    if (stored) return stored
    const newId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('deviceId', newId)
    return newId
  }, [])

  const browserInfo = useMemo(() => navigator.userAgent, [])

  useEffect(() => {
    if (!open) {
      setActiveTab('llm')
    }
  }, [open])

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'llm', label: t('settings.title') || 'LLM 设置', icon: <Settings className="h-4 w-4" /> },
    { id: 'sync', label: '跨设备同步', icon: <Cloud className="h-4 w-4" /> },
    { id: 'offline', label: '离线任务', icon: <Wifi className="h-4 w-4" /> },
  ]

  return (
    <BrandDialogContent
      ref={ref}
      className="flex h-[min(88vh,760px)] w-[min(94vw,760px)] max-w-none flex-col overflow-hidden p-0"
      showOverlay={true}
      {...props}
    >
      <BrandDialogHeader>
        <div className="flex items-center gap-2.5">
          <Settings className="h-[18px] w-[18px] text-primary-600" />
          <BrandDialogTitle>{t('settings.title')}</BrandDialogTitle>
        </div>
        <BrandDialogClose asChild>
          <button
            type="button"
            aria-label="关闭设置"
            className="text-tertiary transition-colors hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </BrandDialogClose>
      </BrandDialogHeader>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sidebar tabs */}
        <div className="border-subtle shrink-0 border-b p-2 md:w-44 md:border-b-0 md:border-r md:p-2">
          <nav className="flex gap-1 overflow-x-auto md:block md:space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors md:w-full ${
                  activeTab === tab.id
                    ? 'dark:bg-primary-900/30 dark:text-primary-300 bg-primary-50 text-primary-700'
                    : 'text-secondary hover:bg-muted dark:text-tertiary dark:hover:bg-muted'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {/* LLM Settings Tab */}
          {activeTab === 'llm' && (
            <BrandDialogBody className="p-0">
              <ModelSettings open={open} />
            </BrandDialogBody>
          )}

          {/* Sync Tab */}
          {activeTab === 'sync' && (
            <div className="py-1">
              <SyncPanel deviceId={deviceId} browserInfo={browserInfo} />
            </div>
          )}

          {/* Offline Queue Tab */}
          {activeTab === 'offline' && (
            <div className="py-1">
              <OfflineQueue />
            </div>
          )}
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
    <BrandDialog open={open} onOpenChange={onOpenChange} modal={true}>
      <SettingsDialogContent ref={ref as React.Ref<HTMLDivElement>} open={open} {...props} />
    </BrandDialog>
  )
})
SettingsDialog.displayName = 'SettingsDialog'

export { SettingsDialog, SettingsDialogContent }
