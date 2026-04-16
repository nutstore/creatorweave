import { useMemo, useState } from 'react'
import { ChevronDown, Play, Workflow, Settings2, Lightbulb, PenTool, ShieldCheck, Wrench, Layers, Zap, FolderOpen } from 'lucide-react'
import {
  BrandButton,
  BrandCheckbox,
  BrandInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@creatorweave/ui'
import { useT } from '@/i18n'
import { nodeKindConfig } from './workflow-editor/constants'
import type { WorkflowNodeKind } from '@/agent/workflow/types'

export interface WorkflowTemplateOption {
  id: string
  label: string
  pipeline?: string[]
}

interface WorkflowQuickActionsProps {
  templates: WorkflowTemplateOption[]
  selectedTemplateId: string
  disabled: boolean
  onTemplateChange: (templateId: string) => void
  onRun: (templateId: string, rubricDsl?: string) => void
  onRealRun?: (templateId: string, rubricDsl?: string) => void
  onOpenEditor?: () => void
  onOpenManager?: () => void
}

// ---------------------------------------------------------------------------
// Visual mini-pipeline: colored node dots connected by lines
// ---------------------------------------------------------------------------

const nodeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: Lightbulb,
  produce: PenTool,
  review: ShieldCheck,
  repair: Wrench,
  assemble: Layers,
}

function MiniPipeline({ kinds }: { kinds: string[] }) {
  const t = useT()
  if (kinds.length === 0) return null

  return (
    <div className="flex items-center gap-0.5">
      {kinds.map((kind, i) => {
        const cfg = nodeKindConfig[kind as WorkflowNodeKind]
        const Icon = nodeIcons[kind]
        const label = cfg?.labelKey ? t(cfg.labelKey) : kind
        return (
          <span key={`${kind}-${i}`} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className="mx-0.5 h-px w-2 bg-neutral-300 dark:bg-neutral-600" />
            )}
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium',
                cfg?.bg || 'bg-neutral-100 dark:bg-neutral-700',
                cfg?.color || 'text-neutral-600 dark:text-neutral-300'
              )}
            >
              {Icon && <Icon className="h-2.5 w-2.5" />}
              {label}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInt(value: string, fallback: number): number {
  const next = Number.parseInt(value, 10)
  return Number.isFinite(next) ? next : fallback
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowQuickActions({
  templates,
  selectedTemplateId,
  disabled,
  onTemplateChange,
  onRun,
  onRealRun,
  onOpenEditor,
  onOpenManager,
}: WorkflowQuickActionsProps) {
  const t = useT()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Advanced rubric state (collapsed by default)
  const [customRubricEnabled, setCustomRubricEnabled] = useState(false)
  const [rubricName, setRubricName] = useState(t('workflow.customRubricName'))
  const [passScore, setPassScore] = useState(80)
  const [maxRepairRounds, setMaxRepairRounds] = useState(2)
  const [paragraphRuleEnabled, setParagraphRuleEnabled] = useState(true)
  const [paragraphMin, setParagraphMin] = useState(3)
  const [paragraphMax, setParagraphMax] = useState(6)
  const [dialogueRuleEnabled, setDialogueRuleEnabled] = useState(true)
  const [allowSingleDialogue, setAllowSingleDialogue] = useState(true)
  const [hookRuleEnabled, setHookRuleEnabled] = useState(false)
  const [ctaRuleEnabled, setCtaRuleEnabled] = useState(false)

  const selectedLabel = templates.find((tmpl) => tmpl.id === selectedTemplateId)?.label
  const selectedPipeline = templates.find((tmpl) => tmpl.id === selectedTemplateId)?.pipeline || []

  const customRubricError = useMemo(() => {
    if (!customRubricEnabled) return null
    if (!rubricName.trim()) return t('workflow.validation.rubricNameRequired')
    if (passScore < 0 || passScore > 100) return t('workflow.validation.passScoreRange')
    if (maxRepairRounds < 0 || maxRepairRounds > 10) return t('workflow.validation.repairRoundsRange')
    if (paragraphRuleEnabled && (paragraphMin < 1 || paragraphMax < 1 || paragraphMin > paragraphMax)) {
      return t('workflow.validation.paragraphRangeInvalid')
    }
    if (!paragraphRuleEnabled && !dialogueRuleEnabled && !hookRuleEnabled && !ctaRuleEnabled) {
      return t('workflow.validation.atLeastOneRule')
    }
    return null
  }, [
    t,
    customRubricEnabled,
    rubricName,
    passScore,
    maxRepairRounds,
    paragraphRuleEnabled,
    paragraphMin,
    paragraphMax,
    dialogueRuleEnabled,
    hookRuleEnabled,
    ctaRuleEnabled,
  ])

  if (templates.length === 0) return null

  const buildCustomRubricDsl = (): string | undefined => {
    if (!customRubricEnabled) return undefined

    const rules: Array<Record<string, unknown>> = []

    if (paragraphRuleEnabled) {
      rules.push({
        id: 'paragraph_sentence_rule',
        checker: 'paragraph_sentence_count',
        params: { target: 'narrative', min: paragraphMin, max: paragraphMax },
        weight: 0.3,
        threshold: { violationRateLte: 0.08 },
        failAction: 'auto_repair',
        severity: 'high',
      })
    }

    if (dialogueRuleEnabled) {
      rules.push({
        id: 'dialogue_policy_rule',
        checker: 'dialogue_paragraph_policy',
        params: { allowSingle: allowSingleDialogue },
        weight: 0.2,
        threshold: { passEq: true },
        failAction: 'auto_repair',
        severity: 'medium',
      })
    }

    if (hookRuleEnabled) {
      rules.push({
        id: 'opening_hook_rule',
        checker: 'opening_hook_presence',
        params: { windowSeconds: 3 },
        weight: 0.25,
        threshold: { passEq: true },
        failAction: 'auto_repair',
        severity: 'medium',
      })
    }

    if (ctaRuleEnabled) {
      rules.push({
        id: 'cta_alignment_rule',
        checker: 'call_to_action_alignment',
        params: { required: true },
        weight: 0.25,
        threshold: { passEq: true },
        failAction: 'auto_repair',
        severity: 'medium',
      })
    }

    const rubric = {
      id: `custom_${selectedTemplateId || 'workflow'}`,
      version: 1,
      name: rubricName.trim(),
      passCondition: `total_score >= ${passScore} and hard_fail_count == 0`,
      retryPolicy: { maxRepairRounds },
      rules,
    }

    return JSON.stringify(rubric, null, 2)
  }

  const canRun = !!selectedTemplateId && !customRubricError && !disabled

  const handleRun = () => {
    if (!canRun) return
    onRun(selectedTemplateId, buildCustomRubricDsl())
    setPopoverOpen(false)
  }

  const handleRealRun = () => {
    if (!canRun || !onRealRun) return
    onRealRun(selectedTemplateId, buildCustomRubricDsl())
    setPopoverOpen(false)
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('workflow.label')}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors',
            'border-neutral-200 bg-neutral-50 text-neutral-600',
            'hover:border-neutral-300 hover:bg-neutral-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-700',
            popoverOpen && 'border-neutral-300 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-700'
          )}
        >
          <Workflow className="h-3.5 w-3.5" />
          <span>{selectedLabel || t('workflow.label')}</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform', popoverOpen && 'rotate-180')} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-[360px] rounded-xl border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="space-y-3">
          {/* Header */}
          <div>
            <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{t('workflow.label')}</h4>
            <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {t('workflow.description')}
            </p>
          </div>

          {/* Template list with visual pipelines */}
          <div className="space-y-1.5">
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId
              return (
                <button
                  key={template.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onTemplateChange(template.id)}
                  className={cn(
                    'w-full rounded-lg border p-2.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isSelected
                      ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-950/30'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-750'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                      {template.label}
                    </span>
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />}
                  </div>
                  {template.pipeline && template.pipeline.length > 0 && (
                    <div className="mt-1.5">
                      <MiniPipeline kinds={template.pipeline} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Selected pipeline detail */}
          {selectedPipeline.length > 0 && (
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-2 dark:border-neutral-800 dark:bg-neutral-800/50">
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedPipeline.map((kind, i) => {
                  const cfg = nodeKindConfig[kind as WorkflowNodeKind]
                  const Icon = nodeIcons[kind]
                  return (
                    <span key={`detail-${kind}-${i}`} className="flex items-center gap-1">
                      {i > 0 && (
                        <span className="text-[10px] text-neutral-300 dark:text-neutral-600">→</span>
                      )}
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium',
                          cfg?.bg || 'bg-neutral-100',
                          cfg?.color || 'text-neutral-600'
                        )}
                      >
                        {Icon && <Icon className="h-3 w-3" />}
                        {cfg?.labelKey ? t(cfg.labelKey) : kind}
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Advanced settings (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <Settings2 className="h-3 w-3" />
              <span>{t('workflow.advancedSettings')}</span>
              <ChevronDown
                className={cn('ml-auto h-3 w-3 transition-transform', showAdvanced && 'rotate-180')}
              />
            </button>

            {showAdvanced && (
              <div className="mt-1.5 space-y-2 rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-700">
                <div className="flex items-center gap-2">
                  <BrandCheckbox
                    id="wf-custom-rubric"
                    checked={customRubricEnabled}
                    onCheckedChange={(checked) => setCustomRubricEnabled(checked === true)}
                    size="sm"
                  />
                  <label htmlFor="wf-custom-rubric" className="text-[11px] text-neutral-600 dark:text-neutral-300">
                    {t('workflow.enableCustomRubric')}
                  </label>
                </div>

                {customRubricEnabled && (
                  <div className="space-y-2">
                    <BrandInput
                      aria-label={t('workflow.customRubricName')}
                      value={rubricName}
                      onChange={(e) => setRubricName(e.target.value)}
                      className="h-8 text-xs"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-0.5 block text-[10px] text-neutral-500">{t('workflow.passScore')}</label>
                        <BrandInput
                          aria-label={t('workflow.passScoreAria')}
                          type="number"
                          min={0}
                          max={100}
                          value={String(passScore)}
                          onChange={(e) => setPassScore(toInt(e.target.value, passScore))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[10px] text-neutral-500">{t('workflow.maxRepairRounds')}</label>
                        <BrandInput
                          aria-label={t('workflow.maxRepairRoundsAria')}
                          type="number"
                          min={0}
                          max={10}
                          value={String(maxRepairRounds)}
                          onChange={(e) => setMaxRepairRounds(toInt(e.target.value, maxRepairRounds))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                      <div className="flex items-center gap-2">
                        <BrandCheckbox
                          id="wf-rule-paragraph"
                          checked={paragraphRuleEnabled}
                          onCheckedChange={(checked) => setParagraphRuleEnabled(checked === true)}
                          size="sm"
                        />
                        <label htmlFor="wf-rule-paragraph">{t('workflow.paragraphRule')}</label>
                      </div>

                      {paragraphRuleEnabled && (
                        <div className="grid grid-cols-2 gap-2 pl-5">
                          <BrandInput
                            aria-label={t('workflow.paragraphMinAria')}
                            type="number"
                            min={1}
                            value={String(paragraphMin)}
                            onChange={(e) => setParagraphMin(toInt(e.target.value, paragraphMin))}
                            className="h-8 text-xs"
                          />
                          <BrandInput
                            aria-label={t('workflow.paragraphMaxAria')}
                            type="number"
                            min={1}
                            value={String(paragraphMax)}
                            onChange={(e) => setParagraphMax(toInt(e.target.value, paragraphMax))}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <BrandCheckbox
                          id="wf-rule-dialogue"
                          checked={dialogueRuleEnabled}
                          onCheckedChange={(checked) => setDialogueRuleEnabled(checked === true)}
                          size="sm"
                        />
                        <label htmlFor="wf-rule-dialogue">{t('workflow.dialoguePolicy')}</label>
                      </div>

                      {dialogueRuleEnabled && (
                        <div className="flex items-center gap-2 pl-5">
                          <BrandCheckbox
                            id="wf-rule-dialogue-single"
                            checked={allowSingleDialogue}
                            onCheckedChange={(checked) => setAllowSingleDialogue(checked === true)}
                            size="sm"
                          />
                          <label htmlFor="wf-rule-dialogue-single">{t('workflow.allowSingleDialogue')}</label>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <BrandCheckbox
                          id="wf-rule-hook"
                          checked={hookRuleEnabled}
                          onCheckedChange={(checked) => setHookRuleEnabled(checked === true)}
                          size="sm"
                        />
                        <label htmlFor="wf-rule-hook">{t('workflow.hookRule')}</label>
                      </div>

                      <div className="flex items-center gap-2">
                        <BrandCheckbox
                          id="wf-rule-cta"
                          checked={ctaRuleEnabled}
                          onCheckedChange={(checked) => setCtaRuleEnabled(checked === true)}
                          size="sm"
                        />
                        <label htmlFor="wf-rule-cta">{t('workflow.ctaRule')}</label>
                      </div>
                    </div>

                    {customRubricError && (
                      <p className="text-[11px] text-red-600 dark:text-red-400">{customRubricError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Custom workflow editor link */}
          {onOpenEditor && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onOpenEditor()
                setPopoverOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 transition-colors',
                'hover:border-neutral-400 hover:bg-neutral-100',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:bg-neutral-700'
              )}
            >
              <Workflow className="h-3.5 w-3.5" />
              {t('workflow.customEditor')}
            </button>
          )}

          {/* Workflow manager link */}
          {onOpenManager && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onOpenManager()
                setPopoverOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-neutral-500 transition-colors',
                'hover:bg-neutral-100 hover:text-neutral-700',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('workflow.manageWorkflows')}
            </button>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <BrandButton
              type="button"
              disabled={!canRun}
              onClick={handleRun}
              className="h-8 flex-1 gap-1.5 text-xs"
            >
              <Play className="h-3 w-3" />
              {t('workflow.simulateRun')}
            </BrandButton>

            {onRealRun && (
              <button
                type="button"
                disabled={!canRun}
                onClick={handleRealRun}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                  'border border-emerald-300 bg-emerald-50 text-emerald-700',
                  'hover:border-emerald-400 hover:bg-emerald-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/20',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/60'
                )}
              >
                <Zap className="h-3 w-3" />
                {t('workflow.realRun')}
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
