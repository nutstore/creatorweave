/**
 * Theme Toggle Component - switch between light/dark/system themes.
 *
 * Displays current theme and allows cycling through options.
 */

import { useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme, type ThemeMode } from '@/store/theme.store'
import { BrandButton, Tooltip, TooltipContent, TooltipTrigger } from '@creatorweave/ui'
import { useT } from '@/i18n'

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const t = useT()
  const { mode, setTheme, toggleTheme } = useTheme()
  const [showMenu, setShowMenu] = useState(false)

  const CurrentIcon = THEME_ICONS[mode]

  const handleThemeSelect = (selectedMode: ThemeMode) => {
    setTheme(selectedMode)
    setShowMenu(false)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Main toggle button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <BrandButton
            iconButton
            variant="ghost"
            onClick={toggleTheme}
            onContextMenu={(e) => {
              e.preventDefault()
              setShowMenu(!showMenu)
            }}
            className="relative"
          >
            <CurrentIcon className="h-4 w-4" />
          </BrandButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t('themeToggle.currentTheme', { theme: THEME_LABELS[mode] })} ({t('themeToggle.rightClickMenu')})
        </TooltipContent>
      </Tooltip>

      {/* Theme selection menu */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
            aria-hidden="true"
          />

          {/* Menu */}
          <div className="border-subtle absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border bg-white px-1.5 py-1 shadow-md dark:bg-neutral-900">
            {(Object.keys(THEME_LABELS) as ThemeMode[]).map((themeMode) => {
              const Icon = THEME_ICONS[themeMode]
              const isActive = mode === themeMode

              return (
                <button
                  key={themeMode}
                  onClick={() => handleThemeSelect(themeMode)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'dark:bg-primary-900/30 dark:text-primary-300 bg-primary-50 text-primary-700'
                      : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{THEME_LABELS[themeMode]}</span>
                  {isActive && <span className="ml-auto text-xs text-neutral-400">✓</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
