import { listWorkflowTemplateBundles } from './templates'

export interface WorkflowCatalogField {
  name: string
  description: string
  required: boolean
}

export interface WorkflowCatalogOutputField {
  name: string
  description: string
}

export interface WorkflowCatalogEntry {
  id: string
  label: string
  whenToUse: string
  defaultMode: 'dry_run' | 'real_run'
  requireConfirmationForRealRun: boolean
  estimatedRealRunCostHint: string
  inputs: WorkflowCatalogField[]
  outputs: WorkflowCatalogOutputField[]
}

interface WorkflowCatalogMetadata {
  whenToUse: string
  defaultMode?: 'dry_run' | 'real_run'
  requireConfirmationForRealRun?: boolean
  estimatedRealRunCostHint?: string
  inputs: WorkflowCatalogField[]
  outputs?: WorkflowCatalogOutputField[]
}

const WORKFLOW_CATALOG_METADATA: Record<string, WorkflowCatalogMetadata> = {
  novel_daily_v1: {
    whenToUse: 'For web novel or fiction chapter daily updates, requiring structured output with consistent style.',
    defaultMode: 'real_run',
    requireConfirmationForRealRun: true,
    estimatedRealRunCostHint: 'Medium token consumption (typically 3 nodes executing sequentially)',
    inputs: [
      { name: 'task_brief', description: 'Chapter task objective and plot intent', required: true },
      { name: 'chapter_goal', description: 'Chapter progression goal (conflict/revelation/foreshadowing)', required: false },
      { name: 'style_rules', description: 'Style constraints (paragraph length, taboos, tone)', required: false },
      { name: 'character_state', description: 'Character state/relationship updates', required: false },
    ],
    outputs: [
      { name: 'outline', description: 'Chapter outline' },
      { name: 'draft', description: 'Chapter draft' },
      { name: 'review_report', description: 'Review report' },
    ],
  },
  short_video_script_v1: {
    whenToUse: 'For short video script production, emphasizing opening hooks, rhythm, and CTA completeness.',
    defaultMode: 'real_run',
    requireConfirmationForRealRun: true,
    estimatedRealRunCostHint: 'Medium-high token consumption (multi-node serial + assembly)',
    inputs: [
      { name: 'task_brief', description: 'Video topic and传播goal', required: true },
      { name: 'target_audience', description: 'Target audience profile', required: false },
      { name: 'platform', description: 'Platform (Douyin/Kuaishou/Bilibili etc.)', required: false },
      { name: 'cta_goal', description: 'Conversion goal and call-to-action', required: false },
    ],
    outputs: [
      { name: 'creative_brief', description: 'Creative brief' },
      { name: 'script_draft', description: 'Script draft' },
      { name: 'review_report', description: 'Review report' },
      { name: 'final_script_package', description: 'Final script package' },
    ],
  },
  education_lesson_note_v1: {
    whenToUse: 'For teaching scenario lesson plans and lecture notes, emphasizing goal and pedagogy consistency.',
    defaultMode: 'real_run',
    requireConfirmationForRealRun: true,
    estimatedRealRunCostHint: 'Medium token consumption (3 nodes serial)',
    inputs: [
      { name: 'task_brief', description: 'Course topic and teaching objective', required: true },
      { name: 'grade_level', description: 'Grade level', required: false },
      { name: 'lesson_duration', description: 'Lesson duration', required: false },
      { name: 'teaching_constraints', description: 'Teaching constraints (time/resources/format)', required: false },
    ],
    outputs: [
      { name: 'lesson_outline', description: 'Lesson outline' },
      { name: 'lesson_note_draft', description: 'Lesson note draft' },
      { name: 'review_report', description: 'Review report' },
    ],
  },
}

function fallbackOutputs(workflowId: string): WorkflowCatalogOutputField[] {
  const bundle = listWorkflowTemplateBundles().find((item) => item.id === workflowId)
  if (!bundle) return []
  return bundle.workflow.nodes.map((node) => ({
    name: node.outputKey,
    description: `${node.kind} node output`,
  }))
}

function toCatalogEntry(workflowId: string, label: string): WorkflowCatalogEntry {
  const metadata = WORKFLOW_CATALOG_METADATA[workflowId]
  return {
    id: workflowId,
    label,
    whenToUse: metadata?.whenToUse || 'For structured content production workflows.',
    defaultMode: metadata?.defaultMode || 'dry_run',
    requireConfirmationForRealRun: metadata?.requireConfirmationForRealRun ?? true,
    estimatedRealRunCostHint: metadata?.estimatedRealRunCostHint || 'May consume significant tokens',
    inputs: metadata?.inputs || [],
    outputs: metadata?.outputs || fallbackOutputs(workflowId),
  }
}

export function getAvailableWorkflowCatalog(): WorkflowCatalogEntry[] {
  return listWorkflowTemplateBundles().map((bundle) => toCatalogEntry(bundle.id, bundle.label))
}

export function getWorkflowCatalogEntry(templateId: string): WorkflowCatalogEntry | undefined {
  return getAvailableWorkflowCatalog().find((entry) => entry.id === templateId)
}
