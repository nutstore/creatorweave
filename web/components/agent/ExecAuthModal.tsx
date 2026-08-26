/**
 * ExecAuthModal — floating confirmation dialog for exec prompt-level commands.
 *
 * This is NOT part of the conversation flow. It's a standalone modal that
 * overlays the entire app when the agent requests permission to run a
 * command that's not in the auto-approve list. It blocks until the user
 * clicks Allow or Deny.
 *
 * Modeled after PageWriteAuthModal.
 */

import { useExecAuthStore } from '@/agent/tools/exec-auth.store'
import { useT } from '@/i18n'

export function ExecAuthModal() {
  const pending = useExecAuthStore((s) => s.pending)
  const queueLength = useExecAuthStore((s) => s.queue.length)
  const approve = useExecAuthStore((s) => s.approve)
  const deny = useExecAuthStore((s) => s.deny)
  const denyAll = useExecAuthStore((s) => s.denyAll)
  const t = useT()

  if (!pending) return null

  const cmdDisplay = pending.command.join(' ')

  // The exec tool's description now contains only the execution context
  // (project root / subdir / background process hint) — the command itself
  // is rendered separately below.
  const descriptionText = pending.description?.trim() || undefined

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={deny}
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
                {t('agent.execAuth.title')}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('agent.execAuth.subtitle')}
                {queueLength > 1 && ` · 1/${queueLength}`}
              </p>
            </div>
          </div>
        </div>

        {/* Body — scrolls independently so the action buttons stay reachable
            even when the command is very long */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {descriptionText && (
            <p className="text-sm leading-relaxed text-foreground/80">
              {descriptionText}
            </p>
          )}
          <div className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
            <code
              className="block max-h-48 overflow-y-auto break-all whitespace-pre-wrap font-mono text-sm text-primary-600 dark:text-primary-500"
            >
              $ {cmdDisplay}
            </code>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-border px-5 py-4">
          {queueLength > 1 && (
            <button
              onClick={denyAll}
              className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              title={t('agent.execAuth.denyAllHint')}
            >
              {t('agent.execAuth.denyAll')}
            </button>
          )}
          <button
            onClick={deny}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {t('agent.execAuth.deny')}
          </button>
          <button
            onClick={approve}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-700"
          >
            {t('agent.execAuth.allow')}
          </button>
        </div>

        {/* Settings guide */}
        <div className="border-t border-border bg-muted/30 px-5 py-2.5">
          <p className="text-center text-[11px] text-muted-foreground">
            {t('execPolicy.authGuide')}
          </p>
        </div>
      </div>
    </div>
  )
}
