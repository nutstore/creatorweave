/**
 * TopBar - minimal top bar for the workspace.
 *
 * Left: Logo + product name
 * Right: Folder button, Settings gear, Remote status
 */

import { useState } from 'react'
import { FolderOpen, Settings, Sparkles, Wrench } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useSettingsStore } from '@/store/settings.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { RemoteBadge } from '@/components/remote/RemoteBadge'

interface TopBarProps {
  onSkillsManagerOpen?: () => void
}

export function TopBar({ onSkillsManagerOpen }: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { directoryHandle, directoryName, setDirectoryHandle } = useAgentStore()
  const { hasApiKey } = useSettingsStore()

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
          <span className="text-sm font-semibold text-neutral-900">BFOSA</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Folder */}
          {directoryHandle ? (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              title="切换项目文件夹"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <FolderOpen className="h-3.5 w-3.5 text-neutral-500" />
              <span className="max-w-[120px] truncate">{directoryName}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              打开文件夹
            </button>
          )}

          {/* API Key status */}
          {!hasApiKey && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-md px-2 py-1 text-xs text-amber-600 hover:bg-amber-50"
            >
              未配置 API Key
            </button>
          )}

          {/* Remote */}
          <RemoteBadge />

          {/* Skills */}
          <button
            type="button"
            onClick={onSkillsManagerOpen}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="技能管理"
          >
            <Wrench className="h-4 w-4" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="设置"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
