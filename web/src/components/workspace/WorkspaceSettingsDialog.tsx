/**
 * Workspace Settings Dialog - comprehensive settings management.
 *
 * Features:
 * - Layout preferences (panel sizes, reset to defaults)
 * - Display settings (theme, font size)
 * - Keyboard shortcuts customization
 * - Data management (clear recent files, reset workspace)
 * - Persist all settings
 */

import { useState, useCallback } from 'react'
import { RotateCcw, Trash2, Keyboard, Monitor, X, AlertTriangle, Info } from 'lucide-react'
import {
  BrandDialog,
  BrandButton,
  BrandSlider,
  BrandSwitch,
  BrandSelect,
  BrandSelectValue,
  BrandSelectTrigger,
  BrandSelectContent,
  BrandSelectItem,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
} from '@creatorweave/ui'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useTheme } from '@/store/theme.store'
import { useT } from '@/i18n'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'

type SettingsTab = 'layout' | 'display' | 'shortcuts' | 'data'

interface WorkspaceSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkspaceSettingsDialog({ open, onOpenChange }: WorkspaceSettingsDialogProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<SettingsTab>('layout')
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [isTabTransitioning, setIsTabTransitioning] = useState(false)

  const handleTabChange = useCallback((tabId: SettingsTab) => {
    if (tabId !== activeTab) {
      setIsTabTransitioning(true)
      setActiveTab(tabId)
      setTimeout(() => setIsTabTransitioning(false), 150)
    }
  }, [activeTab])

  const {
    panelSizes,
    display,
    resetPanelSizes,
    resetToDefaults,
    setSidebarWidth,
    setConversationRatio,
    setPreviewRatio,
    setFontSize,
    setShowLineNumbers,
    setWordWrap,
    setShowMiniMap,
    clearRecentFiles,
    recentFiles,
  } = useWorkspacePreferencesStore()

  const { setTheme, mode } = useTheme()

  const handleResetLayout = () => {
    if (confirm(t('workspaceSettings.layout.resetLayoutConfirm'))) {
      resetPanelSizes()
    }
  }

  const handleResetAll = () => {
    if (confirm(t('workspaceSettings.data.resetAllConfirm'))) {
      resetToDefaults()
    }
  }

  const handleClearRecentFiles = () => {
    if (confirm(t('workspaceSettings.data.clearRecentConfirm'))) {
      clearRecentFiles()
    }
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'layout', label: t('workspaceSettings.tabs.layout'), icon: <Monitor className="h-4 w-4" /> },
    { id: 'display', label: t('workspaceSettings.tabs.display'), icon: <Monitor className="h-4 w-4" /> },
    { id: 'shortcuts', label: t('workspaceSettings.tabs.shortcuts'), icon: <Keyboard className="h-4 w-4" /> },
    { id: 'data', label: t('workspaceSettings.tabs.data'), icon: <Trash2 className="h-4 w-4" /> },
  ]

  return (
    <>
      <BrandDialog open={open} onOpenChange={onOpenChange}>
        <BrandDialogContent className="max-w-4xl dark:border-border dark:bg-card overflow-hidden">
          {/* Brand accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600 dark:from-primary-500 dark:via-primary-600 dark:to-primary-700" />
          <BrandDialogHeader className="pb-2">
            <BrandDialogTitle className="text-xl">{t('workspaceSettings.title')}</BrandDialogTitle>
            <BrandDialogClose asChild>
              <button className="absolute right-4 top-6 rounded-sm opacity-70 ring-offset-background transition-all duration-200 hover:opacity-100 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">{t('workspaceSettings.close')}</span>
              </button>
            </BrandDialogClose>
          </BrandDialogHeader>

          <div className="flex h-[60vh] flex-col sm:flex-row">
            {/* Sidebar tabs */}
            <div className="border-subtle flex border-r sm:w-48 sm:flex-col">
              <nav
                role="tablist"
                aria-label={t('workspaceSettings.tabs.ariaLabel')}
                className="flex space-x-1 p-2 sm:space-x-0 sm:space-y-1 sm:flex-col"
                onKeyDown={(e) => {
                  const tabIds = tabs.map((t) => t.id)
                  const currentIndex = tabIds.indexOf(activeTab)
                  let newIndex = currentIndex

                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    newIndex = (currentIndex + 1) % tabIds.length
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    newIndex = (currentIndex - 1 + tabIds.length) % tabIds.length
                  }

                  if (newIndex !== currentIndex) {
                    handleTabChange(tabIds[newIndex])
                  }
                }}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`tabpanel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    onClick={() => handleTabChange(tab.id)}
                    className={`group relative flex w-full items-center gap-2 rounded-md px-3 py-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                      activeTab === tab.id
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 border-l-2 border-primary-600 dark:border-primary-500 pl-2.5'
                        : 'text-secondary hover:bg-muted dark:text-muted dark:hover:bg-muted border-l-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700'
                    }`}
                  >
                    <span className={`transition-colors ${activeTab === tab.id ? 'text-primary-600 dark:text-primary-400' : 'text-secondary dark:text-muted group-hover:text-primary-600 dark:group-hover:text-primary-400'}`}>
                      {tab.icon}
                    </span>
                    <span className="truncate">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab content */}
            <div className={`flex-1 overflow-y-auto p-4 sm:p-6 transition-opacity duration-150 ${isTabTransitioning ? 'opacity-50' : 'opacity-100'}`} role="tabpanel" aria-label="Settings content">
              {/* Layout Tab */}
              {activeTab === 'layout' && (
                <div id="tabpanel-layout" role="tabpanel" aria-labelledby="tab-layout" className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-primary dark:text-primary-foreground">
                      {t('workspaceSettings.layout.title')}
                    </h3>
                    <p className="mt-1 text-sm text-tertiary dark:text-muted">
                      {t('workspaceSettings.layout.description')}
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label
                        htmlFor="sidebar-width-slider"
                        className="mb-2 block text-sm font-medium text-secondary dark:text-muted"
                      >
                        {t('workspaceSettings.layout.sidebarWidth', { value: panelSizes.sidebarWidth })}
                      </label>
                      <BrandSlider
                        id="sidebar-width-slider"
                        min={200}
                        max={400}
                        step={1}
                        value={[panelSizes.sidebarWidth]}
                        onValueChange={(value) => setSidebarWidth(value[0])}
                        aria-label={t('workspaceSettings.layout.sidebarWidth', { value: panelSizes.sidebarWidth })}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="conversation-ratio-slider"
                        className="mb-2 block text-sm font-medium text-secondary dark:text-muted"
                      >
                        {t('workspaceSettings.layout.conversationArea', {
                          value: panelSizes.conversationRatio,
                        })}
                      </label>
                      <BrandSlider
                        id="conversation-ratio-slider"
                        min={20}
                        max={80}
                        step={1}
                        value={[panelSizes.conversationRatio]}
                        onValueChange={(value) => setConversationRatio(value[0])}
                        aria-label={t('workspaceSettings.layout.conversationArea', { value: panelSizes.conversationRatio })}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="preview-ratio-slider"
                        className="mb-2 block text-sm font-medium text-secondary dark:text-muted"
                      >
                        {t('workspaceSettings.layout.previewPanel', { value: panelSizes.previewRatio })}
                      </label>
                      <BrandSlider
                        id="preview-ratio-slider"
                        min={30}
                        max={80}
                        step={1}
                        value={[panelSizes.previewRatio]}
                        onValueChange={(value) => setPreviewRatio(value[0])}
                        aria-label={t('workspaceSettings.layout.previewPanel', { value: panelSizes.previewRatio })}
                      />
                    </div>
                  </div>

                  <div className="border-subtle flex gap-2 border-t pt-4">
                    <BrandButton variant="outline" onClick={handleResetLayout}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {t('workspaceSettings.layout.resetLayout')}
                    </BrandButton>
                  </div>
                </div>
              )}

              {/* Display Tab */}
              {activeTab === 'display' && (
                <div id="tabpanel-display" role="tabpanel" aria-labelledby="tab-display" className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-primary dark:text-primary-foreground">
                      {t('workspaceSettings.display.themeTitle')}
                    </h3>
                    <p className="mt-1 text-sm text-tertiary dark:text-muted">
                      {t('workspaceSettings.display.themeDescription')}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {(['light', 'dark', 'system'] as const).map((themeMode) => (
                      <button
                        key={themeMode}
                        onClick={() => setTheme(themeMode)}
                        className={`rounded-lg border-2 p-4 text-center capitalize transition-all duration-200 ${
                          mode === themeMode
                            ? 'dark:bg-primary-900/30 dark:text-primary-300 border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-subtle hover:border-primary-300 hover:scale-[1.02] dark:hover:border-border'
                        }`}
                      >
                        {t(`workspaceSettings.display.theme.${themeMode}`)}
                      </button>
                    ))}
                  </div>

                  <div className="border-subtle border-t pt-6">
                    <h3 className="text-lg font-semibold text-primary dark:text-primary-foreground">
                      {t('workspaceSettings.display.editorTitle')}
                    </h3>
                    <p className="mt-1 text-sm text-tertiary dark:text-muted">
                      {t('workspaceSettings.display.editorDescription')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-secondary dark:text-muted">
                        {t('workspaceSettings.display.fontSize')}
                      </label>
                      <BrandSelect
                        value={display.fontSize}
                        onValueChange={(value) =>
                          setFontSize(value as 'small' | 'medium' | 'large')
                        }
                      >
                        <BrandSelectTrigger className="border-subtle h-10 w-full rounded-md border">
                          <BrandSelectValue />
                        </BrandSelectTrigger>
                        <BrandSelectContent>
                          <BrandSelectItem value="small">{t('workspaceSettings.display.font.small')}</BrandSelectItem>
                          <BrandSelectItem value="medium">{t('workspaceSettings.display.font.medium')}</BrandSelectItem>
                          <BrandSelectItem value="large">{t('workspaceSettings.display.font.large')}</BrandSelectItem>
                        </BrandSelectContent>
                      </BrandSelect>
                    </div>

                    <div className="flex items-center justify-between">
                      <label htmlFor="show-line-numbers" className="text-sm font-medium text-secondary dark:text-muted cursor-pointer">
                        {t('workspaceSettings.display.showLineNumbers')}
                      </label>
                      <BrandSwitch
                        id="show-line-numbers"
                        checked={display.showLineNumbers}
                        onCheckedChange={setShowLineNumbers}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label htmlFor="word-wrap" className="text-sm font-medium text-secondary dark:text-muted cursor-pointer">
                        {t('workspaceSettings.display.wordWrap')}
                      </label>
                      <BrandSwitch
                        id="word-wrap"
                        checked={display.wordWrap}
                        onCheckedChange={setWordWrap}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label htmlFor="show-minimap" className="text-sm font-medium text-secondary dark:text-muted cursor-pointer">
                        {t('workspaceSettings.display.showMiniMap')}
                      </label>
                      <BrandSwitch
                        id="show-minimap"
                        checked={display.showMiniMap}
                        onCheckedChange={setShowMiniMap}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Shortcuts Tab */}
              {activeTab === 'shortcuts' && (
                <div id="tabpanel-shortcuts" role="tabpanel" aria-labelledby="tab-shortcuts" className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-primary dark:text-primary-foreground">
                      {t('workspaceSettings.shortcuts.title')}
                    </h3>
                    <p className="mt-1 text-sm text-tertiary dark:text-muted">
                      {t('workspaceSettings.shortcuts.description')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="border-subtle flex items-center justify-between rounded-md border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-primary dark:text-primary-foreground">
                          {t('workspaceSettings.shortcuts.showAllTitle')}
                        </div>
                        <div className="text-xs text-tertiary dark:text-muted">
                          {t('workspaceSettings.shortcuts.showAllDescription')}
                        </div>
                      </div>
                      <BrandButton variant="outline" onClick={() => setShowShortcutsHelp(true)}>
                        <Keyboard className="mr-2 h-4 w-4" />
                        {t('workspaceSettings.shortcuts.view')}
                      </BrandButton>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 border-subtle rounded-md border bg-muted p-4 dark:bg-muted">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary-500 dark:text-primary-400" />
                    <p className="text-sm text-secondary dark:text-muted">
                      <strong>{t('workspaceSettings.shortcuts.tipLabel')}</strong>{' '}
                      <kbd className="border-subtle rounded border bg-card px-1.5 py-0.5 font-mono text-xs dark:bg-card">
                        {t('workspaceSettings.shortcuts.tipCommand')}
                      </kbd>{' '}
                      {t('workspaceSettings.shortcuts.tipSuffix')}
                    </p>
                  </div>
                </div>
              )}

              {/* Data Tab */}
              {activeTab === 'data' && (
                <div id="tabpanel-data" role="tabpanel" aria-labelledby="tab-data" className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-primary dark:text-primary-foreground">
                      {t('workspaceSettings.data.title')}
                    </h3>
                    <p className="mt-1 text-sm text-tertiary dark:text-muted">
                      {t('workspaceSettings.data.description')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="border-subtle flex items-center justify-between rounded-md border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-primary dark:text-primary-foreground">
                          {t('workspaceSettings.data.recentFilesTitle')}
                        </div>
                        <div className="text-xs text-tertiary dark:text-muted">
                          {t('workspaceSettings.data.recentFilesCount', {
                            count: recentFiles.length,
                          })}
                        </div>
                      </div>
                      <BrandButton
                        variant="outline"
                        onClick={handleClearRecentFiles}
                        disabled={recentFiles.length === 0}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('workspaceSettings.data.clear')}
                      </BrandButton>
                    </div>

                    <div className="flex items-start gap-3 rounded-md border border-warning bg-warning-50 p-4 dark:border-warning dark:bg-warning-bg">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning dark:text-warning-200" />
                      <div>
                        <p className="text-sm font-medium text-warning dark:text-warning-200">
                          {t('workspaceSettings.data.warningTitle')}
                        </p>
                        <p className="mt-1 text-xs text-warning dark:text-warning-200">
                          {t('workspaceSettings.data.warningDescription')}
                        </p>
                      </div>
                    </div>

                    <div className="border-subtle border-t pt-4">
                      <h4 className="mb-2 text-sm font-medium text-primary dark:text-primary-foreground">
                        {t('workspaceSettings.data.resetAllTitle')}
                      </h4>
                      <p className="mb-3 text-xs text-tertiary dark:text-muted">
                        {t('workspaceSettings.data.resetAllDescription')}
                      </p>
                      <BrandButton variant="outline" onClick={handleResetAll}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('workspaceSettings.data.resetAll')}
                      </BrandButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-subtle flex justify-end border-t px-6 py-4">
            <BrandButton variant="default" onClick={() => onOpenChange(false)}>
              {t('workspaceSettings.done')}
            </BrandButton>
          </div>
        </BrandDialogContent>
      </BrandDialog>

      {/* Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp} />
    </>
  )
}
