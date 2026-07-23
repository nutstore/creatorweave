/**
 * PageWriteAuthModal — floating confirmation dialog for page-action writes.
 *
 * This is NOT part of the conversation flow. It's a standalone modal that
 * overlays the entire app when the agent requests permission to modify the
 * upstream page. It blocks until the user clicks Approve or Deny.
 *
 * Uses the project's CSS-variable-based theme (primary/destructive/background),
 * NOT hardcoded color values, so it adapts to light/dark mode and custom themes.
 */

import { usePageWriteAuthStore } from '@/agent/tools/page-write-auth.store'
import { useT } from '@/i18n'

export function PageWriteAuthModal() {
  const pending = usePageWriteAuthStore((s) => s.pending)
  const approve = usePageWriteAuthStore((s) => s.approve)
  const deny = usePageWriteAuthStore((s) => s.deny)
  const t = useT()

  if (!pending) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={deny}
    >
      <div
        className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-950/50">
              <svg
                className="h-5 w-5 text-primary-600 dark:text-primary-400"
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
                {t('agent.pageWriteAuth.title')}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary-600 dark:text-primary-400">
                  {pending.toolName}
                </code>
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground/80">
            {pending.description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <button
            onClick={deny}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {t('agent.pageWriteAuth.deny')}
          </button>
          <button
            onClick={approve}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-700"
          >
            {t('agent.pageWriteAuth.approve')}
          </button>
        </div>
      </div>
    </div>
  )
}
