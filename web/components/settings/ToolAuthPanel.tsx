/**
 * ToolAuthPanel — Settings section for the unified tool authorization system.
 *
 * Session "always allow" grants live purely in memory (per conversation), so
 * this panel is intentionally minimal: show how many grants are currently
 * remembered and offer a one-click "clear all" (redesign doc PR-2). There is
 * nothing to configure per-tool yet — policy levels are code-defined.
 */

import { useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { useSessionAllowStore } from '@/store/session-allow.store'
import { useT } from '@/i18n'

function ToolAuthPanel() {
  const allowed = useSessionAllowStore((s) => s.allowed)
  const clearAll = useSessionAllowStore((s) => s.clearAll)
  const t = useT()
  const [justCleared, setJustCleared] = useState(false)

  // Count grants across all conversations and list them for transparency.
  const entries = Array.from(allowed.entries())
  const totalGrants = entries.reduce((sum, [, keys]) => sum + keys.size, 0)

  const handleClear = () => {
    clearAll()
    setJustCleared(true)
    window.setTimeout(() => setJustCleared(false), 2000)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-1">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary-500" />
          {t('agent.toolAuth.settingsTitle')}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t('agent.toolAuth.settingsDescription')}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {totalGrants === 0
                ? t('agent.toolAuth.noGrants')
                : t('agent.toolAuth.grantsCount').replace('{count}', String(totalGrants))}
            </p>
            {entries.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {entries.map(([convId, keys]) => (
                  <li key={convId} className="text-xs text-muted-foreground">
                    <span className="font-mono text-[11px] text-primary-600 dark:text-primary-400">
                      {convId.slice(0, 8)}
                    </span>
                    {' · '}
                    {Array.from(keys).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={handleClear}
            disabled={totalGrants === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            {t('agent.toolAuth.clearMemory')}
          </button>
        </div>
        {justCleared && (
          <p className="mt-2 text-xs text-green-600 dark:text-green-400">
            {t('agent.toolAuth.cleared')}
          </p>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t('agent.toolAuth.settingsHint')}
      </p>
    </div>
  )
}

export default ToolAuthPanel
