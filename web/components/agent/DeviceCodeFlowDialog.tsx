/**
 * DeviceCodeFlowDialog — modal that shows the LLM Gateway Device Code Flow.
 *
 * Displays the user_code and verification URI while polling for authorization.
 * Used by WelcomeScreen to let users login without going to Settings.
 */

import { useState } from 'react'
import { Loader2, Copy, Check, ExternalLink, X } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
} from '@creatorweave/ui'
import type { AuthState } from '@/agent/providers/llm-gateway-auth'
import { useT } from '@/i18n'

interface DeviceCodeFlowDialogProps {
  open: boolean
  authState: AuthState | null
  onClose: () => void
}

export function DeviceCodeFlowDialog({
  open,
  authState,
  onClose,
}: DeviceCodeFlowDialogProps) {
  const t = useT()

  const [copied, setCopied] = useState(false)

  const handleCopyCode = () => {
    if (authState?.userCode) {
      navigator.clipboard.writeText(authState.userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const showCode =
    authState &&
    (authState.status === 'waiting' || authState.status === 'polling') &&
    authState.userCode

  return (
    <BrandDialog open={open} onOpenChange={(o) => !o && onClose()} modal>
      <BrandDialogContent className="max-w-sm">
        {/* Header with close button */}
        <BrandDialogHeader>
          <BrandDialogTitle>
            {t('welcome.gateway.title')}
          </BrandDialogTitle>
          <BrandDialogClose asChild>
            <button
              type="button"
              aria-label={t('welcome.gateway.close')}
              className="rounded p-1 text-tertiary transition-colors hover:bg-muted hover:text-secondary"
            >
              <X className="h-5 w-5" />
            </button>
          </BrandDialogClose>
        </BrandDialogHeader>

        {/* Body — padded content area */}
        <div className="px-5 py-5">
          {/* Error */}
          {authState?.status === 'error' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-center">
                <p className="text-sm text-danger">
                  {authState.error}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/50"
              >
                {t('welcome.gateway.close')}
              </button>
            </div>
          )}

          {/* Requesting */}
          {authState?.status === 'requesting' && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-tertiary" />
              <span className="text-sm text-secondary">
                {t('welcome.gateway.requesting')}
              </span>
            </div>
          )}

          {/* Waiting / Polling */}
          {showCode && (
            <div className="space-y-4">
              <p className="text-center text-sm text-secondary">
                {t('welcome.gateway.enterCode')}
              </p>

              {/* User code */}
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                <p className="mb-2 text-xs text-tertiary">
                  {t('welcome.gateway.authCodeLabel')}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <span className="font-mono text-2xl font-bold tracking-[0.15em] text-foreground">
                    {authState.userCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="text-tertiary transition-colors hover:text-primary"
                    title={t('welcome.gateway.copy')}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Re-open verification link */}
              {authState.verificationUri && (
                <a
                  href={
                    authState.verificationUri.includes('user_code=')
                      ? authState.verificationUri
                      : `${authState.verificationUri}${
                          authState.verificationUri.includes('?') ? '&' : '?'
                        }user_code=${encodeURIComponent(authState.userCode || '')}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('welcome.gateway.openAuthPage')}
                </a>
              )}

              {/* Polling status */}
              {authState.status === 'polling' && (
                <div className="flex items-center justify-center gap-2 text-xs text-tertiary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('welcome.gateway.waiting')}
                </div>
              )}
            </div>
          )}

          {/* Success (briefly before parent closes) */}
          {authState?.status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-secondary">
                {t('welcome.gateway.success')}
              </p>
            </div>
          )}
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}
