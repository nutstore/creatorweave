/**
 * TopBar - minimal top bar for the conversation area.
 *
 * Left: Logo + project name
 * Right: Folder, status badges, action buttons, Settings gear
 *
 * Refactored: Language, Theme, MCP, Docs moved into SettingsDialog.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Settings,
  SlidersHorizontal,
  Wrench,
  KeyRound,
  List,
  MoreHorizontal,
  Keyboard,
  Menu,
  ArrowLeft,
  Terminal,
} from 'lucide-react'
import { ProjectSwitcher } from './ProjectSwitcher'
import { useHasApiKey } from '@/store/settings.store'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { RemoteBadge } from '@/components/remote/RemoteBadge'
import { RemoteBadgeErrorBoundary } from '@/components/remote/RemoteBadgeErrorBoundary'
import { ConversationStorageBadge } from '@/components/conversation'
import { FolderSelector } from './FolderSelector'
import { useT } from '@/i18n'
import {
  BrandButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@creatorweave/ui'

interface TopBarProps {
  onSkillsManagerOpen?: () => void
  onToolsPanelOpen?: () => void
  onCommandPaletteOpen?: () => void
  onWorkspaceSettingsOpen?: () => void
  onWebContainerOpen?: () => void
  onBackToProjects?: () => void
  activeProjectName?: string
  activeConversationName?: string
  /** @deprecated use activeConversationName */
  activeWorkspaceName?: string
  /** Called when menu button is pressed on mobile */
  onMenuOpen?: () => void
  /** Whether the device is mobile */
  isMobile?: boolean
  /** Switch to a different project by ID */
  onSwitchProject?: (projectId: string) => Promise<void>
  /** Open the "create project" dialog */
  onCreateProject?: () => void
  /** Navigate to project management (project list) */
  onManageProjects?: () => void
  /** Controlled open state for the project switcher dropdown */
  projectSwitcherOpen?: boolean
  /** Callback when project switcher open state changes */
  onProjectSwitcherOpenChange?: (open: boolean) => void
}

export function TopBar({
  onSkillsManagerOpen,
  onToolsPanelOpen,
  onCommandPaletteOpen,
  onWorkspaceSettingsOpen,
  onWebContainerOpen,
  onBackToProjects,
  activeProjectName,
  activeConversationName,
  activeWorkspaceName,
  onMenuOpen,
  isMobile,
  onSwitchProject,
  onCreateProject,
  onManageProjects,
  projectSwitcherOpen,
  onProjectSwitcherOpenChange,
}: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const mobileMorePanelRef = useRef<HTMLDivElement | null>(null)
  const hasApiKey = useHasApiKey() // Use the reactive hook that syncs with database
  const t = useT()
  const conversationName = activeConversationName ?? activeWorkspaceName

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

  useEffect(() => {
    if (!mobileMoreOpen) return

    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (!mobileMorePanelRef.current?.contains(target)) {
        setMobileMoreOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [mobileMoreOpen])

  const closeMobileMorePanel = () => {
    setMobileMoreOpen(false)
  }

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <header
          className={`relative flex shrink-0 items-center justify-between border-b border-neutral-200 bg-background dark:border-border ${
            isMobile ? 'h-12 px-2' : 'h-[52px] px-4'
          }`}
        >
        {/* Left: Menu button (mobile) + Logo + Name */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
          {activeProjectName && (
            <div className={`flex min-w-0 items-center gap-1 ${isMobile ? 'max-w-[58vw]' : ''}`}>
              <ProjectSwitcher
                activeProjectName={activeProjectName}
                onSwitchProject={onSwitchProject ?? (async () => {})}
                onCreateProject={onCreateProject ?? (() => {})}
                onManageProjects={onManageProjects ?? (() => {})}
                open={projectSwitcherOpen}
                onOpenChange={onProjectSwitcherOpenChange}
              />
              {conversationName && (
                <>
                  {!isMobile && (
                    <>
                      <span className="text-xs text-tertiary dark:text-muted">/</span>
                      <ActionTooltip label={t('topbar.workspaceLabel', { name: conversationName })}>
                        <span className="max-w-[200px] truncate rounded-md bg-muted px-2 py-1 text-xs text-secondary dark:bg-muted dark:text-muted">
                          {conversationName}
                        </span>
                      </ActionTooltip>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        {isMobile ? (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {!hasApiKey && (
              <ActionTooltip label={t('topbar.tooltips.openApiKeySettings')}>
                <BrandButton iconButton onClick={() => setSettingsOpen(true)}>
                  <KeyRound className="h-[14px] w-[14px]" />
                </BrandButton>
              </ActionTooltip>
            )}

            <ActionTooltip label={t('topbar.tooltips.toolsPanel')}>
              <BrandButton iconButton onClick={onToolsPanelOpen} data-tour="tools">
                <List className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>

            <ActionTooltip label={t('topbar.tooltips.appSettings')}>
              <BrandButton iconButton onClick={() => setSettingsOpen(true)}>
                <Settings className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>

            <ActionTooltip label={t('topbar.tooltips.more')}>
              <BrandButton iconButton onClick={() => setMobileMoreOpen((prev) => !prev)}>
                <MoreHorizontal className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* Folder Selector */}
            <div className="shrink-0">
              <FolderSelector />
            </div>

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
            <div className="shrink-0">
              <RemoteBadgeErrorBoundary>
                <RemoteBadge />
              </RemoteBadgeErrorBoundary>
            </div>

            {/* Conversation Storage - OPFS conversation status with storage dropdown */}
            <div className="shrink-0">
              <ConversationStorageBadge compact />
            </div>

            <div className="h-5 w-px bg-muted" />

            {/* Workspace Settings */}
            <ActionTooltip label={t('topbar.tooltips.workspaceSettings')}>
              <BrandButton iconButton className="shrink-0" onClick={onWorkspaceSettingsOpen}>
                <SlidersHorizontal className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>

            {/* Tools Panel */}
            <ActionTooltip label={t('topbar.tooltips.toolsPanel')}>
              <BrandButton iconButton className="shrink-0" onClick={onToolsPanelOpen} data-tour="tools">
                <List className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>

            {/* WebContainer */}
            <ActionTooltip label={t('topbar.tooltips.webContainer')}>
              <BrandButton iconButton onClick={onWebContainerOpen}>
                <Terminal className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>

            {/* Quick Actions / Command Palette */}
            <ActionTooltip label={t('topbar.tooltips.commandPalette')}>
              <BrandButton iconButton onClick={onCommandPaletteOpen}>
                <Keyboard className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>

            {/* Skills */}
            <ActionTooltip label={t('topbar.tooltips.skillsManager')}>
              <BrandButton iconButton className="shrink-0" onClick={onSkillsManagerOpen} data-tour="skills">
                <Wrench className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>

            <div className="h-5 w-px bg-muted" />

            {/* Settings */}
            <ActionTooltip label={t('topbar.tooltips.appSettings')}>
              <BrandButton iconButton className="shrink-0" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-[14px] w-[14px]" />
              </BrandButton>
            </ActionTooltip>
          </div>
        )}
      </header>

      {isMobile && mobileMoreOpen && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={closeMobileMorePanel} />
      )}

      {isMobile && mobileMoreOpen && (
        <div
          ref={mobileMorePanelRef}
          className="fixed right-2 top-14 z-50 w-[min(92vw,340px)] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="mb-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2 dark:border-neutral-700 dark:bg-neutral-800/60">
            <div className="mb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              {t('topbar.mobile.workDirectory')}
            </div>
            <FolderSelector />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <BrandButton
              variant="ghost"
              className="h-9 justify-start gap-2 text-xs"
              onClick={() => {
                onWorkspaceSettingsOpen?.()
                closeMobileMorePanel()
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('topbar.mobile.workspaceSettings')}
            </BrandButton>
            <BrandButton
              variant="ghost"
              className="h-9 justify-start gap-2 text-xs"
              onClick={() => {
                onSkillsManagerOpen?.()
                closeMobileMorePanel()
              }}
            >
              <Wrench className="h-3.5 w-3.5" />
              {t('topbar.mobile.skills')}
            </BrandButton>
            <BrandButton
              variant="ghost"
              className="h-9 justify-start gap-2 text-xs"
              onClick={() => {
                onCommandPaletteOpen?.()
                closeMobileMorePanel()
              }}
            >
              <Keyboard className="h-3.5 w-3.5" />
              {t('topbar.mobile.commandPalette')}
            </BrandButton>
            <BrandButton
              variant="ghost"
              className="h-9 justify-start gap-2 text-xs"
              onClick={() => {
                onWebContainerOpen?.()
                closeMobileMorePanel()
              }}
            >
              <Terminal className="h-3.5 w-3.5" />
              {t('topbar.mobile.webContainer')}
            </BrandButton>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="rounded-lg border border-neutral-200 px-2 py-1.5 dark:border-neutral-700">
              <div className="mb-1 text-[10px] text-neutral-500 dark:text-neutral-400">{t('topbar.mobile.connection')}</div>
              <RemoteBadgeErrorBoundary>
                <RemoteBadge />
              </RemoteBadgeErrorBoundary>
            </div>
            <div className="rounded-lg border border-neutral-200 px-2 py-1.5 dark:border-neutral-700">
              <div className="mb-1 text-[10px] text-neutral-500 dark:text-neutral-400">{t('topbar.mobile.storage')}</div>
              <ConversationStorageBadge compact />
            </div>
          </div>
        </div>
      )}
      </TooltipProvider>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
