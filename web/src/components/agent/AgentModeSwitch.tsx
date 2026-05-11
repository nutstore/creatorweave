/**
 * Agent Mode Switch - Toggle between Plan (read-only) and Act (full access) modes.
 *
 * Design: Industrial, utilitarian aesthetic with clean typography.
 * No emojis - uses simple geometric icons instead.
 */

import { BrandSwitch } from '@creatorweave/ui'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@creatorweave/ui'
import { type AgentMode } from '@/agent/agent-mode'
import { useT } from '@/i18n'

export interface AgentModeSwitchProps {
  /** Current mode */
  mode: AgentMode
  /** Callback when mode changes */
  onModeChange: (mode: AgentMode) => void
  /** Whether the switch is disabled */
  disabled?: boolean
  /** Additional CSS class */
  className?: string
}

const MODE_CONFIG = {
  plan: {
    // Subtle amber/ochre for "contemplation"
    bgLight: 'bg-amber-50',
    bgDark: 'dark:bg-amber-950/40',
    borderLight: 'border-amber-200/60',
    borderDark: 'dark:border-amber-800/50',
    textLight: 'text-amber-700',
    textDark: 'dark:text-amber-400',
    dotBg: 'bg-amber-400',
    dotRing: 'ring-amber-400/30',
    accentBg: 'bg-amber-100/80',
    accentBorder: 'border-amber-300/50',
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
    dotRing: 'ring-blue-500/30',
    accentBg: 'bg-blue-100/80',
    accentBorder: 'border-blue-300/50',
  },
} as const

// Simple geometric SVG icons - no emoji
const PlanIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    <path d="M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M3.22 12.78l1.42-1.42M11.36 4.64l1.42-1.42" />
  </svg>
)

const ActIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 1L10 6h4l-3.5 2.5L12 14l-4-2.5L4 14l1.5-5.5L2 6h4L8 1z" />
  </svg>
)

// Arrow icon for tooltip
const ArrowIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 6h8M7 3l3 3-3 3" />
  </svg>
)

/**
 * Compact toggle - pill-shaped button with icon, label, and mode indicator dot.
 * Clicking toggles between Plan and Act mode.
 *
 * Design: Industrial pill with subtle border, icon, and pulsing indicator dot.
 */
export function AgentModeSwitchCompact({
  mode,
  onModeChange,
  disabled = false,
  className = '',
}: AgentModeSwitchProps) {
  const config = MODE_CONFIG[mode]
  const nextMode: AgentMode = mode === 'plan' ? 'act' : 'plan'
  const nextConfig = MODE_CONFIG[nextMode]
  const t = useT()

  const modeLabel = mode === 'plan' ? t('agent.mode.plan') : t('agent.mode.act')
  const nextModeLabel = nextMode === 'plan' ? t('agent.mode.plan') : t('agent.mode.act')

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onModeChange(nextMode)}
            disabled={disabled}
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
              ${className}
            `}
            aria-label={t('agent.mode.currentAriaLabel', { mode: modeLabel })}
          >
            {/* Icon */}
            {mode === 'plan' ? (
              <PlanIcon className="h-3 w-3 opacity-80" />
            ) : (
              <ActIcon className="h-3 w-3 opacity-80" />
            )}

            {/* Label */}
            <span>{modeLabel}</span>

            {/* Divider line */}
            <span className="mx-0.5 h-3 w-px bg-current opacity-20" />

            {/* Pulsing indicator dot */}
            <span
              className={`
                inline-block h-1.5 w-1.5 rounded-full
                ${config.dotBg}
                ${disabled ? '' : 'animate-pulse'}
              `}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={8}
          className="p-0 rounded-xl !bg-transparent !text-neutral-900 dark:!text-neutral-100 !shadow-xl border-0"
        >
          <div
            className={`
              w-64 overflow-hidden rounded-xl border shadow-lg
              bg-white dark:bg-neutral-900
              border-neutral-200/80 dark:border-neutral-700/80
            `}
          >
            {/* Header with accent bar */}
            <div
              className={`
                flex items-center gap-3 px-4 py-3
                ${config.bgLight} ${config.bgDark}
              `}
            >
              <div
                className={`
                  flex h-10 w-10 items-center justify-center rounded-lg
                  ${config.accentBg}
                  border ${config.accentBorder}
                `}
              >
                {mode === 'plan' ? (
                  <PlanIcon className={`h-5 w-5 ${config.textLight} ${config.textDark}`} />
                ) : (
                  <ActIcon className={`h-5 w-5 ${config.textLight} ${config.textDark}`} />
                )}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-bold uppercase tracking-wide ${config.textLight} ${config.textDark}`}>
                  {mode === 'plan' ? t('agent.mode.planModeTitle') : t('agent.mode.actModeTitle')}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {mode === 'plan' ? t('agent.mode.planShort') : t('agent.mode.actShort')}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                {mode === 'plan' ? t('agent.mode.planDescription') : t('agent.mode.actDescription')}
              </p>
            </div>

            {/* Switch hint */}
            {!disabled && (
              <div
                className={`
                  flex items-center justify-between border-t px-4 py-2.5
                  border-neutral-100 dark:border-neutral-800
                  ${nextConfig.bgLight} ${nextConfig.bgDark}
                `}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t('agent.mode.switchTo')}
                  </span>
                  <span className={`text-xs font-semibold uppercase ${nextConfig.textLight} ${nextConfig.textDark}`}>
                    {nextModeLabel}
                  </span>
                </div>
                <ArrowIcon className={`h-3.5 w-3.5 ${nextConfig.textLight} ${nextConfig.textDark} opacity-60`} />
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Full switch variant - uses a toggle Switch with Plan/Act labels on each side.
 *
 * Design: Clean horizontal layout with labels and toggle switch.
 */
export function AgentModeSwitch({
  mode,
  onModeChange,
  disabled = false,
  className = '',
}: AgentModeSwitchProps) {
  const isAct = mode === 'act'
  const planConfig = MODE_CONFIG.plan
  const actConfig = MODE_CONFIG.act
  const t = useT()

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`
              inline-flex items-center gap-2.5 rounded-lg
              border border-neutral-200/80 bg-white px-3 py-1.5
              dark:border-neutral-700/80 dark:bg-neutral-900
              ${disabled ? 'opacity-40' : ''}
              ${className}
            `}
          >
            {/* Plan label with icon */}
            <div
              className={`
                flex items-center gap-1.5 text-xs font-medium transition-colors duration-200
                ${!isAct
                  ? `${planConfig.textLight} ${planConfig.textDark}`
                  : 'text-neutral-400 dark:text-neutral-500'
                }
              `}
            >
              <PlanIcon className="h-3.5 w-3.5" />
              <span>{t('agent.mode.plan')}</span>
            </div>

            <BrandSwitch
              checked={isAct}
              onCheckedChange={(checked) => onModeChange(checked ? 'act' : 'plan')}
              disabled={disabled}
              aria-label={t('agent.mode.switchAriaLabel', { mode: isAct ? t('agent.mode.plan') : t('agent.mode.act') })}
              className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-amber-500"
            />

            {/* Act label with icon */}
            <div
              className={`
                flex items-center gap-1.5 text-xs font-medium transition-colors duration-200
                ${isAct
                  ? `${actConfig.textLight} ${actConfig.textDark}`
                  : 'text-neutral-400 dark:text-neutral-500'
                }
              `}
            >
              <ActIcon className="h-3.5 w-3.5" />
              <span>{t('agent.mode.act')}</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8} className="p-0 rounded-xl !bg-transparent !text-neutral-900 dark:!text-neutral-100 !shadow-xl border-0">
          <div
            className={`
              w-56 overflow-hidden rounded-xl border shadow-lg
              bg-white dark:bg-neutral-900
              border-neutral-200/80 dark:border-neutral-700/80
            `}
          >
            {/* Header */}
            <div
              className={`
                flex items-center gap-3 px-4 py-3
                ${isAct ? `${actConfig.bgLight} ${actConfig.bgDark}` : `${planConfig.bgLight} ${planConfig.bgDark}`}
              `}
            >
              <div
                className={`
                  flex h-9 w-9 items-center justify-center rounded-lg
                  ${isAct ? `${actConfig.accentBg} ${actConfig.accentBorder}` : `${planConfig.accentBg} ${planConfig.accentBorder}`}
                  border
                `}
              >
                {isAct ? (
                  <ActIcon className={`h-4 w-4 ${actConfig.textLight} ${actConfig.textDark}`} />
                ) : (
                  <PlanIcon className={`h-4 w-4 ${planConfig.textLight} ${planConfig.textDark}`} />
                )}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-bold uppercase tracking-wide ${isAct ? `${actConfig.textLight} ${actConfig.textDark}` : `${planConfig.textLight} ${planConfig.textDark}`}`}>
                  {isAct ? t('agent.mode.actModeTitle') : t('agent.mode.planModeTitle')}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {mode === 'plan' ? t('agent.mode.planReadonly') : t('agent.mode.actFullAccess')}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                {getModeDescription(mode)}
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
