import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { Code2, Download, Maximize2, RefreshCw, X } from 'lucide-react'
import { useT } from '@/i18n'

const UNTRUSTED_SANDBOX_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "img-src data: blob:",
  "font-src data: blob:",
  "media-src data: blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "navigate-to 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
].join('; ')

/**
 * Wrap agent HTML in a fresh document whose CSP is the first parsed markup.
 *
 * This intentionally avoids DOMParser: parsing an untrusted document before
 * its CSP is active may allow preload scanning to discover remote URLs. The
 * supplied markup is placed only after the policy; untrusted document/head
 * tokens are treated as body content by the iframe parser. CSP policies are
 * additive, so a later meta policy cannot weaken this one.
 */
export function prepareUntrustedHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${UNTRUSTED_SANDBOX_CSP}">`
  return `<!doctype html><html><head>${policy}</head><body>${html}</body></html>`
}

function downloadHtml(html: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export type HtmlSandboxProfile = 'untrusted' | 'trusted-file'

interface PreviewFrameProps {
  srcDoc: string
  title: string
  frameKey: number
  sandboxProfile: HtmlSandboxProfile
}

function PreviewFrame({ srcDoc, title, frameKey, sandboxProfile }: PreviewFrameProps) {
  const untrusted = sandboxProfile === 'untrusted'
  return (
    <iframe
      key={frameKey}
      srcDoc={srcDoc}
      title={title}
      sandbox={untrusted ? 'allow-scripts' : 'allow-scripts allow-same-origin allow-popups'}
      referrerPolicy="no-referrer"
      className="h-full w-full border-0 bg-white"
    />
  )
}

function ActionButton({
  label,
  onClick,
  buttonRef,
  children,
}: {
  label: string
  onClick: () => void
  buttonRef?: Ref<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      ref={buttonRef}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white dark:focus-visible:ring-offset-neutral-900"
    >
      {children}
    </button>
  )
}

export interface HtmlSandboxPreviewProps {
  html: string
  title: string
  /**
   * Agent output must use `untrusted`. `trusted-file` preserves the historical
   * local-file preview behavior for HTML the user explicitly opened.
   */
  sandboxProfile?: HtmlSandboxProfile
  /** A CSS height string or pixel value. The parent controls the preview width. */
  height?: string | number
  className?: string
  /** Show a reset button that recreates the iframe and clears its local state. */
  showReset?: boolean
  /** Show a source/preview toggle. */
  showSource?: boolean
  /** Open the same sandbox in a full-screen dialog. */
  allowFullscreen?: boolean
  /** Enables a local .html download action. */
  downloadFileName?: string
  /** Optional host-owned actions, such as opening a file preview in a new tab. */
  extraActions?: ReactNode
}

/**
 * A reusable HTML preview renderer with two explicit trust boundaries.
 *
 * Agent output uses the default `untrusted` profile: an opaque-origin,
 * script-only frame plus a network-denying CSP. The `trusted-file` profile is
 * reserved for HTML files that the user explicitly opened and retains the
 * previous local-file preview permissions for compatibility.
 */
export function HtmlSandboxPreview({
  html,
  title,
  sandboxProfile = 'untrusted',
  height = '100%',
  className,
  showReset = false,
  showSource = false,
  allowFullscreen = false,
  downloadFileName,
  extraActions,
}: HtmlSandboxPreviewProps) {
  const [frameKey, setFrameKey] = useState(0)
  const [showingSource, setShowingSource] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFullscreenFocusRef = useRef(false)
  const t = useT()
  const srcDoc = useMemo(
    () => sandboxProfile === 'untrusted' ? prepareUntrustedHtml(html) : html,
    [html, sandboxProfile],
  )

  const reset = useCallback(() => setFrameKey((value) => value + 1), [])
  const openFullscreen = useCallback(() => {
    restoreFullscreenFocusRef.current = true
    setFullscreen(true)
  }, [])
  const closeFullscreen = useCallback(() => setFullscreen(false), [])

  useEffect(() => {
    if (fullscreen) {
      closeButtonRef.current?.focus()
    } else if (restoreFullscreenFocusRef.current) {
      fullscreenTriggerRef.current?.focus()
      restoreFullscreenFocusRef.current = false
    }
  }, [fullscreen])

  useEffect(() => {
    if (!fullscreen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeFullscreen()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), iframe, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeFullscreen, fullscreen])

  const renderActions = (includeFullscreen = true) => (
    <div className="flex items-center gap-0.5">
      {showReset && (
        <ActionButton label={t('htmlPreview.resetPreview')} onClick={reset}>
          <RefreshCw className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {showSource && (
        <ActionButton
          label={showingSource ? t('htmlPreview.showPreview') : t('htmlPreview.showSource')}
          onClick={() => setShowingSource((value) => !value)}
        >
          <Code2 className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {downloadFileName && (
        <ActionButton label={t('htmlPreview.downloadHtml')} onClick={() => downloadHtml(html, downloadFileName)}>
          <Download className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {allowFullscreen && includeFullscreen && (
        <ActionButton label={t('htmlPreview.openFullscreen')} onClick={openFullscreen} buttonRef={fullscreenTriggerRef}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {extraActions}
    </div>
  )

  return (
    <>
      <section
        className={`flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 ${className ?? ''}`}
        style={{ height }}
        aria-label={`${title} preview`}
      >
        {(showReset || showSource || allowFullscreen || downloadFileName || extraActions) && (
          <header className="flex min-h-11 items-center justify-between border-b border-neutral-200 bg-neutral-50 pl-3 dark:border-neutral-700 dark:bg-neutral-800">
            <span className="truncate text-xs font-medium text-neutral-600 dark:text-neutral-300">{title}</span>
            {renderActions()}
          </header>
        )}
        <div className="min-h-0 flex-1">
          {showingSource ? (
            <pre className="h-full overflow-auto bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800 dark:bg-bg-tertiary dark:text-neutral-100">
              <code>{html}</code>
            </pre>
          ) : (
            <PreviewFrame srcDoc={srcDoc} title={title} frameKey={frameKey} sandboxProfile={sandboxProfile} />
          )}
        </div>
      </section>

      {fullscreen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          data-html-sandbox-dialog
          ref={dialogRef}
          aria-label={t('htmlPreview.fullscreenPreview', { title })}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeFullscreen()
          }}
        >
          <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-neutral-900">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-700">
              <h2 className="truncate text-sm font-medium text-neutral-800 dark:text-white">{title}</h2>
              <div className="flex items-center gap-1">
                {renderActions(false)}
                <ActionButton label={t('htmlPreview.closeFullscreen')} onClick={closeFullscreen} buttonRef={closeButtonRef}>
                  <X className="h-4 w-4" />
                </ActionButton>
              </div>
            </header>
            <div className="min-h-0 flex-1">
              {showingSource ? (
                <pre className="h-full overflow-auto bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-800 dark:bg-bg-tertiary dark:text-neutral-100">
                  <code>{html}</code>
                </pre>
              ) : (
                <PreviewFrame srcDoc={srcDoc} title={title} frameKey={frameKey} sandboxProfile={sandboxProfile} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
