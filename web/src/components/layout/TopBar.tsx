/**
 * TopBar - minimal top bar for the workspace.
 *
 * Left: Logo + product name
 * Right: Folder button, Session badge, Settings gear, Remote status
 *
 * Phase 3 Integration:
 * - Added SessionBadge to show OPFS session status
 * Phase 4 Integration:
 * - Added i18n support
 * Phase 5 Integration:
 * - Replaced inline folder button with FolderSelector component
 */

import { useState } from 'react'
import { Settings, Sparkles, Wrench } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { RemoteBadge } from '@/components/remote/RemoteBadge'
import { RemoteBadgeErrorBoundary } from '@/components/remote/RemoteBadgeErrorBoundary'
import { SessionBadgeWithStorage } from '@/components/session'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { FolderSelector } from './FolderSelector'
import { useT } from '@/i18n'
import { BrandButton } from '@browser-fs-analyzer/ui'

interface TopBarProps {
  onSkillsManagerOpen?: () => void
}

export function TopBar({ onSkillsManagerOpen }: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { hasApiKey } = useSettingsStore()
  const t = useT()

  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-gray-200 bg-background px-4">
        {/* Left: Logo + Name */}
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-primary-600" />
          <span className="text-base font-medium text-primary">{t('topbar.productName')}</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Folder Selector */}
          <FolderSelector />

          {/* API Key status */}
          {!hasApiKey && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-warning-200 bg-warning-50 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning-bg focus:outline-none"
            >
              <span className="flex h-[14px] w-[14px] items-center justify-center">
                <svg
                  className="h-[14px] w-[14px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
              {t('topbar.noApiKey')}
            </button>
          )}

          {/* Remote */}
          <RemoteBadgeErrorBoundary>
            <RemoteBadge />
          </RemoteBadgeErrorBoundary>

          {/* Session - OPFS session status with storage dropdown */}
          <SessionBadgeWithStorage compact />

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Skills */}
          <BrandButton
            iconButton
            onClick={onSkillsManagerOpen}
            title={t('topbar.skillsManagement')}
          >
            <Wrench className="h-[14px] w-[14px]" />
          </BrandButton>

          {/* Settings */}
          <BrandButton
            iconButton
            onClick={() => setSettingsOpen(true)}
            title={t('topbar.settings')}
          >
            <Settings className="h-[14px] w-[14px]" />
          </BrandButton>
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
