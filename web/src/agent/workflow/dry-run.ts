import type { WorkflowRunStatus } from './run-state-machine'
import { getWorkflowTemplateBundle } from './templates'
import type { WorkflowTemplate } from './types'
import { executeWorkflowRun, type ExecuteWorkflowRunResult } from './workflow-executor'
import { parseRubricDsl, type RubricDefinition } from './rubric'

export const WORKFLOW_DRY_RUN_MODEL_PREFIX = 'workflow:'

export interface RunWorkflowTemplateDryRunOptions {
  templateId: string
  simulateReviewFailures?: number
  rubricDsl?: string
}

export type RunWorkflowTemplateDryRunResult =
  | {
      ok: true
      templateId: string
      label: string
      status: WorkflowRunStatus
      summary: string
      execution: ExecuteWorkflowRunResult
    }
  | {
      ok: false
      errors: string[]
    }

export function parseWorkflowTemplateIdFromModelName(modelName: string | null | undefined): string | null {
  if (!modelName) return null

  if (!modelName.startsWith(WORKFLOW_DRY_RUN_MODEL_PREFIX)) {
    return null
  }

  const templateId = modelName.slice(WORKFLOW_DRY_RUN_MODEL_PREFIX.length).trim()
  if (!templateId) return null

  return templateId
}

function formatDryRunSummary(
  templateId: string,
  label: string,
  rubric: RubricDefinition,
  execution: ExecuteWorkflowRunResult
): string {
  const lines: string[] = [
    `Workflow dry run: ${label} (${templateId})`,
    `Rubric: ${rubric.name} (${rubric.id}@v${rubric.version})`,
    `Status: ${execution.status}`,
    `Execution order: ${execution.executionOrder.join(' → ')}`,
    `Executed nodes: ${execution.executedNodeIds.join(' → ') || '(none)'}`,
    `Repair rounds: ${execution.repairRound}`,
  ]

  if (execution.errors.length > 0) {
    lines.push('Errors:')
    for (const error of execution.errors) {
      lines.push(`- ${error}`)
    }
  }

  return lines.join('\n')
}

/**
 * Run a dry-run with a custom WorkflowTemplate (not from preset bundle).
 * Uses a default rubric if none provided.
 */
export async function runCustomWorkflowDryRun(
  workflow: WorkflowTemplate,
  rubricDsl?: string
): Promise<RunWorkflowTemplateDryRunResult> {
  let rubric: RubricDefinition = {
    id: 'custom_default',
    version: 1,
    name: 'Custom Rubric',
    passCondition: 'total_score >= 80 and hard_fail_count == 0',
    retryPolicy: { maxRepairRounds: 2 },
    rules: [],
  }

  const trimmedRubricDsl = rubricDsl?.trim()
  if (trimmedRubricDsl) {
    const parsed = parseRubricDsl(trimmedRubricDsl)
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors }
    }
    rubric = parsed.rubric
  }

  const execution = await executeWorkflowRun({
    workflow,
    rubric,
    executeNode: async () => {
      return { status: 'success' }
    },
    repair: async () => {
      // Dry-run mode only simulates repair attempts.
    },
  })

  return {
    ok: true,
    templateId: workflow.id,
    label: workflow.name,
    status: execution.status,
    summary: formatDryRunSummary(workflow.id, workflow.name, rubric, execution),
    execution,
  }
}

export async function runWorkflowTemplateDryRun(
  options: RunWorkflowTemplateDryRunOptions
): Promise<RunWorkflowTemplateDryRunResult> {
  const bundle = getWorkflowTemplateBundle(options.templateId)
  if (!bundle) {
    return {
      ok: false,
      errors: [`unknown workflow template: ${options.templateId}`],
    }
  }

  let rubric = bundle.rubric
  const trimmedRubricDsl = options.rubricDsl?.trim()
  if (trimmedRubricDsl) {
    const parsed = parseRubricDsl(trimmedRubricDsl)
    if (!parsed.ok) {
      return {
        ok: false,
        errors: parsed.errors,
      }
    }
    rubric = parsed.rubric
  }

  let remainingReviewFailures = Math.max(0, options.simulateReviewFailures || 0)

  const execution = await executeWorkflowRun({
    workflow: bundle.workflow,
    rubric,
    executeNode: async ({ node }) => {
      if (node.kind === 'review' && remainingReviewFailures > 0) {
        remainingReviewFailures -= 1
        return {
          status: 'review_failed',
          reason: 'simulated review failure',
        }
      }

      return {
        status: 'success',
      }
    },
    repair: async () => {
      // Dry-run mode only simulates repair attempts.
    },
  })

  return {
    ok: true,
    templateId: bundle.id,
    label: bundle.label,
    status: execution.status,
    summary: formatDryRunSummary(bundle.id, bundle.label, rubric, execution),
    execution,
  }
}
