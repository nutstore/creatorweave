import { Folder, Moon, Puzzle, X, Bot } from 'lucide-react'
import type { PluginInstance } from '@/types/plugin'

export type AppView = 'home' | 'plugins' | 'agent'

interface HeaderProps {
  onViewChange?: (view: AppView) => void
  currentView?: AppView
  selectedPlugins?: PluginInstance[]
  onClearPlugin?: () => void
}

export function Header({
  onViewChange,
  currentView = 'home',
  selectedPlugins = [],
  onClearPlugin,
}: HeaderProps) {
  const pluginCount = selectedPlugins.length

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Folder className="h-6 w-6 text-primary-600" />
            <h1 className="text-xl font-bold text-neutral-900">Browser File System Analyzer</h1>
          </div>

          {onViewChange && (
            <nav className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onViewChange('home')}
                className={`nav-item ${
                  currentView === 'home' ? 'nav-item-active' : 'nav-item-inactive'
                }`}
              >
                分析
              </button>
              <button
                type="button"
                onClick={() => onViewChange('plugins')}
                className={`nav-item flex items-center gap-1.5 ${
                  currentView === 'plugins' ? 'nav-item-active' : 'nav-item-inactive'
                }`}
              >
                <Puzzle className="h-4 w-4" />
                插件
                {pluginCount > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                    {pluginCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onViewChange('agent')}
                className={`nav-item flex items-center gap-1.5 ${
                  currentView === 'agent' ? 'nav-item-active' : 'nav-item-inactive'
                }`}
              >
                <Bot className="h-4 w-4" />
                AI 助手
              </button>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Selected plugins indicator */}
          {pluginCount > 0 && onClearPlugin && (
            <div className="hidden items-center gap-2 rounded-lg bg-success-bg px-3 py-1.5 text-sm sm:flex">
              <Puzzle className="h-4 w-4 text-success" />
              <span className="font-medium text-success">
                {pluginCount === 1
                  ? selectedPlugins[0].metadata.name
                  : `${pluginCount} plugins selected`}
              </span>
              <button
                type="button"
                onClick={onClearPlugin}
                className="rounded p-0.5 text-success hover:bg-success/20"
                title="Clear plugins"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            className="btn-icon rounded-lg text-neutral-600 hover:bg-neutral-100"
            aria-label="Toggle theme"
          >
            <Moon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
