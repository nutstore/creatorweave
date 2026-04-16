/**
 * ConflictResolutionDialog Component
 *
 * Modal dialog for resolving file conflicts during sync.
 * Users can choose which version to keep or manually merge.
 *
 * Part of Phase 4: Native Filesystem Sync - Story 4.2
 */

import React, { useState, useCallback } from 'react'
import { readFileFromNativeFS, readFileFromOPFS, isImageFile } from '@/opfs'
import { type ConflictDetail } from '@/opfs/types/opfs-types'
import { getActiveConversation } from '@/store/conversation-context.store'
import { useT } from '@/i18n'

export interface ConflictResolutionDialogProps {
  /** Conflict to resolve */
  conflict: ConflictDetail
  /** Callback when resolution is chosen */
  onResolve: (resolution: 'opfs' | 'native' | 'skip') => void
  /** Callback when dialog is cancelled */
  onCancel: () => void
}

/**
 * Resolution option with description
 */
interface ResolutionOption {
  value: 'opfs' | 'native' | 'skip'
  label: string
  description: string
  icon: React.ReactNode
  color: string
}

/**
 * Get resolution options based on conflict state
 */
function getResolutionOptions(conflict: ConflictDetail, t: (key: string) => string): ResolutionOption[] {
  const options: ResolutionOption[] = []

  // OPFS version (our changes)
  options.push({
    value: 'opfs',
    label: t('settings.syncPanel.conflictResolution.keepOpfsVersion'),
    description: conflict.nativeVersion.exists
      ? t('settings.syncPanel.conflictResolution.keepOpfsDescriptionModified')
      : t('settings.syncPanel.conflictResolution.keepOpfsDescriptionNew'),
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 8h14M5 8a2 2 0 01-2-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
        />
      </svg>
    ),
    color: 'blue',
  })

  // Native version (current filesystem)
  if (conflict.nativeVersion.exists) {
    options.push({
      value: 'native',
      label: t('settings.syncPanel.conflictResolution.keepNativeVersion'),
      description: t('settings.syncPanel.conflictResolution.keepNativeDescription'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      ),
      color: 'green',
    })
  }

  // Skip this file
  options.push({
    value: 'skip',
    label: t('settings.syncPanel.conflictResolution.skipThisFile'),
    description: t('settings.syncPanel.conflictResolution.skipThisFileDescription'),
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 5l7 7-7 7M5 5l14 14"
        />
      </svg>
    ),
    color: 'gray',
  })

  return options
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PREVIEW_CHAR_LIMIT = 12000

function formatPreviewContent(
  _source: 'OPFS' | 'native',
  path: string,
  content: string | null,
  unavailableMessage: string,
  binaryMessage: string,
  noReadableMessage: string,
  emptyMessage: string,
  truncatedMessage: string
): string {
  if (unavailableMessage) return unavailableMessage
  if (content === null) {
    if (isImageFile(path)) return binaryMessage
    return noReadableMessage
  }
  if (content.length === 0) return emptyMessage
  if (content.length <= PREVIEW_CHAR_LIMIT) return content
  const truncated = content.slice(0, PREVIEW_CHAR_LIMIT)
  return `${truncated}\n\n${truncatedMessage.replace('{charCount}', String(content.length - PREVIEW_CHAR_LIMIT))}`
}

export const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  conflict,
  onResolve,
  onCancel,
}) => {
  const t = useT()
  const [selectedOption, setSelectedOption] = useState<'opfs' | 'native' | 'skip' | null>(null)
  const [previewContent, setPreviewContent] = useState<{
    opfs: string | null
    native: string | null
  }>({ opfs: null, native: null })
  const [loading, setLoading] = useState(false)

  const cr = {
    title: t('settings.syncPanel.conflictResolution.title'),
    conflictDescription: (path: string) => t('settings.syncPanel.conflictResolution.conflictDescription', { path }),
    opfsVersionTime: t('settings.syncPanel.conflictResolution.opfsVersionTime'),
    nativeVersionTime: t('settings.syncPanel.conflictResolution.nativeVersionTime'),
    selectResolution: t('settings.syncPanel.conflictResolution.selectResolution'),
    opfsVersion: t('settings.syncPanel.conflictResolution.opfsVersion'),
    nativeVersion: t('settings.syncPanel.conflictResolution.nativeVersion'),
    noContent: t('settings.syncPanel.conflictResolution.noContent'),
    fileNotExist: t('settings.syncPanel.conflictResolution.fileNotExist'),
    binaryFilePreview: (source: string) => t('settings.syncPanel.conflictResolution.binaryFilePreview', { source }),
    noReadableContent: (source: string) => t('settings.syncPanel.conflictResolution.noReadableContent', { source }),
    emptyFile: (source: string) => t('settings.syncPanel.conflictResolution.emptyFile', { source }),
    contentTruncated: t('settings.syncPanel.conflictResolution.contentTruncated'),
    whyConflict: t('settings.syncPanel.conflictResolution.whyConflict'),
    conflictExplanation: t('settings.syncPanel.conflictResolution.conflictExplanation'),
    ifKeepNativeExists: t('settings.syncPanel.conflictResolution.ifKeepNativeExists'),
    ifKeepNativeNotExists: t('settings.syncPanel.conflictResolution.ifKeepNativeNotExists'),
    skipThisConflict: t('settings.syncPanel.conflictResolution.skipThisConflict'),
    applySelection: t('settings.syncPanel.conflictResolution.applySelection'),
    nativeNotConnected: t('settings.syncPanel.conflictResolution.nativeNotConnected'),
  }

  const options = getResolutionOptions(conflict, t)

  /**
   * Load file previews when dialog opens
   */
  const loadPreviews = useCallback(async () => {
    setLoading(true)
    try {
      const activeConversation = await getActiveConversation()
      const nativeDir = await activeConversation?.conversation.getNativeDirectoryHandle()
      const [opfsContent, nativeContent] = await Promise.all([
        readFileFromOPFS(conflict.opfsVersion.workspaceId, conflict.path),
        conflict.nativeVersion.exists && nativeDir
          ? readFileFromNativeFS(nativeDir, conflict.path)
          : Promise.resolve(null),
      ])

      const binaryMessage = t('settings.syncPanel.conflictResolution.binaryFilePreview', { source: 'OPFS' })
      const noReadableMessage = t('settings.syncPanel.conflictResolution.noReadableContent', { source: 'OPFS' })
      const emptyMessage = t('settings.syncPanel.conflictResolution.emptyFile', { source: 'OPFS' })
      const truncatedMessage = t('settings.syncPanel.conflictResolution.contentTruncated')
      const nativeNotConnected = t('settings.syncPanel.conflictResolution.nativeNotConnected')
      const nativeVersionLabel = t('settings.syncPanel.conflictResolution.nativeVersion')

      setPreviewContent({
        opfs: formatPreviewContent(
          'OPFS',
          conflict.path,
          opfsContent,
          '',
          binaryMessage,
          noReadableMessage,
          emptyMessage,
          truncatedMessage
        ),
        native: conflict.nativeVersion.exists
          ? formatPreviewContent(
              'native',
              conflict.path,
              nativeContent,
              nativeDir ? '' : nativeNotConnected,
              t('settings.syncPanel.conflictResolution.binaryFilePreview', { source: nativeVersionLabel }),
              t('settings.syncPanel.conflictResolution.noReadableContent', { source: nativeVersionLabel }),
              t('settings.syncPanel.conflictResolution.emptyFile', { source: nativeVersionLabel }),
              truncatedMessage
            )
          : null,
      })
    } catch (err) {
      console.error('Failed to load previews:', err)
    } finally {
      setLoading(false)
    }
  }, [conflict, t])

  // Load previews on mount
  React.useEffect(() => {
    loadPreviews()
  }, [loadPreviews])

  /**
   * Handle resolution selection
   */
  const handleResolve = useCallback(() => {
    if (selectedOption) {
      onResolve(selectedOption)
    }
  }, [selectedOption, onResolve])

  /**
   * Handle skip all
   */
  const handleSkipAll = useCallback(() => {
    onResolve('skip')
  }, [onResolve])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card dark:bg-card rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border dark:border-border bg-muted dark:bg-muted">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning-bg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-warning"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 3h.01M12 9a3 3 0 01-3 3v5a3 3 0 013 3 3 3 0 013-3v-5m3 6h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary dark:text-primary-foreground">{cr.title}</h2>
                <p className="text-sm text-tertiary dark:text-muted mt-0.5">
                  {cr.conflictDescription(conflict.path)}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-tertiary hover:text-neutral-600 dark:text-muted dark:hover:text-muted transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Conflict metadata */}
          <div className="mt-4 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-tertiary dark:text-muted">{cr.opfsVersionTime}</span>
              <span className="font-medium text-primary dark:text-primary-foreground">
                {formatTimestamp(conflict.opfsVersion.mtime)}
              </span>
            </div>
            {conflict.nativeVersion.mtime && (
              <div className="flex items-center gap-2">
                <span className="text-tertiary dark:text-muted">{cr.nativeVersionTime}</span>
                <span className="font-medium text-primary dark:text-primary-foreground">
                  {formatTimestamp(conflict.nativeVersion.mtime)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Resolution Options */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-sm font-medium text-secondary dark:text-muted mb-3">{cr.selectResolution}</h3>
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedOption(option.value)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedOption === option.value
                      ? `border-${option.color}-500 bg-${option.color}-50`
                      : 'border hover:border-neutral-300 dark:border-border dark:hover:border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-lg bg-${option.color}-100 flex items-center justify-center text-${option.color}-600`}
                    >
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-medium ${
                          selectedOption === option.value
                            ? `text-${option.color}-900`
                            : 'text-primary dark:text-primary-foreground'
                        }`}
                      >
                        {option.label}
                      </h4>
                      <p
                        className={`text-xs mt-1 ${
                          selectedOption === option.value
                            ? `text-${option.color}-700`
                            : 'text-tertiary dark:text-muted'
                        }`}
                      >
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Preview Panels */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* OPFS Version Preview */}
              <div className="flex flex-col bg-muted dark:bg-muted rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border dark:border-border bg-primary-50 dark:bg-primary-900/30">
                  <h4 className="text-sm font-medium text-primary-700">
                    {cr.opfsVersion}
                  </h4>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-card dark:bg-card">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : previewContent.opfs ? (
                    <pre className="text-xs text-secondary dark:text-muted whitespace-pre-wrap break-all font-mono">
                      {previewContent.opfs}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-tertiary dark:text-muted text-sm">
                      {cr.noContent}
                    </div>
                  )}
                </div>
              </div>

              {/* Native Version Preview */}
              <div className="flex flex-col bg-muted dark:bg-muted rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border dark:border-border bg-success-bg dark:bg-success-950/30">
                  <h4 className="text-sm font-medium text-green-900">
                    {cr.nativeVersion}
                  </h4>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-card dark:bg-card">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : previewContent.native ? (
                    <pre className="text-xs text-secondary dark:text-muted whitespace-pre-wrap break-all font-mono">
                      {previewContent.native}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-tertiary dark:text-muted text-sm">
                      {conflict.nativeVersion.exists ? cr.noContent : cr.fileNotExist}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Conflict explanation */}
          <div className="bg-warning-bg dark:bg-warning-950/20 border border-warning dark:border-warning-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-warning flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-warning dark:text-warning-200 mb-1">
                  {cr.whyConflict}
                </h4>
                <p className="text-xs text-warning dark:text-warning-300 leading-relaxed">
                  {cr.conflictExplanation}
                  {conflict.nativeVersion.exists
                    ? cr.ifKeepNativeExists
                    : cr.ifKeepNativeNotExists}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border dark:border-border bg-muted dark:bg-muted">
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkipAll}
              className="text-sm text-neutral-600 hover:text-primary dark:text-muted dark:hover:text-muted transition-colors"
            >
              {cr.skipThisConflict}
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-secondary bg-card border dark:border-border dark:bg-card dark:text-muted dark:hover:bg-muted rounded-lg hover:bg-muted transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleResolve}
                disabled={!selectedOption}
                className="px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7m0 0l-7-7 7"
                  />
                </svg>
                {cr.applySelection}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
