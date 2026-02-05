/**
 * Storage Initialization Loading Screen
 *
 * A polished loading state shown while the application initializes.
 * Uses brand components for consistent styling.
 */

import {
  BrandCard,
  BrandCardHeader,
  BrandCardTitle,
  BrandCardDescription,
  BrandProgress,
} from '@browser-fs-analyzer/ui'
import { AlertTriangle, Database, RefreshCw } from 'lucide-react'
import { useT } from '@/i18n'

export interface StorageLoadingProps {
  /** Optional progress percentage (0-100) */
  progress?: number
  /** Whether to show indeterminate loading animation */
  isLoading?: boolean
  /** Error message to display */
  error?: string | null
  /** Whether the error can be fixed by resetting the database */
  canReset?: boolean
  /** Callback when user clicks the reset button */
  onReset?: () => void
}

/**
 * Loading screen shown during application initialization
 */
export function StorageLoading({
  progress,
  isLoading = true,
  error,
  canReset = false,
  onReset,
}: StorageLoadingProps) {
  const t = useT()

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
        <div className="w-full max-w-md">
          <BrandCard
            variant="info"
            className="border-danger-500 bg-red-50 text-center dark:bg-red-950/20"
          >
            <BrandCardHeader className="items-center justify-center pb-6">
              {/* Error Icon */}
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>

              <BrandCardTitle className="text-xl text-red-900 dark:text-red-100">
                数据库初始化失败
              </BrandCardTitle>
              <BrandCardDescription className="mt-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </BrandCardDescription>
            </BrandCardHeader>

            <div className="space-y-4 px-6 pb-6">
              {canReset && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    这可能由于数据库损坏或迁移失败导致。重置数据库将清除所有数据并重新创建。
                  </p>
                  <button
                    className="bg-danger-600 hover:bg-danger-700 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
                    onClick={onReset}
                  >
                    <Database className="h-4 w-4" />
                    重置数据库
                  </button>
                </>
              )}

              <div className="pt-2">
                <button
                  className="hover:bg-hover flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-secondary transition-colors"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="h-4 w-4" />
                  重新加载页面
                </button>
              </div>
            </div>
          </BrandCard>

          <p className="mt-4 text-center text-xs text-gray-400">{t('app.productName')}</p>
        </div>
      </div>
    )
  }

  // Normal loading state
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <BrandCard variant="info" className="text-center">
          <BrandCardHeader className="items-center justify-center pb-6">
            {/* Logo */}
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
              <svg
                className="h-6 w-6 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                />
              </svg>
            </div>

            <BrandCardTitle className="text-xl">{t('app.productName')}</BrandCardTitle>
            <BrandCardDescription className="mt-1">{t('app.initializing')}</BrandCardDescription>
          </BrandCardHeader>

          <div className="space-y-4 px-6 pb-6">
            {/* Progress bar */}
            {progress !== undefined ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">{t('app.loadProgress')}</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <BrandProgress value={progress} size="md" rounded="md" />
              </div>
            ) : isLoading ? (
              <div className="space-y-2">
                <div className="h-6 text-sm text-secondary">{t('app.preparing')}</div>
                <BrandProgress size="md" rounded="md" />
              </div>
            ) : null}
          </div>
        </BrandCard>

        <p className="mt-4 text-center text-xs text-gray-400">{t('app.productName')}</p>
      </div>
    </div>
  )
}

/**
 * Compact inline loading indicator
 */
export function StorageLoadingInline({ message }: { message?: string }) {
  const t = useT()
  return (
    <div className="flex items-center gap-3 text-secondary">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      <span className="text-sm">{message || t('common.loading')}</span>
    </div>
  )
}
