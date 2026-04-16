/**
 * Drawer Component
 *
 * A slide-out panel from the right edge of the screen.
 * Overlays content without affecting layout.
 *
 * Hardened for:
 * - Focus trapping
 * - Mobile responsiveness
 * - Accessibility (ARIA labels, reduced motion)
 * - Keyboard navigation
 */

import { useEffect, useCallback, useRef, useId } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

export interface DrawerProps {
  /** Whether the drawer is open */
  open: boolean
  /** Callback when drawer should close */
  onClose: () => void
  /** Drawer title */
  title?: React.ReactNode
  /** Drawer content */
  children: React.ReactNode
  /** Additional CSS classes */
  className?: string
  /** Width of the drawer - accepts any CSS width value */
  width?: string
}

const FOCUSABLE_elements = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Drawer - a slide-out panel from the right
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  className,
  width = '480px',
}: DrawerProps) {
  const t = useT()
  const drawerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Handle ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        onClose()
        return
      }

      // Focus trap - Tab key
      if (e.key === 'Tab' && open && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_elements)
        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        // Shift + Tab on first element -> wrap to last
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
        // Tab on last element -> wrap to first
        else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    },
    [open, onClose]
  )

  // Set up focus trap and restore focus
  useEffect(() => {
    if (open) {
      // Store the previously focused element
      previousActiveElement.current = document.activeElement as HTMLElement

      // Move focus to drawer
      requestAnimationFrame(() => {
        if (drawerRef.current) {
          const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_elements)
          if (focusableElements.length > 0) {
            focusableElements[0].focus()
          } else {
            // If no focusable elements, focus the drawer itself
            drawerRef.current.focus()
          }
        }
      })
    } else {
      // Restore focus when drawer closes
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [open])

  // Global keyboard handler
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalStyle
      }
    }
  }, [open])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 flex flex-col',
          'bg-background border-l shadow-xl',
          'transform transition-transform duration-300 ease-out',
          'animate-in slide-in-from-right',
          // Width is controlled by the width prop below.
          // Keep max width to viewport so custom widths never overflow screen.
          'w-full max-w-full',
          // Respect reduced motion preference
          'motion-reduce:transition-none motion-reduce:animate-in',
          className
        )}
        style={{ width: width, maxWidth: '100vw' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        // Make drawer focusable for focus trap fallback
        tabIndex={-1}
      >
        {/* Header */}
        {title && (
          <div
            className="flex items-center justify-between border-b px-4 py-3 shrink-0"
            id={titleId}
          >
            <h2 className="text-lg font-semibold truncate">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden focus-visible:outline-none">
          {children}
        </div>
      </div>
    </>
  )
}
