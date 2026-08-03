/**
 * Shared toolbar building blocks used by both SkillsManager (Manage tab)
 * and SkillDiscover (Discover tab).
 *
 * Extracting these eliminates ~32 lines of duplicated search/filter/refresh
 * JSX and guarantees visual consistency between the two tabs.
 */

import { Search, RefreshCw } from 'lucide-react'
import { BrandButton, Tabs, TabsList, TabsTrigger } from '@creatorweave/ui'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------

interface SkillSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel?: string
}

/** Search input with magnifier icon — identical styling in both tabs. */
export function SkillSearchInput({ value, onChange, placeholder, ariaLabel }: SkillSearchInputProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-100"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Segment-style filter
// ---------------------------------------------------------------------------

export interface SkillFilterOption {
  value: string
  label: string
  /** Optional count badge rendered after the label. */
  count?: number
}

interface SkillSegmentFilterProps {
  value: string
  onChange: (value: string) => void
  options: SkillFilterOption[]
}

/** Segment-style filter tabs with optional count badges. */
export function SkillSegmentFilter({ value, onChange, options }: SkillSegmentFilterProps) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList
        variant="segment"
        className="inline-flex h-8 shrink-0 rounded-md border border-neutral-200 bg-neutral-100/60 p-0.5 dark:border-neutral-700 dark:bg-neutral-800/40"
      >
        {options.map((opt) => (
          <TabsTrigger
            key={opt.value}
            variant="segment"
            value={opt.value}
            className="h-7 px-2.5 text-[11px]"
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className="ml-1 opacity-60">{opt.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Refresh button
// ---------------------------------------------------------------------------

interface SkillRefreshButtonProps {
  onClick: () => void
  disabled: boolean
  label: string
  /** Optional aria-label; falls back to `label` when omitted. */
  ariaLabel?: string
}

/** Ghost icon button with spin animation while loading. */
export function SkillRefreshButton({ onClick, disabled, label, ariaLabel }: SkillRefreshButtonProps) {
  return (
    <BrandButton
      variant="ghost"
      iconButton
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={ariaLabel ?? label}
      className="shrink-0"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', disabled && 'animate-spin')} />
    </BrandButton>
  )
}
