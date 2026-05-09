import { describe, expect, it } from 'vitest'
import {
  WORKFLOW_DRY_RUN_MODEL_PREFIX,
  parseWorkflowTemplateIdFromModelName,
  runWorkflowTemplateDryRun,
} from '../workflow/dry-run'

const customRubricDsl = JSON.stringify(
  {
    id: 'custom_novel_rubric',
    version: 1,
    name: 'Custom Novel Rubric',
    passCondition: 'total_score >= 1 and hard_fail_count == 0',
    retryPolicy: {
      maxRepairRounds: 0,
    },
    rules: [
      {
        id: 'paragraph_policy',
        checker: 'paragraph_sentence_count',
        params: {
          target: 'narrative',
          min: 2,
          max: 8,
        },
        weight: 1,
        threshold: {
          violationRateLte: 1,
        },
        failAction: 'auto_repair',
        severity: 'medium',
      },
    ],
  },
  null,
  2
)

describe('workflow dry-run', () => {
  it('parses workflow template id from model name', () => {
    expect(parseWorkflowTemplateIdFromModelName('workflow:novel_daily_v1')).toBe('novel_daily_v1')
    expect(parseWorkflowTemplateIdFromModelName('mock-model')).toBeNull()
    expect(parseWorkflowTemplateIdFromModelName(`${WORKFLOW_DRY_RUN_MODEL_PREFIX}`)).toBeNull()
  })

  it('returns error for unknown template', async () => {
    const result = await runWorkflowTemplateDryRun({ templateId: 'unknown' })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.join(' ')).toContain('unknown')
  })

  it('runs default template and returns passed status', async () => {
    const result = await runWorkflowTemplateDryRun({ templateId: 'novel_daily_v1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.templateId).toBe('novel_daily_v1')
    expect(result.label).toBe('小说日更')
    expect(result.status).toBe('passed')
    expect(result.summary).toContain('Workflow dry run')
    expect(result.summary).toContain('Execution order')
  })

  it('returns needs_human when review fails over repair limit', async () => {
    const result = await runWorkflowTemplateDryRun({
      templateId: 'novel_daily_v1',
      simulateReviewFailures: 3,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.status).toBe('needs_human')
    expect(result.summary).toContain('needs_human')
  })

  it('supports overriding rubric by DSL', async () => {
    const result = await runWorkflowTemplateDryRun({
      templateId: 'novel_daily_v1',
      rubricDsl: customRubricDsl,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.summary).toContain('Custom Novel Rubric')
    expect(result.summary).toContain('custom_novel_rubric@v1')
  })

  it('returns error when rubric DSL is invalid', async () => {
    const result = await runWorkflowTemplateDryRun({
      templateId: 'novel_daily_v1',
      rubricDsl: '{invalid-json}',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.join(' ')).toContain('invalid JSON')
  })
})
