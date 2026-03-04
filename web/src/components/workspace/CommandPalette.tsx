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
} from '@browser-fs-analyzer/ui'
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
      const category = command.category || 'General'
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(command)
    })
    return groups
  }, [filteredCommands])

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
    }
  }, [open])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const flatCommands = filteredCommands.filter((c) => !c.disabled)

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
      <BrandDialogContent className="max-w-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <BrandDialogHeader className="dark:border-neutral-700">
          <BrandDialogTitle>
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary-600" />
              <span>Command Palette</span>
            </div>
          </BrandDialogTitle>
        </BrandDialogHeader>

        <BrandDialogBody className="space-y-4 text-neutral-900 dark:text-neutral-100">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
            <input
              ref={inputRef}
              type="text"
              placeholder={t('commandPalette.placeholder') || 'Type a command or search...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="border-subtle w-full rounded-lg border bg-white px-4 py-2 pl-10 text-sm outline-none placeholder:text-neutral-400 focus:border-primary-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
          </div>

          {/* Commands list */}
          <div className="max-h-[60vh] overflow-y-auto">
            {Array.from(groupedCommands.entries()).map(([category, cmds], groupIndex) => (
              <div key={category} className={groupIndex > 0 ? 'mt-4' : ''}>
                <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
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
                              : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800'
                        }`}
                      >
                        {command.icon && <span className="flex-shrink-0">{command.icon}</span>}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                            {command.label}
                          </div>
                          {command.description && (
                            <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
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
              <div className="py-12 text-center text-sm text-neutral-400 dark:text-neutral-500">
                No commands found for "{query}"
              </div>
            )}
          </div>

          {/* Footer hints */}
          <div className="border-subtle flex items-center justify-between border-t pt-3 text-xs text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
            <div className="flex gap-4">
              <span>
                <kbd className="border-subtle rounded border bg-white px-1.5 py-0.5 dark:border-neutral-600 dark:bg-neutral-800">
                  ↑↓
                </kbd>{' '}
                Navigate
              </span>
              <span>
                <kbd className="border-subtle rounded border bg-white px-1.5 py-0.5 dark:border-neutral-600 dark:bg-neutral-800">
                  Enter
                </kbd>{' '}
                Select
              </span>
              <span>
                <kbd className="border-subtle rounded border bg-white px-1.5 py-0.5 dark:border-neutral-600 dark:bg-neutral-800">
                  Esc
                </kbd>{' '}
                Close
              </span>
            </div>
          </div>
        </BrandDialogBody>
      </BrandDialogContent>
    </BrandDialog>
  )
}
