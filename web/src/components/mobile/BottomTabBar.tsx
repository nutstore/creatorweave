/**
 * BottomTabBar - Mobile bottom navigation tab bar.
 *
 * Provides touch-friendly navigation with:
 * - Minimum 44x44px touch targets for accessibility
 * - Visual feedback for active tab state
 * - Smooth transitions between tabs
 */

import React from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tab configuration interface.
 */
export interface Tab {
  /** Unique identifier for the tab */
  id: string
  /** Display label for the tab */
  label: string
  /** Icon component to display */
  icon: React.ReactNode
}

/**
 * Props for the BottomTabBar component.
 */
interface BottomTabBarProps {
  /** Array of tab configurations */
  tabs: Tab[]
  /** Currently active tab ID */
  activeTab: string
  /** Callback when tab selection changes */
  onChange: (tabId: string) => void
  /** Optional additional CSS classes */
  className?: string
}

/**
 * BottomTabBar component - provides mobile-friendly bottom navigation.
 *
 * @example
 * ```tsx
 * const tabs = [
 *   { id: 'chat', label: 'Chat', icon: <MessageCircle /> },
 *   { id: 'files', label: 'Files', icon: <Folder /> },
 * ]
 * <BottomTabBar tabs={tabs} activeTab="chat" onChange={(id) => setActiveTab(id)} />
 * ```
 */
export function BottomTabBar({ tabs, activeTab, onChange, className }: BottomTabBarProps) {
  return (
    <nav
      className={twMerge(
        'pb-safe fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-background px-2',
        className
      )}
      role="navigation"
      aria-label="Bottom navigation"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={clsx(
              'flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-200',
              // Minimum 44x44px touch target for accessibility
              'min-h-[44px] min-w-[44px] touch-manipulation',
              // Active state styling
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
          >
            {/* Icon container with sizing */}
            <div
              className={clsx(
                'flex items-center justify-center p-1.5 transition-transform duration-200',
                isActive && 'scale-110'
              )}
              aria-hidden="true"
            >
              {React.cloneElement(tab.icon as React.ReactElement, {
                className: clsx('h-6 w-6', isActive ? 'stroke-[2.5]' : 'stroke-[2]'),
              })}
            </div>

            {/* Label text */}
            <span
              className={clsx(
                'text-[11px] font-medium leading-none tracking-wide',
                isActive && 'font-semibold'
              )}
            >
              {tab.label}
            </span>

            {/* Active indicator bar */}
            {isActive && <div className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary" />}
          </button>
        )
      })}
    </nav>
  )
}
