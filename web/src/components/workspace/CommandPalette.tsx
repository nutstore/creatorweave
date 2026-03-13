/**
 * Command Palette - quick access to all actions and features.
 *
 * Activated via Ctrl/Cmd+K
 * Provides fuzzy search over all commands
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Search, Terminal } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
} from '@creatorweave/ui'
import { useT } from '@/i18n'

export interface Command {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  keywords?: string[]
  handler: () => void
  category?: string
  disabled?: boolean
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: Command[]
}

export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const tf = useCallback(
    (key: string, fallback: string, params?: Record<string, string | number>) => {
      const value = t(key, params)
      return !value || value === key ? fallback : value
    },
    [t]
  )

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands

    const lowerQuery = query.toLowerCase()

    return commands.filter((command) => {
      // Search in label, description, keywords, and category
      return (
        command.label.toLowerCase().includes(lowerQuery) ||
        command.description?.toLowerCase().includes(lowerQuery) ||
        command.keywords?.some((k) => k.toLowerCase().includes(lowerQuery)) ||
        command.category?.toLowerCase().includes(lowerQuery)
      )
    })
  }, [commands, query])

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups = new Map<string, Command[]>()
    filteredCommands.forEach((command) => {
      const category = command.category || tf('commandPalette.general', 'General')
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(command)
    })
    return groups
  }, [filteredCommands, tf])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    } else {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const flatCommands = filteredCommands.filter((c) => !c.disabled)

      if (flatCommands.length === 0) {
        if (e.key === 'Escape') {
          e.preventDefault()
          onOpenChange(false)
          setQuery('')
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % flatCommands.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + flatCommands.length) % flatCommands.length)
          break
        case 'Enter':
          e.preventDefault()
          {
            const selected = flatCommands[selectedIndex]
            if (selected) {
              selected.handler()
              onOpenChange(false)
              setQuery('')
            }
          }
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          setQuery('')
          break
      }
    },
    [filteredCommands, selectedIndex, onOpenChange]
  )

  // Handle command execution
  const handleCommandClick = useCallback(
    (command: Command) => {
      if (command.disabled) return
      command.handler()
      onOpenChange(false)
      setQuery('')
    },
    [onOpenChange]
  )

  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <BrandDialogContent className="max-w-2xl dark:border-border dark:bg-card">
        <BrandDialogHeader className="dark:border-border">
          <BrandDialogTitle>
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary-600" />
              <span>{tf('commandPalette.title', 'Command Palette')}</span>
            </div>
          </BrandDialogTitle>
        </BrandDialogHeader>

        <BrandDialogBody className="space-y-4 text-primary dark:text-primary-foreground">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary dark:text-muted" />
            <input
              ref={inputRef}
              type="text"
              placeholder={tf('commandPalette.placeholder', 'Type a command or search...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="border-subtle w-full rounded-lg border bg-card px-4 py-2 pl-10 text-sm outline-none placeholder:text-tertiary focus:border-primary-500 dark:border-border dark:bg-muted dark:text-primary-foreground dark:placeholder:text-tertiary"
            />
          </div>

          {/* Commands list */}
          <div className="max-h-[60vh] overflow-y-auto">
            {Array.from(groupedCommands.entries()).map(([category, cmds], groupIndex) => (
              <div key={category} className={groupIndex > 0 ? 'mt-4' : ''}>
                <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-tertiary dark:text-muted">
                  {category}
                </h3>
                <div className="space-y-1">
                  {cmds.map((command) => {
                    const globalIndex = filteredCommands.filter((c) => !c.disabled).indexOf(command)
                    const isSelected = globalIndex === selectedIndex

                    return (
                      <button
                        key={command.id}
                        onClick={() => handleCommandClick(command)}
                        disabled={command.disabled}
                        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? 'dark:bg-primary-900/30 dark:text-primary-300 bg-primary-50 text-primary-700'
                            : command.disabled
                              ? 'cursor-not-allowed opacity-50'
                              : 'text-secondary hover:bg-muted dark:text-muted dark:hover:bg-muted'
                        }`}
                      >
                        {command.icon && <span className="flex-shrink-0">{command.icon}</span>}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-primary dark:text-primary-foreground">
                            {command.label}
                          </div>
                          {command.description && (
                            <div className="truncate text-xs text-tertiary dark:text-muted">
                              {command.description}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {filteredCommands.length === 0 && (
              <div className="py-12 text-center text-sm text-tertiary dark:text-muted">
                {tf('commandPalette.noResults', 'No commands found for "{query}"', { query })}
              </div>
            )}
          </div>

          {/* Footer hints */}
          <div className="border-subtle flex items-center justify-between border-t pt-3 text-xs text-tertiary dark:border-border dark:text-muted">
            <div className="flex gap-4">
              <span>
                <kbd className="border-subtle rounded border bg-card px-1.5 py-0.5 dark:border-border dark:bg-muted">
                  ↑↓
                </kbd>{' '}
                {tf('commandPalette.navigate', 'Navigate')}
              </span>
              <span>
                <kbd className="border-subtle rounded border bg-card px-1.5 py-0.5 dark:border-border dark:bg-muted">
                  Enter
                </kbd>{' '}
                {tf('commandPalette.select', 'Select')}
              </span>
              <span>
                <kbd className="border-subtle rounded border bg-card px-1.5 py-0.5 dark:border-border dark:bg-muted">
                  Esc
                </kbd>{' '}
                {tf('commandPalette.close', 'Close')}
              </span>
            </div>
          </div>
        </BrandDialogBody>
      </BrandDialogContent>
    </BrandDialog>
  )
}
