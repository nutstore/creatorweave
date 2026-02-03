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
 */

import { useState } from 'react'
import { FolderOpen, Settings, Sparkles, Wrench } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useSettingsStore } from '@/store/settings.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { RemoteBadge } from '@/components/remote/RemoteBadge'
import { SessionBadgeWithStorage } from '@/components/session'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { useT } from '@/i18n'

interface TopBarProps {
  onSkillsManagerOpen?: () => void
}

export function TopBar({ onSkillsManagerOpen }: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { directoryHandle, directoryName, setDirectoryHandle } = useAgentStore()
  const { hasApiKey } = useSettingsStore()
  const t = useT()

  const handleSelectFolder = async () => {
    try {
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') return
      console.error('Failed to select folder:', error)
    }
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
        {/* Left: Logo + Name */}
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary-600" />
          <span className="text-sm font-semibold text-neutral-900">{t('topbar.productName')}</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Folder */}
          {directoryHandle ? (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              title={t('topbar.switchFolder')}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <FolderOpen className="h-4 w-4 text-neutral-500" />
              <span className="max-w-[120px] truncate">{directoryName}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="hover:border-primary-200 active:border-primary-300 flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 active:bg-primary-100"
            >
              <FolderOpen className="h-4 w-4" />
              {t('topbar.openFolder')}
            </button>
          )}

          {/* API Key status */}
          {!hasApiKey && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-md px-2 py-1 text-xs text-amber-600 hover:bg-amber-50"
            >
              {t('topbar.noApiKey')}
            </button>
          )}

          {/* Remote */}
          <RemoteBadge />

          {/* Session - OPFS session status with storage dropdown */}
          <SessionBadgeWithStorage compact />

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Skills */}
          <button
            type="button"
            onClick={onSkillsManagerOpen}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title={t('topbar.skillsManagement')}
          >
            <Wrench className="h-4 w-4" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title={t('topbar.settings')}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
