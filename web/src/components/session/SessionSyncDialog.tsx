/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SessionSyncDialog - Cross-device session synchronization UI
 *
 * Features:
 * - Upload current session to relay-server
 * - Download session from relay-server
 * - List all synced sessions
 * - Delete synced sessions
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Cloud,
  CloudOff,
  Lock,
  Clock,
  Monitor,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle,
  X as XIcon,
} from 'lucide-react'
import { useT } from '@/i18n'

// =============================================================================
// Types
// =============================================================================

export interface SessionSyncMetadata {
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

export interface SessionSyncDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void
  /** Current device ID */
  deviceId: string
  /** Browser info string */
  browserInfo: string
  /** Upload session callback */
  onUploadSession: () => Promise<{ encryptedData: string; metadata: any }>
  /** Download session callback */
  onDownloadSession: (syncId: string) => Promise<void>
  /** Relay server URL */
  relayUrl?: string
}

// =============================================================================
// API Service
// =============================================================================

interface UploadResponse {
  success: boolean
  syncId: string
  expiresAt: string
  error?: {
    code: string
    message: string
  }
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
    const response = await fetch(`${this.baseUrl}/api/session/${syncId}`, {
      method: 'DELETE',
    })
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

type TranslationFunction = (key: string, params?: Record<string, string | number>) => string

function formatDate(timestamp: number, t: TranslationFunction): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return t('sidebar.syncPanel.minutesAgo', { count: minutes })
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return t('sidebar.syncPanel.hoursAgo', { count: hours })
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return t('sidebar.syncPanel.daysAgo', { count: days })
  }

  // Default format
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatExpiryDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extractBrowserInfo(browserInfo: string): string {
  // Simple extraction of browser name from user agent
  if (browserInfo.includes('Chrome')) return 'Chrome'
  if (browserInfo.includes('Firefox')) return 'Firefox'
  if (browserInfo.includes('Safari')) return 'Safari'
  if (browserInfo.includes('Edge')) return 'Edge'
  return 'Unknown Browser'
}

// =============================================================================
// Dialog Component
// =============================================================================

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onOpenChange])

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onOpenChange(false)
    }
  }

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  )
}

interface DialogContentProps {
  className?: string
  children: React.ReactNode
}

export function DialogContent({ className = '', children }: DialogContentProps) {
  return (
    <div
      className={`relative w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl dark:bg-card ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

interface DialogHeaderProps {
  children: React.ReactNode
}

function DialogHeader({ children }: DialogHeaderProps) {
  return <div className="border-b border px-6 py-4">{children}</div>
}

interface DialogTitleProps {
  children: React.ReactNode
  className?: string
}

function DialogTitle({ children, className = '' }: DialogTitleProps) {
  return <h2 className={`text-lg font-semibold text-primary ${className}`}>{children}</h2>
}

interface DialogDescriptionProps {
  children: React.ReactNode
  className?: string
}

function DialogDescription({ children, className = '' }: DialogDescriptionProps) {
  return <p className={`mt-1 text-sm text-tertiary ${className}`}>{children}</p>
}

interface DialogFooterProps {
  children: React.ReactNode
  className?: string
}

function DialogFooter({ children, className = '' }: DialogFooterProps) {
  return (
    <div className={`flex justify-end gap-3 border-t border px-6 py-4 ${className}`}>
      {children}
    </div>
  )
}

// =============================================================================
// Session Sync Dialog Component
// =============================================================================

export const SessionSyncDialog: React.FC<SessionSyncDialogProps> = ({
  open,
  onOpenChange,
  deviceId,
  browserInfo,
  onUploadSession,
  onDownloadSession,
  relayUrl = 'http://localhost:3001',
}) => {
  const t = useT()
  const [activeTab, setActiveTab] = useState<'upload' | 'list'>('upload')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSyncMetadata[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  const api = useMemo(() => new SessionSyncAPI(relayUrl), [relayUrl])

  // Focus management
  useEffect(() => {
    if (open && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstFocusable = focusable[0] as HTMLElement
      firstFocusable?.focus()
    }
  }, [open])

  // Load sessions on tab switch
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

  useEffect(() => {
    if (open && activeTab === 'list') {
      loadSessions()
    }
  }, [open, activeTab, loadSessions])

  // Handle upload
  const handleUpload = async () => {
    setIsUploading(true)
    setUploadProgress(0)
    setError(null)
    setSuccess(null)

    try {
      // Phase 1: Prepare session data
      setUploadProgress(20)
      const { encryptedData, metadata } = await onUploadSession()

      // Phase 2: Upload to server
      setUploadProgress(50)
      const result = await api.upload(metadata.id, encryptedData, metadata)

      if (!result.success) {
        throw new Error(result.error?.message || 'Upload failed')
      }

      // Phase 3: Complete
      setUploadProgress(100)
      setSuccess(t('sidebar.syncPanel.sessionSynced', { syncId: result.syncId }))

      // Refresh list if visible
      if (activeTab === 'list') {
        loadSessions()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.syncPanel.uploadFailed'))
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // Handle download
  const handleDownload = async (syncId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      await onDownloadSession(syncId)
      setSuccess(t('sidebar.syncPanel.sessionDownloadSuccess'))
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.syncPanel.downloadFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // Handle delete
  const handleDelete = async (syncId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!confirm(t('sidebar.syncPanel.confirmDelete'))) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await api.delete(syncId)
      if (result.success) {
        setSuccess(t('sidebar.syncPanel.sessionDeleted'))
        loadSessions()
      } else {
        throw new Error('Delete failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.syncPanel.deleteFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // Clear messages
  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {/* Header */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {t('sidebar.syncPanel.crossDeviceSync')}
          </DialogTitle>
          <DialogDescription>
            {t('sidebar.syncPanel.syncDescription')}
          </DialogDescription>
        </DialogHeader>

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
            {t('sidebar.syncPanel.upload')}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('list')
              loadSessions()
            }}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'list'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-tertiary hover:text-secondary'
            }`}
          >
            <Download className="mr-2 inline h-4 w-4" />
            {t('sidebar.syncPanel.downloadManage')}
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 px-6 pb-4">
          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              {/* Security Notice */}
              <div className="flex items-start gap-3 rounded-lg border border-warning bg-warning-bg p-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="text-sm text-warning">
                  <p className="font-medium">{t('sidebar.syncPanel.endToEndEncryption')}</p>
                  <p className="mt-1 text-xs">
                    {t('sidebar.syncPanel.encryptionNotice')}
                  </p>
                </div>
              </div>

              {/* Device Info */}
              <div className="rounded-lg border border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-tertiary" />
                    <span className="text-sm font-medium text-secondary">{t('sidebar.syncPanel.currentDevice')}</span>
                  </div>
                  <Badge variant="neutral">{extractBrowserInfo(browserInfo)}</Badge>
                </div>
                <p className="mt-1 text-xs text-tertiary">{t('sidebar.syncPanel.deviceId')}: {deviceId}</p>
              </div>

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-center text-sm text-tertiary">
                    {uploadProgress < 50 ? t('sidebar.syncPanel.preparingData') : t('sidebar.syncPanel.uploadingToCloud')}
                  </p>
                </div>
              )}

              {/* Upload Button */}
              {!isUploading && (
                <Button onClick={handleUpload} className="w-full">
                  <Upload className="mr-2 h-4 w-4" />
                  {t('sidebar.syncPanel.syncCurrentSession')}
                </Button>
              )}

              {/* Success Message */}
              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-success bg-success-bg p-3">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm text-success-text">{success}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className="ml-auto text-xs text-success hover:underline"
                  >
                    {t('sidebar.syncPanel.viewAll')}
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
                <h4 className="text-sm font-medium text-secondary">{t('sidebar.syncPanel.syncedSessions')}</h4>
                <Button variant="outline" size="sm" onClick={loadSessions} disabled={isLoading}>
                  <RefreshCw className={`mr-2 h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                  {t('sidebar.syncPanel.refresh')}
                </Button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-800">{error}</span>
                  <button type="button" onClick={clearMessages} className="ml-auto">
                    <XIcon className="h-4 w-4 text-red-600" />
                  </button>
                </div>
              )}

              {/* Session List */}
              <div className="custom-scrollbar max-h-80 overflow-y-auto">
                {isLoading && sessions.length === 0 ? (
                  <div className="flex items-center justify-center py-8" role="status">
                    <Loader2 className="h-6 w-6 animate-spin text-tertiary" aria-hidden="true" />
                    <span className="sr-only">{t('sidebar.syncPanel.loading')}</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-8 text-center">
                    <CloudOff className="mx-auto h-8 w-8 text-tertiary" />
                    <p className="mt-2 text-sm text-tertiary">{t('sidebar.syncPanel.noSyncedSessions')}</p>
                    <p className="mt-1 text-xs text-tertiary">{t('sidebar.syncPanel.manageAfterUpload')}</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {sessions.map((session) => (
                      <li
                        key={session.syncId}
                        className="hover:border-primary-200 group flex items-center gap-3 rounded-lg border border p-3 transition-colors hover:bg-primary-50/50"
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
                            <Badge variant="outline">{formatSize(session.size)}</Badge>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-tertiary">
                            <span>{extractBrowserInfo(session.deviceInfo)}</span>
                            <span>-</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(session.updatedAt, t)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-tertiary">
                            {t('sidebar.syncPanel.expiresAt')}: {formatExpiryDate(session.expiresAt)}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(session.syncId)}
                            disabled={isLoading}
                            title={t('sidebar.syncPanel.downloadSession')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDelete(session.syncId, e)}
                            disabled={isLoading}
                            title={t('sidebar.syncPanel.deleteSession')}
                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Server Info */}
              <div className="flex items-center justify-between rounded-lg border border bg-muted p-2 text-xs text-tertiary">
                <span>{t('sidebar.syncPanel.server')}: {relayUrl}</span>
                <a
                  href={`${relayUrl}/health`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-primary-600"
                >
                  {t('sidebar.syncPanel.status')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('sidebar.syncPanel.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SessionSyncDialog
