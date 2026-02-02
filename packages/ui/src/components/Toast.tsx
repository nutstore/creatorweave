/**
 * Toast - Temporary notification with auto-dismiss
 *
 * Variants: 'info' | 'warning' | 'error' | 'success'
 */

import { useState, useEffect, useCallback } from 'react'
import { X, Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'

export interface ToastProps {
  variant?: 'info' | 'warning' | 'error' | 'success'
  title?: string
  message?: string
  duration?: number
  onClose?: () => void
  className?: string
}

const VARIANT_STYLES: Record<string, {
  container: ClassValue
  icon: React.ReactNode
  titleColor: ClassValue
  messageColor: ClassValue
  closeColor: ClassValue
}> = {
  info: {
    container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    icon: <Info className="w-5 h-5" />,
    titleColor: 'text-blue-800 dark:text-blue-200',
    messageColor: 'text-blue-700 dark:text-blue-300',
    closeColor: 'text-blue-600 dark:text-blue-500 hover:text-blue-800 dark:hover:text-blue-300',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    icon: <AlertTriangle className="w-5 h-5" />,
    titleColor: 'text-amber-800 dark:text-amber-200',
    messageColor: 'text-amber-700 dark:text-amber-300',
    closeColor: 'text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-300',
  },
  error: {
    container: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    icon: <AlertCircle className="w-5 h-5" />,
    titleColor: 'text-red-800 dark:text-red-200',
    messageColor: 'text-red-700 dark:text-red-300',
    closeColor: 'text-red-600 dark:text-red-500 hover:text-red-800 dark:hover:text-red-300',
  },
  success: {
    container: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    icon: <CheckCircle className="w-5 h-5" />,
    titleColor: 'text-green-800 dark:text-green-200',
    messageColor: 'text-green-700 dark:text-green-300',
    closeColor: 'text-green-600 dark:text-green-500 hover:text-green-800 dark:hover:text-green-300',
  },
}

export function Toast({
  variant = 'info',
  title,
  message,
  duration = 5000,
  onClose,
  className,
}: ToastProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  const handleClose = useCallback(() => {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, 300)
  }, [onClose])

  useEffect(() => {
    setVisible(true)
    setExiting(false)

    if (duration > 0) {
      const timer = setTimeout(handleClose, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, handleClose])

  if (!visible) return null

  const styles = VARIANT_STYLES[variant]

  return (
    <div
      className={clsx(
        'fixed top-4 left-4 max-w-sm z-50',
        'animate-in slide-in-from-top-left fade-in duration-300',
        exiting && 'animate-out fade-out duration-300',
        className
      )}
    >
      <div className={clsx(
        'rounded-lg shadow-lg flex items-start gap-3 px-4 py-3',
        styles.container
      )}>
        <div className={clsx('flex-shrink-0 mt-0.5', styles.titleColor)}>
          {styles.icon}
        </div>

        <div className="flex-1 min-w-0">
          {title && (
            <p className={clsx('text-sm font-medium', styles.titleColor)}>
              {title}
            </p>
          )}
          {message && (
            <p className={clsx('text-xs mt-1', styles.messageColor)}>
              {message}
            </p>
          )}
        </div>

        {(onClose || duration > 0) && (
          <button
            onClick={handleClose}
            className={clsx('p-1', styles.closeColor)}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Hook for showing toast notifications
 */
export interface UseToastReturn {
  showToast: (props: Omit<ToastProps, 'onClose'>) => void
  toast: Omit<ToastProps, 'onClose'> | null
  closeToast: () => void
}

export function useToast(): UseToastReturn {
  const [toast, setToast] = useState<Omit<ToastProps, 'onClose'> | null>(null)

  const showToast = useCallback((props: Omit<ToastProps, 'onClose'>) => {
    setToast(props)
  }, [])

  const handleClose = useCallback(() => {
    setToast(null)
  }, [])

  // Auto-dismiss after duration
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(handleClose, toast.duration ?? 5000)
      return () => clearTimeout(timer)
    }
  }, [toast, handleClose])

  return {
    showToast,
    toast,
    closeToast: handleClose,
  }
}

/**
 * DirectoryChangeToast - Specialized toast for directory change notifications
 */
export interface DirectoryChangeToastProps {
  hostRootName: string | null
  onOpenSearch?: () => void
}

export function DirectoryChangeToast({ hostRootName, onOpenSearch }: DirectoryChangeToastProps) {
  return (
    <Toast
      variant="warning"
      title="Host 已切换目录"
      message={`当前目录：${hostRootName || '未知'}`}
    />
  )
}
