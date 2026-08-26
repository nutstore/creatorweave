/**
 * InstallPrompt Component
 *
 * Displays a non-intrusive banner encouraging users to install the PWA.
 * Only shows after user interaction to avoid being pushy.
 */

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useInstallPrompt } from './useInstallPrompt'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Props for the InstallPrompt component
 */
interface InstallPromptProps {
  /**
   * Optional CSS class for custom styling
   */
  className?: string
}

/**
 * InstallPrompt displays a non-intrusive banner when the PWA
 * can be installed. It respects user's choices and won't
 * show again after dismissal or installation.
 *
 * Features:
 * - Delayed appearance (after user interaction)
 * - Non-intrusive bottom banner design
 * - Respects dismiss choice
 * - Detects standalone mode
 * - Smooth animations
 *
 * @param props - Component props
 * @returns The install prompt banner or null if not applicable
 */
export function InstallPrompt({ className }: InstallPromptProps) {
  const { canInstall, prompt, dismiss } = useInstallPrompt()
  const [isVisible, setIsVisible] = useState(false)

  // Delay showing the prompt until user has interacted with the page
  useEffect(() => {
    if (!canInstall) return

    // Wait for user interaction before showing
    const handleInteraction = () => {
      // Show prompt after a short delay following interaction
      setTimeout(() => {
        setIsVisible(true)
      }, 1000)
    }

    // Listen for first user interaction
    window.addEventListener('click', handleInteraction, { once: true })
    window.addEventListener('keydown', handleInteraction, { once: true })
    window.addEventListener('touchstart', handleInteraction, { once: true })

    return () => {
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
      window.removeEventListener('touchstart', handleInteraction)
    }
  }, [canInstall])

  // Don't render if not eligible or already dismissed
  if (!canInstall || !isVisible) {
    return null
  }

  /**
   * Handle install action - show native install dialog
   */
  const handleInstall = async () => {
    if (!prompt) return

    try {
      // Show the native install dialog
      await prompt.prompt()

      // Wait for user choice
      const { outcome } = await prompt.userChoice

      if (outcome === 'accepted') {
        // User accepted the install
        console.log('[InstallPrompt] User accepted install')
      } else {
        // User dismissed the prompt
        console.log('[InstallPrompt] User dismissed install')
      }

      // Clear the prompt either way
      dismiss()
    } catch (error) {
      console.error('[InstallPrompt] Failed to show install dialog:', error)
    }
  }

  /**
   * Handle dismiss action - hide the banner
   */
  const handleDismiss = () => {
    dismiss()
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
      aria-label="Install app"
    >
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-3 sm:flex-row">
        {/* Install notification content */}
        <div className="flex items-center gap-3">
          <Download className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">
            Install this app for a better experience.{' '}
            <span className="hidden sm:inline">Works offline and launches faster.</span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleInstall}
            className="gap-1.5"
            aria-label="Install app now"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Install
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            aria-label="Not interested, dismiss"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Not Now
          </Button>
        </div>
      </div>
    </div>
  )
}
