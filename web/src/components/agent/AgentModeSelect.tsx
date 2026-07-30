/**
 * AgentModeSelect - Three-state mode selector replacing the Plan/Act toggle.
 *
 * Modes:
 *   🔍 Plan  → agentMode='plan'                      (read-only, no writes)
 *   ⚡ Act   → agentMode='act', pageActionYolo=false  (writes, but each confirmed)
 *   🚀 YOLO  → agentMode='act', pageActionYolo=true   (writes auto-allowed, still URL-blacklist gated)
 *
 * The underlying system stays two-state (plan/act) + independent pageActionYolo;
 * this component is a UI affordance that maps the three visible options to the
 * correct combination of the agent mode and page-session YOLO state.
 *
 * Design: compact pill button → popover with three options.
 */

import { useState, useRef, useEffect } from 'react'
import { usePageActionSessionStore } from '@/store/page-action-session.store'
import { isSidePanelMode } from '@/agent/workspace-assistant-context'
import { useT } from '@/i18n'

export interface AgentModeSelectProps {
  /** Current agent mode ('plan' | 'act') */
  mode: 'plan' | 'act'
  /** Callback when the agent mode should change */
  onModeChange: (mode: 'plan' | 'act') => void
  /** Whether the selector is disabled */
  disabled?: boolean
  /** Additional CSS class */
  className?: string
}

type VisibleMode = 'plan' | 'act' | 'yolo'

// ── Visual config per mode ──────────────────────────────────────────────────
const MODE_CONFIG: Record<
  VisibleMode,
  {
    bgLight: string
    bgDark: string
    borderLight: string
    borderDark: string
    textLight: string
    textDark: string
    dotBg: string
  }
> = {
  plan: {
    // Subtle amber for "contemplation"
    bgLight: 'bg-amber-50',
    bgDark: 'dark:bg-amber-950/40',
    borderLight: 'border-amber-200/60',
    borderDark: 'dark:border-amber-800/50',
    textLight: 'text-amber-700',
    textDark: 'dark:text-amber-400',
    dotBg: 'bg-amber-400',
  },
  act: {
    // Confident blue for "action"
    bgLight: 'bg-blue-50',
    bgDark: 'dark:bg-blue-950/40',
    borderLight: 'border-blue-200/60',
    borderDark: 'dark:border-blue-800/50',
    textLight: 'text-blue-700',
    textDark: 'dark:text-blue-400',
    dotBg: 'bg-blue-500',
  },
  yolo: {
    // Bold purple for "autonomous"
    bgLight: 'bg-purple-50',
    bgDark: 'dark:bg-purple-950/40',
    borderLight: 'border-purple-200/60',
    borderDark: 'dark:border-purple-800/50',
    textLight: 'text-purple-700',
    textDark: 'dark:text-purple-400',
    dotBg: 'bg-purple-500',
  },
}

// ── Simple geometric SVG icons (no emoji) ────────────────────────────────────
const PlanIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    <path d="M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M3.22 12.78l1.42-1.42M11.36 4.64l1.42-1.42" />
  </svg>
)

const ActIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1L10 6h4l-3.5 2.5L12 14l-4-2.5L4 14l1.5-5.5L2 6h4L8 1z" />
  </svg>
)

const YoloIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8a6 6 0 0 1 12 0" />
    <path d="M2 8l-1 2M14 8l1 2" />
    <path d="M5 6l1.5 1.5M11 6l-1.5 1.5" />
    <path d="M6 11h4" />
  </svg>
)

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5l3 3 3-3" />
  </svg>
)

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 6.5l2.5 2.5 4.5-5" />
  </svg>
)

// ── Option rows for the dropdown ─────────────────────────────────────────────
function ModeOption({
  visibleMode,
  label,
  description,
  isSelected,
  onSelect,
}: {
  visibleMode: VisibleMode
  label: string
  description: string
  isSelected: boolean
  onSelect: () => void
}) {
  const config = MODE_CONFIG[visibleMode]
  return (
    <button
      onClick={onSelect}
      className={`
        flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors
        hover:bg-neutral-50 dark:hover:bg-neutral-800/50
      `}
    >
      {/* Icon */}
      <div className={`
        flex h-7 w-7 shrink-0 items-center justify-center rounded-md border
        ${config.bgLight} ${config.bgDark} ${config.borderLight} ${config.borderDark}
      `}>
        {visibleMode === 'plan' && <PlanIcon className={`h-3.5 w-3.5 ${config.textLight} ${config.textDark}`} />}
        {visibleMode === 'act' && <ActIcon className={`h-3.5 w-3.5 ${config.textLight} ${config.textDark}`} />}
        {visibleMode === 'yolo' && <YoloIcon className={`h-3.5 w-3.5 ${config.textLight} ${config.textDark}`} />}
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-bold uppercase tracking-wide ${config.textLight} ${config.textDark}`}>
          {label}
        </div>
        <div className="mt-0.5 text-[11px] leading-tight text-neutral-500 text-neutral-400 text-neutral-400 dark:text-neutral-400">
          {description}
        </div>
      </div>

      {/* Check mark if selected */}
      {isSelected && (
        <CheckIcon className={`h-3.5 w-3.5 shrink-0 ${config.textLight} ${config.textDark}`} />
      )}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function AgentModeSelect({
  mode,
  onModeChange,
  disabled = false,
  className = '',
}: AgentModeSelectProps) {
  const t = useT()
  const pageActionYolo = usePageActionSessionStore((s) => s.pageActionYolo)
  const setPageActionYolo = usePageActionSessionStore((s) => s.setPageActionYolo)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // YOLO is only relevant in side-panel mode (where page-action tools exist).
  // In a normal tab, hide it entirely — YOLO has no effect without page tools.
  const showYolo = isSidePanelMode()

  // Derive the visible mode from the two underlying states.
  // When not in side-panel mode, YOLO is never shown even if the flag is on.
  const visibleMode: VisibleMode =
    mode === 'plan' ? 'plan' : (showYolo && pageActionYolo) ? 'yolo' : 'act'
  const config = MODE_CONFIG[visibleMode]

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = (target: VisibleMode) => {
    if (target === 'plan') {
      // Switching to Plan: disable page writes and clear any prior YOLO approval.
      onModeChange('plan')
      setPageActionYolo(false)
    } else if (target === 'act') {
      // Switching to Act (confirmed): agentMode=act, yolo off
      onModeChange('act')
      setPageActionYolo(false)
    } else {
      // Switching to YOLO: agentMode=act, yolo on
      onModeChange('act')
      setPageActionYolo(true)
    }
    setOpen(false)
  }

  const visibleLabel =
    visibleMode === 'plan'
      ? t('agent.mode.plan')
      : visibleMode === 'act'
        ? t('agent.mode.act')
        : t('agent.mode.yolo')

  return (
    <div ref={containerRef} className={`relative inline-flex shrink-0 ${className}`}>
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-label={t('agent.mode.currentAriaLabel', { mode: visibleLabel })}
        className={`
          group relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap
          rounded-full border px-2.5 py-1
          text-[11px] font-semibold uppercase tracking-wider
          transition-all duration-200 ease-out
          ${config.bgLight} ${config.bgDark}
          ${config.borderLight} ${config.borderDark}
          ${config.textLight} ${config.textDark}
          ${disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'cursor-pointer hover:brightness-95 active:brightness-90 dark:hover:brightness-110'
          }
        `}
      >
        {/* Icon */}
        {visibleMode === 'plan' && <PlanIcon className="h-3 w-3 opacity-80" />}
        {visibleMode === 'act' && <ActIcon className="h-3 w-3 opacity-80" />}
        {visibleMode === 'yolo' && <YoloIcon className="h-3 w-3 opacity-80" />}

        {/* Label */}
        <span>{visibleLabel}</span>

        {/* Pulsing indicator dot */}
        <span
          className={`
            inline-block h-1.5 w-1.5 rounded-full
            ${config.dotBg}
            ${disabled ? '' : 'animate-pulse'}
          `}
        />

        {/* Chevron (dropdown indicator) */}
        <ChevronIcon className={`h-3 w-3 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && !disabled && (
        <div
          className={`
            absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border shadow-lg
            bg-white dark:bg-neutral-900
            border-neutral-200/80 dark:border-neutral-700/80
          `}
        >
          <ModeOption
            visibleMode="plan"
            label={t('agent.mode.plan')}
            description={t('agent.mode.planShort')}
            isSelected={visibleMode === 'plan'}
            onSelect={() => handleSelect('plan')}
          />
          <div className="border-t border-neutral-100 dark:border-neutral-800" />
          <ModeOption
            visibleMode="act"
            label={t('agent.mode.act')}
            description={t('agent.mode.actShort')}
            isSelected={visibleMode === 'act'}
            onSelect={() => handleSelect('act')}
          />
          <div className="border-t border-neutral-100 dark:border-neutral-800" />
          {showYolo && (
            <>
              <ModeOption
                visibleMode="yolo"
                label={t('agent.mode.yolo')}
                description={t('agent.mode.yoloShort')}
                isSelected={visibleMode === 'yolo'}
                onSelect={() => handleSelect('yolo')}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
