/**
 * PageContextCard — human-readable preview of a message's frozen page-context
 * snapshot (side-panel mode).
 *
 * Only the universal, always-available fields are rendered as structured UI:
 *   hostname, URL, title, selected text.
 *
 * `providerContext` is upstream-defined and has no stable schema, so it is NOT
 * parsed — it is shown as a collapsed, optional "raw data" disclosure so a
 * curious user can still inspect it without it dominating the card.
 *
 * This is the user-facing counterpart of renderPageContextBlock() in
 * workspace-assistant-context.ts, which produces the LLM-facing text block.
 */
import { useState } from 'react'
import { Globe, ExternalLink, Link2, Type, TextQuote, ChevronDown, ChevronRight, Code2 } from 'lucide-react'
import { useT } from '@/i18n'
import type { Message } from '@/agent/message-types'

const SELECTED_TEXT_TRUNCATE = 120

interface PageContextCardProps {
  pageContext: NonNullable<Message['pageContext']>
}

export function PageContextCard({ pageContext }: PageContextCardProps) {
  const t = useT()
  const [showFullText, setShowFullText] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const hostname = pageContext.hostname
  const url = typeof pageContext.url === 'string' && pageContext.url ? pageContext.url : null
  const title = typeof pageContext.title === 'string' && pageContext.title ? pageContext.title : null
  const selectedText =
    typeof pageContext.selectedText === 'string' && pageContext.selectedText
      ? pageContext.selectedText
      : null

  const hasProviderData = pageContext.providerContext != null

  const truncatedText =
    selectedText && selectedText.length > SELECTED_TEXT_TRUNCATE
      ? selectedText.slice(0, SELECTED_TEXT_TRUNCATE)
      : selectedText

  return (
    <div className="mt-1 w-full max-w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-800/50">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
        <Globe className="h-3.5 w-3.5 shrink-0 text-primary-500 dark:text-primary-400" />
        <span>{t('conversation.pageContextTitle')}</span>
      </div>

      {/* Structured universal fields */}
      <dl className="space-y-1 px-3 py-2 text-[11px] leading-relaxed">
        {hostname && (
          <div className="flex items-start gap-1.5">
            <Globe className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <dt className="shrink-0 text-neutral-400 dark:text-neutral-500">
              {t('conversation.pageContextWebsite')}:
            </dt>
            <dd className="min-w-0 break-all text-neutral-700 dark:text-neutral-300">{hostname}</dd>
          </div>
        )}

        {url && (
          <div className="flex items-start gap-1.5">
            <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <dt className="shrink-0 text-neutral-400 dark:text-neutral-500">
              {t('conversation.pageContextUrl')}:
            </dt>
            <dd className="min-w-0 flex-1">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 break-all text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
              >
                <span className="min-w-0 truncate">{url}</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            </dd>
          </div>
        )}

        {title && (
          <div className="flex items-start gap-1.5">
            <Type className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <dt className="shrink-0 text-neutral-400 dark:text-neutral-500">
              {t('conversation.pageContextPageTitle')}:
            </dt>
            <dd className="min-w-0 break-all text-neutral-700 dark:text-neutral-300">{title}</dd>
          </div>
        )}

        {selectedText && (
          <div className="flex items-start gap-1.5">
            <TextQuote className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500" />
            <dt className="shrink-0 text-neutral-400 dark:text-neutral-500">
              {t('conversation.pageContextSelectedText')}:
            </dt>
            <dd className="min-w-0 flex-1 text-neutral-700 dark:text-neutral-300">
              <span className="break-words">
                {showFullText ? selectedText : truncatedText}
              </span>
              {selectedText.length > SELECTED_TEXT_TRUNCATE && (
                <button
                  type="button"
                  className="ml-1 inline text-primary-600 hover:underline dark:text-primary-400"
                  onClick={() => setShowFullText((v) => !v)}
                >
                  {showFullText
                    ? t('conversation.pageContextCollapse')
                    : t('conversation.pageContextShowAll', { count: selectedText.length })}
                </button>
              )}
            </dd>
          </div>
        )}
      </dl>

      {/* Raw provider data (collapsed by default) */}
      {hasProviderData && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
          >
            {showRaw ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Code2 className="h-3 w-3" />
            <span>{t('conversation.pageContextRawData')}</span>
          </button>
          {showRaw && (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {typeof pageContext.providerContext === 'string'
                ? pageContext.providerContext
                : JSON.stringify(pageContext.providerContext, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
