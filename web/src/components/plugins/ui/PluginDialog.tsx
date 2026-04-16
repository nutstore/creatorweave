/* eslint-disable react-refresh/only-export-components */
/**
 * PluginDialog - Reusable dialog component for plugin API
 * Used when plugins call PluginAPI.notify.confirm() or request modal display
 */

import { useEffect, useRef } from 'react'
import { useT } from '@/i18n'

interface PluginDialogProps {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'confirm' | 'alert' | 'info'
  onClose: (result: boolean | null) => void
}

export function PluginDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  type = 'confirm',
  onClose,
}: PluginDialogProps) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Focus management
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstFocusable = focusable[0] as HTMLElement
      firstFocusable?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const getTitle = () => {
    if (title) return title
    switch (type) {
      case 'alert':
        return t('pluginDialog.alert')
      case 'info':
        return t('pluginDialog.info')
      default:
        return t('pluginDialog.confirm')
    }
  }

  // Default button text if not provided
  const defaultConfirmText = t('pluginDialog.confirm')
  const defaultCancelText = t('pluginDialog.cancel')

  return (
    <div
      className="fixed inset-0 z-[var(--z-plugin-modal-backdrop, 400)] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => onClose(false)}
    >
      <div
        ref={dialogRef}
        className="mx-4 w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{getTitle()}</h3>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 bg-neutral-50 px-6 py-4 dark:bg-neutral-800">
          {type === 'confirm' && (
            <button onClick={() => onClose(false)} className="btn-secondary">
              {cancelText || defaultCancelText}
            </button>
          )}
          <button onClick={() => onClose(true)} className="btn-primary">
            {confirmText || defaultConfirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// Preset dialog configs - must be functions to use t()
export function getDialogPresets(t: (key: string) => string) {
  return {
    confirm: {
      type: 'confirm' as const,
      confirmText: t('pluginDialog.confirm'),
      cancelText: t('pluginDialog.cancel'),
    },
    delete: {
      type: 'confirm' as const,
      title: t('pluginDialog.deleteConfirm'),
      confirmText: t('pluginDialog.delete'),
      cancelText: t('pluginDialog.cancel'),
    },
    alert: {
      type: 'alert' as const,
      confirmText: t('pluginDialog.gotIt'),
    },
  }
}
