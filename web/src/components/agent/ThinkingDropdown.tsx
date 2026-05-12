/**
 * ThinkingDropdown — thinking mode toggle with level selector.
 */

import { useState, useEffect } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
import { BrandSwitch } from '@creatorweave/ui'
import { useT } from '@/i18n'
import type { ThinkingLevel } from '@mariozechner/pi-ai'

interface ThinkingDropdownProps {
  enableThinking: boolean
  thinkingLevel: ThinkingLevel
  setEnableThinking: (enabled: boolean) => void
  setThinkingLevel: (level: ThinkingLevel) => void
}

export function ThinkingDropdown({
  enableThinking,
  thinkingLevel,
  setEnableThinking,
  setThinkingLevel,
}: ThinkingDropdownProps) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.thinking-dropdown-container')) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const levels: { value: ThinkingLevel; label: string }[] = [
    { value: 'minimal', label: t('conversation.thinkingLevels.minimal') },
    { value: 'low', label: t('conversation.thinkingLevels.low') },
    { value: 'medium', label: t('conversation.thinkingLevels.medium') },
    { value: 'high', label: t('conversation.thinkingLevels.high') },
    { value: 'xhigh', label: t('conversation.thinkingLevels.xhigh') },
  ]

  return (
    <div className="thinking-dropdown-container relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          enableThinking
            ? 'border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 bg-primary-50 text-primary-700 dark:border-primary-800'
            : 'border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500'
        }`}
      >
        <Brain className="h-3 w-3" />
        <span className="max-w-[72px] truncate">
          {enableThinking
            ? t(`conversation.thinkingLevels.${thinkingLevel}`)
            : t('conversation.thinking')}
        </span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full right-0 z-50 mb-1.5 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-secondary dark:text-neutral-300">
              {t('conversation.thinkingMode')}
            </span>
            <BrandSwitch
              checked={enableThinking}
              onCheckedChange={(checked) => {
                setEnableThinking(checked)
              }}
            />
          </div>
          {enableThinking && (
            <div className="border-t border-neutral-100 px-2 py-1.5 dark:border-neutral-800">
              <div className="grid grid-cols-5 gap-1">
                {levels.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setThinkingLevel(value)
                      setIsOpen(false)
                    }}
                    className={`rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
                      thinkingLevel === value
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
