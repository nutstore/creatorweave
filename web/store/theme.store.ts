/**
 * Theme Store - manages application theme (light/dark mode and accent colors).
 *
 * Features:
 * - Light/dark mode toggle
 * - System preference detection
 * - Accent color customization
 * - Persisted to localStorage
 * - Applies theme classes to document root
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

export type AccentColor =
  | 'teal' // 默认青色
  | 'rose' // 玫瑰红
  | 'amber' // 琥珀橙
  | 'violet' // 紫罗兰
  | 'emerald' // 翡翠绿
  | 'slate' // 石板灰

export interface AccentColorConfig {
  name: string
  hue: number
  saturation: number
  lightness: number
}

export const ACCENT_COLORS: Record<AccentColor, AccentColorConfig> = {
  teal: {
    name: '青色',
    hue: 174,
    saturation: 45,
    lightness: 47,
  },
  rose: {
    name: '玫瑰',
    hue: 350,
    saturation: 50,
    lightness: 50,
  },
  amber: {
    name: '琥珀',
    hue: 38,
    saturation: 60,
    lightness: 50,
  },
  violet: {
    name: '紫罗兰',
    hue: 270,
    saturation: 45,
    lightness: 55,
  },
  emerald: {
    name: '翡翠',
    hue: 150,
    saturation: 45,
    lightness: 40,
  },
  slate: {
    name: '石墨',
    hue: 215,
    saturation: 15,
    lightness: 40,
  },
}

/**
 * Theme store state
 */
interface ThemeState {
  mode: ThemeMode
  resolvedTheme: 'light' | 'dark'
  accentColor: AccentColor
  setTheme: (mode: ThemeMode) => void
  setAccentColor: (color: AccentColor) => void
}

/**
 * Get system theme preference
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply theme to document root
 */
function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#ffffff')
  }
}

/**
 * Apply accent color to document root
 * Updates CSS custom properties for the primary color palette
 */
function applyAccentColor(accentColor: AccentColor, theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return

  const config = ACCENT_COLORS[accentColor]
  const { hue, saturation, lightness } = config

  // Light theme values — use config lightness as base, derive darker shades
  const lightValues = {
    '--primary': `${hue} ${saturation}% ${lightness}%`,
    '--primary-foreground': '0 0% 100%',
    '--primary-50': `${hue} ${Math.max(10, saturation - 15)}% 97%`,
    '--primary-100': `${hue} ${Math.max(15, saturation - 15)}% 93%`,
    '--primary-400': `${hue} ${Math.max(20, saturation - 5)}% ${Math.max(40, lightness + 6)}%`,
    '--primary-500': `${hue} ${saturation}% ${lightness}%`,
    '--primary-600': `${hue} ${Math.max(25, saturation - 5)}% ${Math.max(20, lightness - 7)}%`,
    '--primary-700': `${hue} ${Math.max(20, saturation - 10)}% ${Math.max(15, lightness - 13)}%`,
    '--primary-800': `${hue} ${Math.max(15, saturation - 15)}% ${Math.max(10, lightness - 17)}%`,
    '--ring': `${hue} ${saturation}% ${lightness}%`,
  }

  // Dark theme values — brighter primary for contrast on dark bg
  const darkLightness = Math.min(60, lightness + 13)
  const darkValues = {
    '--primary': `${hue} ${saturation}% ${darkLightness}%`,
    '--primary-foreground': '210 10% 95%',
    '--primary-50': `${hue} ${Math.max(15, saturation - 10)}% 12%`,
    '--primary-100': `${hue} ${Math.max(20, saturation - 7)}% 18%`,
    '--primary-400': `${hue} ${saturation}% ${darkLightness}%`,
    '--primary-500': `${hue} ${saturation}% ${lightness}%`,
    '--primary-600': `${hue} ${saturation}% ${darkLightness}%`,
    '--primary-700': `${hue} ${Math.max(25, saturation - 5)}% ${Math.min(65, darkLightness + 7)}%`,
    '--primary-800': `${hue} ${Math.max(20, saturation - 10)}% ${Math.min(60, darkLightness + 3)}%`,
    '--ring': `${hue} ${Math.max(25, saturation - 5)}% 50%`,
  }

  const values = theme === 'dark' ? darkValues : lightValues
  const root = document.documentElement

  Object.entries(values).forEach(([property, value]) => {
    root.style.setProperty(property, value)
  })
}

/**
 * Resolve theme mode to actual theme
 */
function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return getSystemTheme()
  }
  return mode
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolvedTheme: resolveThemeMode('system'),
      accentColor: 'teal',

      setTheme: (mode) => {
        const resolvedTheme = resolveThemeMode(mode)
        applyTheme(resolvedTheme)
        // Re-apply accent color when theme changes
        applyAccentColor(get().accentColor, resolvedTheme)
        set({ mode, resolvedTheme })
      },

      setAccentColor: (color) => {
        const { resolvedTheme } = get()
        applyAccentColor(color, resolvedTheme)
        set({ accentColor: color })
      },
    }),
    {
      name: 'bfosa-theme',
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydration
        if (state) {
          const resolvedTheme = resolveThemeMode(state.mode)
          applyTheme(resolvedTheme)
          state.resolvedTheme = resolvedTheme
          // Apply accent color
          if (state.accentColor) {
            applyAccentColor(state.accentColor, resolvedTheme)
          }
        }
      },
    }
  )
)

/**
 * Initialize theme system
 * - Listen for system theme changes when in system mode
 * - Apply initial theme and accent color
 */
export function initializeTheme() {
  const { mode, accentColor } = useThemeStore.getState()

  // Apply initial theme
  const resolvedTheme = resolveThemeMode(mode)
  applyTheme(resolvedTheme)

  // Apply accent color
  applyAccentColor(accentColor || 'teal', resolvedTheme)

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const currentMode = useThemeStore.getState().mode
      if (currentMode === 'system') {
        const newTheme = e.matches ? 'dark' : 'light'
        applyTheme(newTheme)
        const currentAccent = useThemeStore.getState().accentColor
        applyAccentColor(currentAccent, newTheme)
        useThemeStore.setState({ resolvedTheme: newTheme })
      }
    }

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
    } else {
      // Legacy browsers
      mediaQuery.addListener(handleSystemThemeChange)
    }

    // Return cleanup function
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange)
      } else {
        mediaQuery.removeListener(handleSystemThemeChange)
      }
    }
  }

  return () => {}
}

/**
 * Hook to get current theme and toggle function
 */
export function useTheme() {
  const { mode, resolvedTheme, accentColor, setTheme, setAccentColor } = useThemeStore()

  const toggleTheme = () => {
    // If current mode is 'system', toggle to light, then dark
    // If current mode is 'light' or 'dark', toggle between them
    const newMode: ThemeMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'light'
    setTheme(newMode)
  }

  return {
    mode,
    theme: resolvedTheme,
    accentColor,
    setTheme,
    setAccentColor,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
  }
}

// Export types
export type { ThemeState }
