/**
 * ToolAuthModal — the single floating confirmation dialog for all prompt-level
 * tool authorizations (replaces ExecAuthModal + PageWriteAuthModal).
 *
 * Not part of the conversation flow: overlays the whole app and blocks until
 * the user clicks an explicit action button. There is deliberately NO way to
 * dismiss via backdrop click or Esc — authorization modals often pop up while
 * the user is away (e.g. during long background commands); an accidental
 * backdrop-deny would send a misleading refusal to the LLM and silently
 * derail the run (redesign doc §3.3 interaction constraint).
 *
 * Buttons:
 *   - Allow once
 *   - Always allow for this conversation (only when memoryKey is non-null)
 *   - Deny (+ Deny all when more requests are queued)
 */

import { useEffect } from 'react'
import { useToolAuthStore, type ToolAuthDescriptionInput } from '@/store/tool-auth.store'
import { useT } from '@/i18n'

/**
 * Render the modal body: i18n descriptors are translated (locale-aware),
 * plain strings (exec context) render as-is.
 */
function useDescriptionText(description: ToolAuthDescriptionInput): string | null {
  const t = useT()
  if (!description) return null
  if (typeof description === 'string') return description
  return t(`agent.toolAuth.${description.key}`, description.params)
}

export function ToolAuthModal() {
  const pending = useToolAuthStore((s) => s.pending)
  const queueLength = useToolAuthStore((s) => s.queue.length)
  const approve = useToolAuthStore((s) => s.approve)
  const deny = useToolAuthStore((s) => s.deny)
  const denyAll = useToolAuthStore((s) => s.denyAll)
  const t = useT()
  const descriptionText = useDescriptionText(pending?.description ?? null)

  // Hard block: the modal must stay up until an explicit button is clicked.
  // Backdrop clicks and Esc intentionally do nothing.
  useEffect(() => {
    if (!pending) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending])

  if (!pending) return null

  const isExecLike = Boolean(pending.detail)
  const queuePosition = queueLength > 1 ? ` · 1/${queueLength}` : ''

  return (
    // Backdrop: no onClick handler on purpose — clicking outside must NOT
    // deny or dismiss the request.
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('agent.toolAuth.title')}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-50/50">
              <svg
                className="h-5 w-5 text-primary-600 dark:text-primary-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1.944A11.954 11.954 0 012.166 5C2.057 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t('agent.toolAuth.title')}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary-600 dark:text-primary-500">
                  {pending.toolName}
                </code>
                {isExecLike && t('agent.toolAuth.subtitle')}
                {queuePosition}
              </p>
            </div>
          </div>
        </div>

        {/* Body — scrolls independently so the action buttons stay reachable
            even when the command/context is very long */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {descriptionText && (
            <p className="break-words text-sm leading-relaxed text-foreground/80">
              {descriptionText}
            </p>
          )}
          {isExecLike && (
            <div className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <code className="block max-h-48 overflow-y-auto break-all whitespace-pre-wrap font-mono text-sm text-primary-600 dark:text-primary-500">
                $ {pending.detail}
              </code>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
          {pending.memoryKey !== null && (
            <button
              onClick={() => approve(true)}
              className="w-full rounded-lg border border-primary-300 px-4 py-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:border-primary-800 dark:text-primary-400 dark:hover:bg-primary-950/40"
            >
              {t('agent.toolAuth.alwaysAllow')}
            </button>
          )}
          <div className="flex gap-2">
            {queueLength > 1 && (
              <button
                onClick={denyAll}
                className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                title={t('agent.toolAuth.denyAllHint')}
              >
                {t('agent.toolAuth.denyAll')}
              </button>
            )}
            <button
              onClick={deny}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {t('agent.toolAuth.deny')}
            </button>
            <button
              onClick={() => approve(false)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-700"
            >
              {t('agent.toolAuth.allow')}
            </button>
          </div>
        </div>

        {/* Settings guide (exec-specific hint kept from ExecAuthModal) */}
        {isExecLike && (
          <div className="border-t border-border bg-muted/30 px-5 py-2.5">
            <p className="text-center text-[11px] text-muted-foreground">
              {t('execPolicy.authGuide')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
