/**
 * MobileLayout - Responsive layout container for mobile devices.
 *
 * Automatically detects mobile viewport and adjusts layout accordingly:
 * - Adds bottom padding for tab bar on mobile
 * - Manages safe area insets for notched devices
 * - Conditionally renders bottom tab bar when in mobile mode
 */

import React, { useState } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useMobile } from './useMobile'
import { BottomTabBar, Tab } from './BottomTabBar'

/**
 * Props for the MobileLayout component.
 */
interface MobileLayoutProps {
  /** Child content to render within the layout */
  children: React.ReactNode
  /** Optional CSS classes for the container */
  className?: string
  /** Optional custom tabs configuration */
  tabs?: Tab[]
  /** Currently active tab (required if tabs are provided) */
  activeTab?: string
  /** Callback when tab selection changes (required if tabs are provided) */
  onTabChange?: (tabId: string) => void
  /** Optional header component to render at the top */
  header?: React.ReactNode
  /** Whether to hide the tab bar even on mobile */
  hideTabBar?: boolean
}

/**
 * Default tabs configuration for the application.
 */
export const DEFAULT_MOBILE_TABS: Tab[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <span className="text-lg" aria-hidden="true">
        💬
      </span>
    ),
  },
  {
    id: 'files',
    label: 'Files',
    icon: (
      <span className="text-lg" aria-hidden="true">
        📁
      </span>
    ),
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: (
      <span className="text-lg" aria-hidden="true">
        🛠️
      </span>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <span className="text-lg" aria-hidden="true">
        ⚙️
      </span>
    ),
  },
]

/**
 * MobileLayout component - responsive container for mobile-first design.
 *
 * Features:
 * - Automatic mobile detection via useMobile hook
 * - Safe area padding for device notches and home indicators
 * - Optional integrated bottom tab bar
 * - Conditional rendering based on viewport size
 *
 * @example
 * ```tsx
 * <MobileLayout
 *   header={<TopBar />}
 *   tabs={customTabs}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * >
 *   <main>Content goes here</main>
 * </MobileLayout>
 * ```
 */
export function MobileLayout({
  children,
  className,
  tabs = DEFAULT_MOBILE_TABS,
  activeTab,
  onTabChange,
  header,
  hideTabBar = false,
}: MobileLayoutProps) {
  const isMobile = useMobile()
  const [defaultActiveTab, setDefaultActiveTab] = useState('chat')

  // Use controlled activeTab if provided, otherwise use internal state
  const currentActiveTab = activeTab ?? defaultActiveTab
  const handleTabChange = onTabChange ?? setDefaultActiveTab

  return (
    <div
      className={twMerge(
        'flex min-h-screen flex-col bg-background',
        isMobile && 'mobile-viewport',
        className
      )}
    >
      {/* Optional header - sticky on mobile */}
      {header && <div className="sticky top-0 z-40 shrink-0">{header}</div>}

      {/* Main content area - scrolls independently */}
      <main
        className={clsx(
          'flex-1 overflow-y-auto',
          // Add bottom padding on mobile when tab bar is visible
          isMobile && !hideTabBar && 'pb-20',
          // Add safe area padding for notched devices
          'pb-safe'
        )}
        role="main"
      >
        {children}
      </main>

      {/* Bottom tab bar - only shown on mobile and when not hidden */}
      {isMobile && !hideTabBar && (
        <BottomTabBar tabs={tabs} activeTab={currentActiveTab} onChange={handleTabChange} />
      )}
    </div>
  )
}
