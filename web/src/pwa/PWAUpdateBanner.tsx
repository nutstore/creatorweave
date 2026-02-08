/**
 * PWAUpdateBanner Component
 *
 * Displays a toast notification when a new version of the app is available.
 * Fixed at the bottom of the viewport with update action buttons.
 */

import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useServiceWorker } from './useServiceWorker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Props for the PWAUpdateBanner component
 */
interface PWAUpdateBannerProps {
  /**
   * Optional CSS class for custom styling
   */
  className?: string
}

/**
 * PWAUpdateBanner displays a notification when a new app version is available.
 * It provides options to update immediately or dismiss the notification.
 *
 * Features:
 * - Fixed bottom position with smooth animations
 * - Accessible keyboard navigation
 * - Responsive design for all screen sizes
 * - Lucide icons for visual feedback
 *
 * @param props - Component props
 * @returns The update banner component or null if no update available
 */
export function PWAUpdateBanner({ className }: PWAUpdateBannerProps) {
  const { updateAvailable, skipWaiting } = useServiceWorker()
  const [isDismissed, setIsDismissed] = useState(false)

  // Hide banner if no update available or user dismissed it
  if (!updateAvailable || isDismissed) {
    return null
  }

  /**
   * Handle update action - skip waiting and reload page
   */
  const handleUpdate = () => {
    skipWaiting()
    // Trigger page reload to use new service worker
    window.location.reload()
  }

  /**
   * Handle dismiss action - hide the banner
   */
  const handleDismiss = () => {
    setIsDismissed(true)
  }

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        'duration-300 animate-in slide-in-from-bottom',
        className
      )}
      role="alert"
      aria-live="polite"
      aria-label="App update available"
    >
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-3 sm:flex-row">
        {/* Update notification content */}
        <div className="flex items-center gap-3">
          <RefreshCw className="animate-spin-slow h-5 w-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">
            A new version is available.{' '}
            <span className="hidden sm:inline">
              Update now to get the latest features and improvements.
            </span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleUpdate}
            className="gap-1.5"
            aria-label="Update app to latest version"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Update Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss update notification"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
