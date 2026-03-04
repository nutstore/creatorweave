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

import { useState } from 'react'
import { Settings, RotateCcw, Trash2, Keyboard, Monitor, X } from 'lucide-react'
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
} from '@browser-fs-analyzer/ui'
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
    { id: 'display', label: t('workspaceSettings.tabs.display'), icon: <Settings className="h-4 w-4" /> },
    { id: 'shortcuts', label: t('workspaceSettings.tabs.shortcuts'), icon: <Keyboard className="h-4 w-4" /> },
    { id: 'data', label: t('workspaceSettings.tabs.data'), icon: <Trash2 className="h-4 w-4" /> },
  ]

  return (
    <>
      <BrandDialog open={open} onOpenChange={onOpenChange}>
        <BrandDialogContent className="max-w-4xl dark:border-neutral-700 dark:bg-neutral-900">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('workspaceSettings.title')}</BrandDialogTitle>
            <BrandDialogClose asChild>
              <button className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">{t('workspaceSettings.close')}</span>
              </button>
            </BrandDialogClose>
          </BrandDialogHeader>

          <div className="flex h-[60vh]">
            {/* Sidebar tabs */}
            <div className="border-subtle w-48 border-r">
              <nav className="space-y-1 p-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'dark:bg-primary-900/30 dark:text-primary-300 bg-primary-50 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Layout Tab */}
              {activeTab === 'layout' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {t('workspaceSettings.layout.title')}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {t('workspaceSettings.layout.description')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {t('workspaceSettings.layout.sidebarWidth', { value: panelSizes.sidebarWidth })}
                      </label>
                      <BrandSlider
                        min={200}
                        max={400}
                        step={1}
                        value={[panelSizes.sidebarWidth]}
                        onValueChange={(value) => setSidebarWidth(value[0])}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {t('workspaceSettings.layout.conversationArea', {
                          value: panelSizes.conversationRatio,
                        })}
                      </label>
                      <BrandSlider
                        min={20}
                        max={80}
                        step={1}
                        value={[panelSizes.conversationRatio]}
                        onValueChange={(value) => setConversationRatio(value[0])}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {t('workspaceSettings.layout.previewPanel', { value: panelSizes.previewRatio })}
                      </label>
                      <BrandSlider
                        min={30}
                        max={80}
                        step={1}
                        value={[panelSizes.previewRatio]}
                        onValueChange={(value) => setPreviewRatio(value[0])}
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
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {t('workspaceSettings.display.themeTitle')}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {t('workspaceSettings.display.themeDescription')}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['light', 'dark', 'system'] as const).map((themeMode) => (
                      <button
                        key={themeMode}
                        onClick={() => setTheme(themeMode)}
                        className={`rounded-lg border-2 p-3 text-center capitalize transition-colors ${
                          mode === themeMode
                            ? 'dark:bg-primary-900/30 dark:text-primary-300 border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-subtle hover:border-neutral-300 dark:hover:border-neutral-700'
                        }`}
                      >
                        {t(`workspaceSettings.display.theme.${themeMode}`)}
                      </button>
                    ))}
                  </div>

                  <div className="border-subtle border-t pt-6">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {t('workspaceSettings.display.editorTitle')}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {t('workspaceSettings.display.editorDescription')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {t('workspaceSettings.display.showLineNumbers')}
                      </label>
                      <BrandSwitch
                        checked={display.showLineNumbers}
                        onCheckedChange={setShowLineNumbers}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {t('workspaceSettings.display.wordWrap')}
                      </label>
                      <BrandSwitch checked={display.wordWrap} onCheckedChange={setWordWrap} />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {t('workspaceSettings.display.showMiniMap')}
                      </label>
                      <BrandSwitch checked={display.showMiniMap} onCheckedChange={setShowMiniMap} />
                    </div>
                  </div>
                </div>
              )}

              {/* Shortcuts Tab */}
              {activeTab === 'shortcuts' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {t('workspaceSettings.shortcuts.title')}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {t('workspaceSettings.shortcuts.description')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="border-subtle flex items-center justify-between rounded-md border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {t('workspaceSettings.shortcuts.showAllTitle')}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {t('workspaceSettings.shortcuts.showAllDescription')}
                        </div>
                      </div>
                      <BrandButton variant="outline" onClick={() => setShowShortcutsHelp(true)}>
                        <Keyboard className="mr-2 h-4 w-4" />
                        {t('workspaceSettings.shortcuts.view')}
                      </BrandButton>
                    </div>
                  </div>

                  <div className="border-subtle rounded-md border bg-neutral-50 p-4 dark:bg-neutral-800">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      <strong>{t('workspaceSettings.shortcuts.tipLabel')}</strong>{' '}
                      <kbd className="border-subtle rounded border bg-white px-1.5 py-0.5 dark:bg-neutral-900">
                        {t('workspaceSettings.shortcuts.tipCommand')}
                      </kbd>{' '}
                      {t('workspaceSettings.shortcuts.tipSuffix')}
                    </p>
                  </div>
                </div>
              )}

              {/* Data Tab */}
              {activeTab === 'data' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {t('workspaceSettings.data.title')}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {t('workspaceSettings.data.description')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="border-subtle flex items-center justify-between rounded-md border px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {t('workspaceSettings.data.recentFilesTitle')}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
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

                    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>{t('workspaceSettings.data.warningTitle')}</strong>{' '}
                        {t('workspaceSettings.data.warningDescription')}
                      </p>
                    </div>

                    <div className="border-subtle border-t pt-4">
                      <h4 className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {t('workspaceSettings.data.resetAllTitle')}
                      </h4>
                      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
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
