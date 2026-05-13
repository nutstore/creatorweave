import { LLM_PROVIDER_CONFIGS, isCustomProviderType, type LLMProviderType } from '@/agent/providers/types'
import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'

type WorkflowMode = 'dry_run' | 'real_run'

function normalizeMode(value: unknown): WorkflowMode {
  return value === 'real_run' ? 'real_run' : 'dry_run'
}

function normalizeRubricDsl(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return undefined
    }
  }
  return undefined
}

function normalizeInputMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const inputMap: Record<string, string> = {}
  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim()
    if (!normalizedKey) continue
    if (typeof fieldValue === 'string') {
      if (fieldValue.trim()) inputMap[normalizedKey] = fieldValue.trim()
      continue
    }
    if (
      typeof fieldValue === 'number' ||
      typeof fieldValue === 'boolean'
    ) {
      inputMap[normalizedKey] = String(fieldValue)
      continue
    }
    if (fieldValue && typeof fieldValue === 'object') {
      try {
        inputMap[normalizedKey] = JSON.stringify(fieldValue)
      } catch {
        // ignore unserializable field
      }
    }
  }
  return inputMap
}

export const runWorkflowDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_workflow',
    description:
      'Run a predefined workflow template. Supports dry_run (simulation/validation) and real_run (actual generation). ' +
      'Always supply workflow_id, and pass inputs as key-value object based on available_workflows metadata.',
    parameters: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'Workflow template id from available_workflows.',
        },
        mode: {
          type: 'string',
          enum: ['dry_run', 'real_run'],
          description: 'Execution mode. dry_run validates flow; real_run executes with LLM calls.',
        },
        inputs: {
          type: 'object',
          description:
            'Key-value inputs for the workflow. Keys should match available_workflows input names.',
        },
        rubric_dsl: {
          type: 'string',
          description: 'Optional rubric DSL JSON string override.',
        },
        simulate_review_failures: {
          type: 'number',
          description: 'Optional dry_run-only parameter to simulate review failures.',
        },
        confirmed: {
          type: 'boolean',
          description:
            'For real_run, set true only after user explicitly confirms execution/token usage.',
        },
      },
      required: ['workflow_id'],
    },
  },
}

export const runWorkflowExecutor: ToolExecutor = async (args, context) => {
  const workflowId = typeof args.workflow_id === 'string' ? args.workflow_id.trim() : ''
  if (!workflowId) {
    return JSON.stringify({ ok: false, error: 'workflow_id is required' })
  }

  const mode = normalizeMode(args.mode)
  const rubricDsl = normalizeRubricDsl(args.rubric_dsl)
  const inputs = normalizeInputMap(args.inputs)

  const { getWorkflowCatalogEntry, getAvailableWorkflowCatalog } = await import(
    '@/agent/workflow/workflow-catalog'
  )
  const workflowEntry = getWorkflowCatalogEntry(workflowId)
  if (!workflowEntry) {
    return JSON.stringify({
      ok: false,
      error: `unknown workflow_id: ${workflowId}`,
      available_workflows: getAvailableWorkflowCatalog().map((item) => item.id),
    })
  }

  const missingInputs = workflowEntry.inputs
    .filter((field) => field.required)
    .filter((field) => !inputs[field.name])
    .map((field) => field.name)

  if (missingInputs.length > 0) {
    return JSON.stringify({
      ok: false,
      error: 'missing_required_inputs',
      workflow_id: workflowId,
      missing_inputs: missingInputs,
      message: `Missing required workflow inputs: ${missingInputs.join(', ')}`,
    })
  }

  if (mode === 'dry_run') {
    const { runWorkflowTemplateDryRun } = await import('@/agent/workflow/dry-run')
    const simulateReviewFailures =
      typeof args.simulate_review_failures === 'number'
        ? Math.max(0, Math.floor(args.simulate_review_failures))
        : undefined

    const result = await runWorkflowTemplateDryRun({
      templateId: workflowId,
      rubricDsl,
      simulateReviewFailures,
    })

    if (!result.ok) {
      return JSON.stringify({
        ok: false,
        mode,
        workflow_id: workflowId,
        errors: result.errors,
      })
    }

    return JSON.stringify({
      ok: true,
      mode,
      workflow_id: workflowId,
      label: result.label,
      status: result.status,
      summary: result.summary,
      execution: result.execution,
    })
  }

  const confirmed = args.confirmed === true
  if (workflowEntry.requireConfirmationForRealRun && !confirmed) {
    return JSON.stringify({
      ok: false,
      needs_confirmation: true,
      mode,
      workflow_id: workflowId,
      message:
        `Workflow ${workflowId} requires confirmation before real_run. ` +
        'Ask user to confirm and call run_workflow again with confirmed=true.',
      estimated_cost_hint: workflowEntry.estimatedRealRunCostHint,
    })
  }

  const settingsStateModule = await import('@/store/settings.store')
  const settingsState = settingsStateModule.useSettingsStore.getState()
  const effectiveConfig = settingsState.getEffectiveProviderConfig()
  if (!effectiveConfig) {
    return JSON.stringify({
      ok: false,
      mode,
      workflow_id: workflowId,
      error: 'missing_provider_config',
      message: 'No effective provider config found.',
    })
  }

  const providerType = settingsState.providerType as LLMProviderType
  const providerConfig =
    isCustomProviderType(providerType)
      ? effectiveConfig
      : {
          apiKeyProviderKey: providerType,
          baseUrl: LLM_PROVIDER_CONFIGS[providerType].baseURL,
          modelName: effectiveConfig.modelName || LLM_PROVIDER_CONFIGS[providerType].modelName,
        }

  const sqliteModule = await import('@/sqlite')
  const apiKey = await sqliteModule.getApiKeyRepository().load(providerConfig.apiKeyProviderKey)
  if (!apiKey) {
    return JSON.stringify({
      ok: false,
      mode,
      workflow_id: workflowId,
      error: 'missing_api_key',
      message: `API key not configured for provider key: ${providerConfig.apiKeyProviderKey}`,
    })
  }

  const { getWorkflowTemplateBundle } = await import('@/agent/workflow/templates')
  const workflowBundle = getWorkflowTemplateBundle(workflowId)
  if (workflowBundle) {
    context.workflowProgress?.onStart?.({
      templateId: workflowBundle.id,
      label: workflowBundle.label,
      nodes: workflowBundle.workflow.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        label: node.kind,
      })),
    })
  }

  const { runRealWorkflow } = await import('@/agent/workflow/real-run')
  const { buildEnhancedWorkflowNodePrompt } = await import('@/agent/workflow/node-enhancements')
  const result = await runRealWorkflow({
    templateId: workflowId,
    rubricDsl,
    apiKey,
    providerType,
    baseUrl: providerConfig.baseUrl,
    model: providerConfig.modelName,
    initialInputs: inputs,
    abortSignal: context.abortSignal,
    // Reuse AgentLoop's enhancement pipeline for each workflow node
    enhanceSystemPrompt: (basePrompt, userMessage) =>
      buildEnhancedWorkflowNodePrompt(basePrompt, userMessage, {
        projectId: context.projectId ?? null,
        directoryHandle: context.directoryHandle ?? null,
        currentAgentId: context.currentAgentId ?? null,
        workspaceId: context.workspaceId ?? null,
      }),
    onNodeStart: (nodeId, kind) => {
      context.workflowProgress?.onNodeStart?.({ nodeId, kind })
    },
    onNodeComplete: (nodeId, output) => {
      context.workflowProgress?.onNodeComplete?.({ nodeId, output })
    },
    onNodeError: (nodeId, error) => {
      context.workflowProgress?.onNodeError?.({ nodeId, error })
    },
  })

  context.workflowProgress?.onFinish?.({
    status: result.ok ? result.status : 'failed',
    totalTokens: result.ok ? result.totalTokens : undefined,
    errors: result.ok ? [] : result.errors,
  })

  if (!result.ok) {
    return JSON.stringify({
      ok: false,
      mode,
      workflow_id: workflowId,
      errors: result.errors,
    })
  }

  return JSON.stringify({
    ok: true,
    mode,
    workflow_id: workflowId,
    label: result.label,
    status: result.status,
    summary: result.summary,
    execution: result.execution,
    node_outputs: result.nodeOutputs,
    total_tokens: result.totalTokens,
  })
}

export const workflowPromptDoc: ToolPromptDoc = {
  category: 'workflow',
  section: '### Workflow Execution',
  lines: [
    '- `run_workflow(workflow_id, mode?, inputs?, ...)` - Run predefined structured workflows for multi-step content generation/review',
  ],
}
