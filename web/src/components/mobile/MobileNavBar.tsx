/**
 * MobileNavBar - Mobile-optimized top navigation bar.
 *
 * Provides mobile-friendly header with:
 * - Back navigation support
 * - Title display
 * - Right-side action buttons
 * - Safe area padding for notched devices
 */

import React from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Configuration for optional left action (usually back button).
 */
export interface NavAction {
  /** Icon to display */
  icon: React.ReactNode
  /** Accessibility label */
  label: string
  /** Click handler */
  onClick: () => void
}

/**
 * Configuration for optional right actions.
 */
export interface NavActions {
  /** Array of right-side action buttons */
  items: NavAction[]
}

/**
 * Props for the MobileNavBar component.
 */
export interface MobileNavBarProps {
  /** Page title to display */
  title: string
  /** Optional subtitle or badge text */
  subtitle?: string
  /** Optional left action (back button) */
  leftAction?: NavAction
  /** Optional right-side actions */
  rightActions?: NavActions
  /** Optional CSS classes */
  className?: string
  /** Whether to show a divider at the bottom */
  showDivider?: boolean
}

/**
 * MobileNavBar component - mobile-optimized top navigation.
 *
 * @example
 * ```tsx
 * <MobileNavBar
 *   title="Settings"
 *   leftAction={{
 *     icon: <ArrowLeft />,
 *     label',
 *     on: 'BackClick: () => navigate(-1),
 *   }}
 *   rightActions={{
 *     items: [
 *       {
 *         icon: <MoreVertical />,
 *         label: 'More options',
 *         onClick: () => setShowMenu(true),
 *       },
 *     ],
 *   }}
 * />
 * ```
 */
export function MobileNavBar({
  title,
  subtitle,
  leftAction,
  rightActions,
  className,
  showDivider = true,
}: MobileNavBarProps) {
  return (
    <header
      className={twMerge(
        'pt-safe sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 bg-background px-4',
        showDivider && 'border-b border-gray-200',
        className
      )}
      role="banner"
    >
      {/* Left side - optional back/action button */}
      <div className="flex min-w-0 items-center gap-2">
        {leftAction && (
          <button
            type="button"
            onClick={leftAction.onClick}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground active:scale-95"
            aria-label={leftAction.label}
          >
            {leftAction.icon}
          </button>
        )}
      </div>

      {/* Center - Title and subtitle */}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
        <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      {/* Right side - action buttons */}
      <div className="flex min-w-0 items-center justify-end gap-1">
        {rightActions?.items.map((action, index) => (
          <button
            key={index}
            type="button"
            onClick={action.onClick}
            className={clsx(
              'flex h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground transition-colors',
              // Minimum 44x44px touch target
              'min-h-[44px] min-w-[44px]',
              'hover:bg-gray-100 hover:text-foreground active:scale-95'
            )}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </header>
  )
}
