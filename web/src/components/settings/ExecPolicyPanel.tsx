/**
 * ExecPolicyPanel — Settings panel for managing command execution policy.
 *
 * Lets users configure which commands are:
 *   - auto: executed without asking
 *   - prompt: require approval dialog
 *   - forbidden: always blocked
 *
 * Loads/saves via Native Host (get_execpolicy / set_execpolicy).
 */

import { useEffect, useState } from 'react'
import { useExecPolicyStore, type ExecDecision } from '@/store/exec-policy.store'
import { useT } from '@/i18n'

const DECISION_COLORS: Record<ExecDecision, string> = {
  auto: 'text-green-600 dark:text-green-400',
  prompt: 'text-amber-600 dark:text-amber-400',
  forbidden: 'text-red-600 dark:text-red-400',
}

function ExecPolicyPanel() {
  const { policy, loading, saving, error, loadPolicy, savePolicy, updateRuleDecision, addRule, removeRule } = useExecPolicyStore()
  const t = useT()
  const [search, setSearch] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const [newDecision, setNewDecision] = useState<ExecDecision>('prompt')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    loadPolicy()
  }, [loadPolicy])

  const filteredRules = policy?.rules.filter(
    (r) => !search || r.command.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  const grouped = {
    auto: filteredRules.filter((r) => r.decision === 'auto'),
    prompt: filteredRules.filter((r) => r.decision === 'prompt'),
    forbidden: filteredRules.filter((r) => r.decision === 'forbidden'),
  }

  const handleSave = async () => {
    if (!policy) return
    const ok = await savePolicy(policy)
    if (ok) setDirty(false)
  }

  const handleAdd = () => {
    if (!newCmd.trim()) return
    addRule(newCmd.trim(), newDecision)
    setNewCmd('')
    setDirty(true)
  }

  const handleDecisionChange = (index: number, decision: ExecDecision) => {
    // Map filtered index back to original rules index
    const originalIndex = policy!.rules.findIndex(
      (r) => r === filteredRules[index]
    )
    if (originalIndex >= 0) {
      updateRuleDecision(originalIndex, decision)
      setDirty(true)
    }
  }

  const handleRemove = (index: number) => {
    const originalIndex = policy!.rules.findIndex(
      (r) => r === filteredRules[index]
    )
    if (originalIndex >= 0) {
      removeRule(originalIndex)
      setDirty(true)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-12 text-sm text-muted-foreground">
        {t('execPolicy.loading')}
      </div>
    )
  }

  if (error && !policy) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={() => loadPolicy()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t('execPolicy.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('execPolicy.description')}
      </p>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('execPolicy.searchPlaceholder')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      {/* Add new rule */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCmd}
          onChange={(e) => setNewCmd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('execPolicy.newCommandPlaceholder')}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
        />
        <select
          value={newDecision}
          onChange={(e) => setNewDecision(e.target.value as ExecDecision)}
          className="rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="auto">{t('execPolicy.auto')}</option>
          <option value="prompt">{t('execPolicy.prompt')}</option>
          <option value="forbidden">{t('execPolicy.forbidden')}</option>
        </select>
        <button
          onClick={handleAdd}
          disabled={!newCmd.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t('execPolicy.add')}
        </button>
      </div>

      {/* Rule groups */}
      {(['forbidden', 'auto', 'prompt'] as ExecDecision[]).map((decision) => {
        const rules = grouped[decision]
        if (rules.length === 0) return null
        return (
          <div key={decision} className="space-y-1.5">
            <h4 className={`text-xs font-semibold uppercase tracking-wide ${DECISION_COLORS[decision]}`}>
              {t(`execPolicy.${decision}`)} ({rules.length})
            </h4>
            {rules.map((rule) => {
              const filteredIdx = filteredRules.indexOf(rule)
              return (
                <div
                  key={`${rule.command}-${rule.args?.join('-')}-${filteredIdx}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <code className="flex-1 truncate font-mono text-sm">
                    {rule.command}
                    {rule.args && rule.args.length > 0 && (
                      <span className="text-muted-foreground"> {rule.args.join(' ')}</span>
                    )}
                  </code>
                  <select
                    value={rule.decision}
                    onChange={(e) => handleDecisionChange(filteredIdx, e.target.value as ExecDecision)}
                    className="rounded border border-border bg-background px-1.5 py-1 text-xs outline-none"
                  >
                    <option value="auto">{t('execPolicy.auto')}</option>
                    <option value="prompt">{t('execPolicy.prompt')}</option>
                    <option value="forbidden">{t('execPolicy.forbidden')}</option>
                  </select>
                  <button
                    onClick={() => handleRemove(filteredIdx)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    title={t('execPolicy.remove')}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Default policy */}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">{t('execPolicy.defaultLabel')}</span>
        <select
          value={policy?.default ?? 'prompt'}
          onChange={(e) => {
            useExecPolicyStore.setState((s) => ({
              policy: s.policy ? { ...s.policy, default: e.target.value as ExecDecision } : null,
            }))
            setDirty(true)
          }}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="auto">{t('execPolicy.auto')}</option>
          <option value="prompt">{t('execPolicy.prompt')}</option>
          <option value="forbidden">{t('execPolicy.forbidden')}</option>
        </select>
        <span className="text-xs text-muted-foreground">{t('execPolicy.defaultHint')}</span>
      </div>

      {/* Sticky save bar — sticks to bottom of the scrolling tab panel */}
      {dirty && (
        <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex items-center justify-between gap-2 border-t-2 border-primary/30 bg-card/95 px-4 py-3 backdrop-blur">
          {error
            ? <span className="text-xs text-destructive">{error}</span>
            : <span className="text-xs text-muted-foreground">{t('execPolicy.saveHint')}</span>
          }
          <div className="flex gap-2">
            <button
              onClick={() => { loadPolicy(); setDirty(false) }}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              {t('execPolicy.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? t('execPolicy.saving') : t('execPolicy.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExecPolicyPanel
