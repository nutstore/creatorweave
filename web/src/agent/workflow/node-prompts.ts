import type { ConditionConfig, WorkflowNodeKind } from './types'

const kindInstructions: Record<WorkflowNodeKind, string> = {
  plan: 'Based on the input below, create a detailed outline. The outline should be well-structured and hierarchical, providing a complete framework for subsequent content creation.',
  produce: 'Create content based on the outline below. The content should closely follow the outline points with fluent language and complete structure.',
  review: `Please review the content below and provide a score. Return the review result in JSON format with the following fields:
- "score": Overall score (0-100)
- "passed": Whether passed (boolean)
- "issues": List of issues found
- "suggestions": List of improvement suggestions

Example format:
\`\`\`json
{"score": 85, "passed": true, "issues": [], "suggestions": ["Could add more descriptive details"]}
\`\`\``,
  repair: 'Based on the review feedback, fix the issues in the content below. Maintain the original style and structure, only improving the identified shortcomings.',
  assemble: 'Integrate the following materials and output the final version. The final version should combine the advantages of all inputs while maintaining consistent style and complete structure.',
  condition: `Based on the input below, determine the condition branch. Return format:
\`\`\`json
{"branch": "branch_name", "reason": "reason_for_choice"}
\`\`\``,
}

export function getDefaultNodeInstruction(kind: WorkflowNodeKind): string {
  return kindInstructions[kind]
}

const roleLabel: Record<string, string> = {
  plot_planner: 'Plot Planner',
  chapter_writer: 'Chapter Writer',
  style_reviewer: 'Style Reviewer',
  campaign_planner: 'Marketing Planner',
  script_writer: 'Script Writer',
  video_script_reviewer: 'Video Script Reviewer',
  script_packager: 'Script Packager',
  lesson_planner: 'Lesson Planner',
  educator_writer: 'Lesson Writer',
  pedagogy_reviewer: 'Pedagogy Reviewer',
}

/**
 * Build instruction text for condition node based on its configuration.
 */
function buildConditionInstruction(config: ConditionConfig): string {
  const modeDesc = config.mode === 'rule'
    ? 'Select a branch based on the following rule conditions:'
    : 'Select the most appropriate branch based on the following description:'

  const branchLines = config.branches.map((branch) => {
    if (config.mode === 'rule') {
      return `  - "${branch.label}": condition ${branch.condition || '(fallback)'}`
    }
    return `  - "${branch.label}": ${branch.description || '(no description)'}`
  })

  const customPrompt = config.prompt ? `\n\nDecision hint: ${config.prompt}` : ''
  const fallbackNote = config.fallbackBranch
    ? `\nIf no branch matches, select "${config.fallbackBranch}".`
    : ''

  return `${modeDesc}
${branchLines.join('\n')}
${fallbackNote}
${customPrompt}

Return the selected branch in JSON format:
\`\`\`json
{"branch": "branch_name", "reason": "reason_for_choice"}
\`\`\``
}

export function buildNodeSystemPrompt(
  kind: WorkflowNodeKind,
  agentRole: string,
  taskInstruction?: string,
  conditionConfig?: ConditionConfig,
): string {
  const label = roleLabel[agentRole] || agentRole
  const customInstruction = taskInstruction?.trim()

  let instruction: string
  if (customInstruction) {
    instruction = customInstruction
  } else if (kind === 'condition' && conditionConfig) {
    instruction = buildConditionInstruction(conditionConfig)
  } else {
    instruction = getDefaultNodeInstruction(kind)
  }

  return `You are a ${label}. ${instruction}`
}

/**
 * Build the user message for a workflow node, incorporating upstream inputs.
 */
export function buildNodeUserMessage(
  inputs: Map<string, unknown>,
): string {
  if (inputs.size === 0) {
    return 'Please begin work.'
  }

  const parts: string[] = ['Outputs from upstream nodes:\n']
  for (const [key, content] of inputs) {
    const contentStr =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    parts.push(`--- ${key} ---\n${contentStr}\n`)
  }
  return parts.join('\n')
}
