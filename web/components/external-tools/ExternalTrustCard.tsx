import { ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useTrustedSourceStore } from '@/store/trusted-source.store'

interface ExternalTrustCardProps {
  /**
   * Loose translation function — callers pass either the i18n `t` or a
   * `tf(key, fallback)` wrapper; the card only calls with a key.
   */
  t: (key: string) => string
}

/**
 * Shared "Trust external tools by default" card — THE single trust control.
 *
 * Rendered as the FIRST element on both the MCP and WebMCP settings pages,
 * with identical copy (keys: settings.externalTrust*), so the control looks
 * and behaves the same wherever the user meets it:
 * ON (default) → tools from every discovered MCP server / WebMCP site run
 * without the approval modal (plan/act); OFF → per-call prompts return.
 * Untrusted-content tools always ask regardless of this switch.
 */
export function ExternalTrustCard({ t }: ExternalTrustCardProps) {
  const defaultTrustExternal = useTrustedSourceStore(
    (state) => state.defaultTrustExternal
  )
  const setDefaultTrustExternal = useTrustedSourceStore(
    (state) => state.setDefaultTrustExternal
  )

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck
            className={`h-4 w-4 shrink-0 ${
              defaultTrustExternal
                ? 'text-primary-600'
                : 'text-neutral-400 dark:text-neutral-500'
            }`}
          />
          <p className="truncate text-sm font-medium text-secondary">
            {t('settings.externalTrustToggle')}
          </p>
        </div>
        <Switch
          checked={defaultTrustExternal}
          onCheckedChange={setDefaultTrustExternal}
          aria-label={t('settings.externalTrustToggle')}
        />
      </div>
      <p className="mt-1 text-xs text-tertiary">
        {defaultTrustExternal
          ? t('settings.externalTrustOn')
          : t('settings.externalTrustOff')}
      </p>
    </div>
  )
}
