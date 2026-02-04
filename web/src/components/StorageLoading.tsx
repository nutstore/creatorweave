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
import { useT } from '@/i18n'

export interface StorageLoadingProps {
  /** Optional progress percentage (0-100) */
  progress?: number
  /** Whether to show indeterminate loading animation */
  isLoading?: boolean
}

/**
 * Loading screen shown during application initialization
 */
export function StorageLoading({ progress, isLoading = true }: StorageLoadingProps) {
  const t = useT()

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
