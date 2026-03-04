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

import { useState, type ReactNode } from 'react'
import {
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  KeyRound,
  Server,
  List,
  Keyboard,
  Menu,
  ArrowLeft,
} from 'lucide-react'
import { useHasApiKey } from '@/store/settings.store'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { MCPSettingsDialog } from '@/components/mcp'
import { RemoteBadge } from '@/components/remote/RemoteBadge'
import { RemoteBadgeErrorBoundary } from '@/components/remote/RemoteBadgeErrorBoundary'
import { ConversationStorageBadge } from '@/components/session'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'
import { FolderSelector } from './FolderSelector'
import { useT } from '@/i18n'
import {
  BrandButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@browser-fs-analyzer/ui'
import { ThemeToggle } from '@/components/workspace'

interface TopBarProps {
  onSkillsManagerOpen?: () => void
  onToolsPanelOpen?: () => void
  onCommandPaletteOpen?: () => void
  onWorkspaceSettingsOpen?: () => void
  onBackToProjects?: () => void
  activeProjectName?: string
  activeWorkspaceName?: string
  /** Called when menu button is pressed on mobile */
  onMenuOpen?: () => void
  /** Whether the device is mobile */
  isMobile?: boolean
}

export function TopBar({
  onSkillsManagerOpen,
  onToolsPanelOpen,
  onCommandPaletteOpen,
  onWorkspaceSettingsOpen,
  onBackToProjects,
  activeProjectName,
  activeWorkspaceName,
  onMenuOpen,
  isMobile,
}: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mcpSettingsOpen, setMcpSettingsOpen] = useState(false)
  const hasApiKey = useHasApiKey() // Use the reactive hook that syncs with database
  const t = useT()

  const ActionTooltip = ({
    label,
    children,
  }: {
    label: string
    children: ReactNode
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-gray-200 bg-background px-4 dark:border-neutral-700">
        {/* Left: Menu button (mobile) + Logo + Name */}
        <div className="flex items-center gap-2.5">
          {onBackToProjects && (
            <ActionTooltip label={t('topbar.tooltips.backToProjects')}>
              <BrandButton iconButton onClick={onBackToProjects}>
                <ArrowLeft className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>
          )}
          {isMobile && (
            <ActionTooltip label={t('topbar.tooltips.menu')}>
              <BrandButton iconButton onClick={onMenuOpen} data-tour="menu">
                <Menu className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>
          )}
          <ActionTooltip label={t('topbar.productName')}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary-600" />
              <span className="text-base font-medium text-primary">{t('topbar.productName')}</span>
            </div>
          </ActionTooltip>
          {activeProjectName && (
            <div className="flex items-center gap-1">
              <ActionTooltip label={t('topbar.projectLabel', { name: activeProjectName })}>
                <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {activeProjectName}
                </span>
              </ActionTooltip>
              {activeWorkspaceName && (
                <>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">/</span>
                  <ActionTooltip label={t('topbar.workspaceLabel', { name: activeWorkspaceName })}>
                    <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {activeWorkspaceName}
                    </span>
                  </ActionTooltip>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Folder Selector */}
          <FolderSelector />

          {/* API Key status - consistent button style */}
          {!hasApiKey && (
            <ActionTooltip label={t('topbar.tooltips.openApiKeySettings')}>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="hover:bg-warning-100 focus:ring-warning-500 inline-flex h-8 items-center gap-1.5 rounded-md border border-warning-200 bg-warning-50 px-2.5 text-xs font-medium text-warning focus:outline-none focus:ring-2"
              >
                <KeyRound className="h-4 w-4" />
                <span>{t('topbar.noApiKey')}</span>
              </button>
            </ActionTooltip>
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

          <div className="h-5 w-px bg-neutral-200" />

          {/* Workspace Settings (Phase 4) */}
          <ActionTooltip label={t('topbar.tooltips.workspaceSettings')}>
            <BrandButton iconButton onClick={onWorkspaceSettingsOpen}>
              <SlidersHorizontal className="h-[14px] w-[14px]" />
            </BrandButton>
          </ActionTooltip>

          {/* Tools Panel */}
          <ActionTooltip label={t('topbar.tooltips.toolsPanel')}>
            <BrandButton iconButton onClick={onToolsPanelOpen} data-tour="tools">
              <List className="h-[14px] w-[14px]" />
            </BrandButton>
          </ActionTooltip>

          {/* Quick Actions / Command Palette (Phase 4) */}
          <ActionTooltip label={t('topbar.tooltips.commandPalette')}>
            <BrandButton iconButton onClick={onCommandPaletteOpen}>
              <Keyboard className="h-[14px] w-[14px]" />
            </BrandButton>
          </ActionTooltip>

          {/* Skills */}
          <ActionTooltip label={t('topbar.tooltips.skillsManager')}>
            <BrandButton iconButton onClick={onSkillsManagerOpen} data-tour="skills">
              <Wrench className="h-[14px] w-[14px]" />
            </BrandButton>
          </ActionTooltip>

          {/* MCP Settings */}
          <ActionTooltip label={t('topbar.tooltips.mcpSettings')}>
            <BrandButton iconButton onClick={() => setMcpSettingsOpen(true)}>
              <Server className="h-[14px] w-[14px]" />
            </BrandButton>
          </ActionTooltip>

          <div className="h-5 w-px bg-neutral-200" />

          {/* Settings */}
          <ActionTooltip label={t('topbar.tooltips.appSettings')}>
            <BrandButton iconButton onClick={() => setSettingsOpen(true)}>
              <Settings className="h-[14px] w-[14px]" />
            </BrandButton>
          </ActionTooltip>
        </div>
      </header>
      </TooltipProvider>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <MCPSettingsDialog open={mcpSettingsOpen} onOpenChange={setMcpSettingsOpen} />
    </>
  )
}
