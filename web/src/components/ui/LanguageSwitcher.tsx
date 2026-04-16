/**
 * LanguageSwitcher - Language switcher component
 *
 * Click-type language switch button, supports zh/en/ja/ko switching
 * Phase 5: Refactored to use brand components
 */

import { useState, useRef, useEffect } from 'react'
import { Globe } from 'lucide-react'
import { LOCALE_LABELS } from '@creatorweave/i18n'
import { useLocale } from '@/i18n'
import type { Locale } from '@/i18n'
import { BrandButton } from '@creatorweave/ui'

export function LanguageSwitcher() {
  const [locale, setLocale] = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = () => setIsOpen(!isOpen)

  const handleSelect = (selectedLocale: Locale) => {
    setLocale(selectedLocale)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <BrandButton iconButton variant="ghost" onClick={handleToggle}>
        <Globe className="h-4 w-4" />
      </BrandButton>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] whitespace-nowrap rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {(['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as Locale[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              className={cn(
                'flex w-full items-center justify-between gap-4 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800',
                locale === key && 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              )}
            >
              <span>{LOCALE_LABELS[key]}</span>
              {locale === key && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function cn(...classes: (string | undefined | boolean | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
