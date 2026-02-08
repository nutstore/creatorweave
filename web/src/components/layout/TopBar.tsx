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
import { Settings, Sparkles, Wrench, KeyRound, Server, List, Keyboard } from 'lucide-react'
import { useHasApiKey } from '@/store/settings.store'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { MCPSettingsDialog } from '@/components/mcp'
import { RemoteBadge } from '@/components/remote/RemoteBadge'
import { RemoteBadgeErrorBoundary } from '@/components/remote/RemoteBadgeErrorBoundary'
import { ConversationStorageBadge } from '@/components/session'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { FolderSelector } from './FolderSelector'
import { useT } from '@/i18n'
import { BrandButton } from '@browser-fs-analyzer/ui'
import { ThemeToggle } from '@/components/workspace'

interface TopBarProps {
  onSkillsManagerOpen?: () => void
  onToolsPanelOpen?: () => void
  onCommandPaletteOpen?: () => void
  onWorkspaceSettingsOpen?: () => void
}

export function TopBar({
  onSkillsManagerOpen,
  onToolsPanelOpen,
  onCommandPaletteOpen,
  onWorkspaceSettingsOpen,
}: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mcpSettingsOpen, setMcpSettingsOpen] = useState(false)
  const hasApiKey = useHasApiKey() // Use the reactive hook that syncs with database
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

          {/* API Key status - consistent button style */}
          {!hasApiKey && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="hover:bg-warning-100 focus:ring-warning-500 inline-flex h-8 items-center gap-1.5 rounded-md border border-warning-200 bg-warning-50 px-2.5 text-xs font-medium text-warning focus:outline-none focus:ring-2"
            >
              <KeyRound className="h-4 w-4" />
              <span>{t('topbar.noApiKey')}</span>
            </button>
          )}

          {/* Remote */}
          <RemoteBadgeErrorBoundary>
            <RemoteBadge />
          </RemoteBadgeErrorBoundary>

          {/* Conversation Storage - OPFS workspace status with storage dropdown */}
          <ConversationStorageBadge compact />

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Workspace Settings (Phase 4) */}
          <BrandButton iconButton onClick={onWorkspaceSettingsOpen} title="Workspace Settings">
            <Settings className="h-[14px] w-[14px]" />
          </BrandButton>

          {/* Tools Panel */}
          <BrandButton
            iconButton
            onClick={onToolsPanelOpen}
            title="Available Tools"
            data-tour="tools"
          >
            <List className="h-[14px] w-[14px]" />
          </BrandButton>

          {/* Quick Actions / Command Palette (Phase 4) */}
          <BrandButton iconButton onClick={onCommandPaletteOpen} title="Command Palette (Cmd+K)">
            <Keyboard className="h-[14px] w-[14px]" />
          </BrandButton>

          {/* Skills */}
          <BrandButton
            iconButton
            onClick={onSkillsManagerOpen}
            title={t('topbar.skillsManagement')}
            data-tour="skills"
          >
            <Wrench className="h-[14px] w-[14px]" />
          </BrandButton>

          {/* MCP Settings */}
          <BrandButton iconButton onClick={() => setMcpSettingsOpen(true)} title="MCP 服务配置">
            <Server className="h-[14px] w-[14px]" />
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
      <MCPSettingsDialog open={mcpSettingsOpen} onOpenChange={setMcpSettingsOpen} />
    </>
  )
}
