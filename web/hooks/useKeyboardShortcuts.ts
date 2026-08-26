/**
 * Keyboard Shortcuts System
 *
 * Provides global keyboard shortcuts with conflict prevention.
 * Shortcuts are registered with priority and can be disabled.
 */

import { useEffect, useCallback, useRef } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  description: string
  handler: (e: KeyboardEvent) => void
  disabled?: boolean
  priority?: number // Higher priority shortcuts are checked first
}

interface ShortcutRegistry {
  shortcuts: Map<string, KeyboardShortcut>
  listeners: Set<() => void>
}

// Global registry for shortcuts
const registry: ShortcutRegistry = {
  shortcuts: new Map(),
  listeners: new Set(),
}

/**
 * Generate a unique key for a shortcut combination
 */
function getShortcutKey(
  shortcut: Omit<KeyboardShortcut, 'handler' | 'description' | 'disabled' | 'priority'>
): string {
  const parts = []
  if (shortcut.ctrlKey) parts.push('ctrl')
  if (shortcut.metaKey) parts.push('meta')
  if (shortcut.shiftKey) parts.push('shift')
  if (shortcut.altKey) parts.push('alt')
  parts.push(shortcut.key.toLowerCase())
  return parts.join('+')
}

/**
 * Check if a keyboard event matches a shortcut
 */
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    !!event.ctrlKey === !!shortcut.ctrlKey &&
    !!event.metaKey === !!shortcut.metaKey &&
    !!event.shiftKey === !!shortcut.shiftKey &&
    !!event.altKey === !!shortcut.altKey
  )
}

/**
 * Format shortcut key for display
 */
export function formatShortcutKey(
  shortcut: Omit<KeyboardShortcut, 'handler' | 'description' | 'disabled' | 'priority'>
): string {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const parts = []

  if (shortcut.ctrlKey) parts.push(isMac ? '⌃' : 'Ctrl')
  if (shortcut.metaKey) parts.push(isMac ? '⌘' : 'Win')
  if (shortcut.shiftKey) parts.push(isMac ? '⇧' : 'Shift')
  if (shortcut.altKey) parts.push(isMac ? '⌥' : 'Alt')

  // Capitalize single letters
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key
  parts.push(key)

  return isMac ? parts.join('') : parts.join('+')
}

/**
 * Register a keyboard shortcut
 * Returns cleanup function
 */
export function registerShortcut(shortcut: KeyboardShortcut): () => void {
  const key = getShortcutKey(shortcut)

  // Add or update shortcut
  registry.shortcuts.set(key, shortcut)

  // Notify listeners
  registry.listeners.forEach((listener) => listener())

  // Return cleanup function
  return () => {
    registry.shortcuts.delete(key)
    registry.listeners.forEach((listener) => listener())
  }
}

/**
 * Hook to handle keyboard shortcuts
 */
export function useKeyboardShortcuts() {
  const handlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)

  useEffect(() => {
    // Global keyboard event handler
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if in input field (unless it's a specific shortcut)
      const target = event.target as HTMLElement
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.getAttribute('contenteditable') === 'true'

      // Sort shortcuts by priority (descending)
      const sortedShortcuts = Array.from(registry.shortcuts.values()).sort(
        (a, b) => (b.priority || 0) - (a.priority || 0)
      )

      // Find matching shortcut
      for (const shortcut of sortedShortcuts) {
        if (shortcut.disabled) continue

        // Skip input-specific shortcuts if not in input
        if (!isInputField && shortcut.key.length > 1) continue

        if (matchesShortcut(event, shortcut)) {
          event.preventDefault()
          event.stopPropagation()
          shortcut.handler(event)
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    handlerRef.current = handleKeyDown

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      handlerRef.current = null
    }
  }, [])

  /**
   * Register a shortcut with automatic cleanup
   */
  const registerShortcutCallback = useCallback((shortcut: KeyboardShortcut) => {
    return registerShortcut(shortcut)
  }, [])

  /**
   * Get all registered shortcuts
   */
  const getAllShortcuts = useCallback(() => {
    return Array.from(registry.shortcuts.values())
  }, [])

  return {
    registerShortcut: registerShortcutCallback,
    getAllShortcuts,
  }
}

/**
 * Hook to register a single shortcut
 */
export function useShortcut(shortcut: KeyboardShortcut) {
  useEffect(() => {
    if (shortcut.disabled) return

    const cleanup = registerShortcut(shortcut)
    return cleanup
  }, [shortcut])
}

/**
 * Default application shortcuts
 *
 * IMPORTANT: This list must stay in sync with the actual keydown handlers
 * in WorkspaceLayout.tsx. Each entry here must correspond to a real,
 * implemented global shortcut.
 *
 * `labelKey` references a translation key under `keyboardShortcuts.actions.*`
 * that resolves to the localized description shown in the help dialog.
 */
export const DEFAULT_SHORTCUTS: (Omit<KeyboardShortcut, 'handler' | 'disabled' | 'priority'> & {
  labelKey: string
})[] = [
  {
    key: 'k',
    ctrlKey: true,
    metaKey: true,
    description: 'Open command palette',
    labelKey: 'keyboardShortcuts.actions.openCommandPalette',
  },
  {
    key: 'p',
    ctrlKey: true,
    metaKey: true,
    description: 'Toggle project switcher',
    labelKey: 'keyboardShortcuts.actions.toggleProjectSwitcher',
  },
  {
    key: 'g',
    ctrlKey: true,
    metaKey: true,
    description: 'Go to file',
    labelKey: 'keyboardShortcuts.actions.goToFile',
  },
  {
    key: 'b',
    ctrlKey: true,
    metaKey: true,
    description: 'Toggle sidebar',
    labelKey: 'keyboardShortcuts.actions.toggleSidebar',
  },
  {
    key: ',',
    ctrlKey: true,
    metaKey: true,
    description: 'Open workspace settings',
    labelKey: 'keyboardShortcuts.actions.openWorkspaceSettings',
  },
  {
    key: '/',
    ctrlKey: true,
    metaKey: true,
    description: 'Toggle this shortcuts help',
    labelKey: 'keyboardShortcuts.actions.toggleShortcutsHelp',
  },
  {
    key: 'Escape',
    description: 'Close panels / dialogs',
    labelKey: 'keyboardShortcuts.actions.closePanels',
  },
]
