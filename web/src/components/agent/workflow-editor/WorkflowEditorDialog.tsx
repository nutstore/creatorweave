/**
 * WorkflowEditorDialog - Visual DAG editor dialog.
 * Figma-style layout with canvas + properties panel.
 * Supports both built-in templates and custom workflows.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Play, RotateCcw, Save, X, ChevronLeft, Plus, FolderOpen } from 'lucide-react'
import {
  BrandButton,
  BrandDialog,
  BrandDialogContent,
  BrandDialogClose,
  BrandSelect,
  BrandSelectContent,
  BrandSelectGroup,
  BrandSelectItem,
  BrandSelectSeparator,
  BrandSelectTrigger,
  BrandSelectValue,
} from '@creatorweave/ui'

import { listWorkflowTemplateBundles } from '@/agent/workflow/templates'
import type { WorkflowTemplate } from '@/agent/workflow/types'
import {
  useCustomWorkflowStore,
  useEnabledWorkflows,
} from '@/store/custom-workflow.store'
import { useWorkflowEditor } from './useWorkflowEditor'
import { WorkflowCanvas } from './WorkflowCanvas'
import { NodePropertiesPanel } from './NodePropertiesPanel'
import type { WorkflowNodeData } from './workflow-to-flow'
import { useT } from '@/i18n'

export type { WorkflowNodeData }

// Prefix for custom workflow IDs in the selector
const CUSTOM_PREFIX = 'custom:'

interface WorkflowEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRunDryRun?: (template: WorkflowTemplate) => void
  initialTemplateId?: string
}

export function WorkflowEditorDialog({
  open,
  onOpenChange,
  onRunDryRun,
  initialTemplateId,
}: WorkflowEditorDialogProps) {
  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <BrandDialogContent className="flex h-[90vh] w-[94vw] max-w-[1600px] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-neutral-50 p-0 shadow-2xl dark:bg-neutral-950">
        <ReactFlowProvider>
          <WorkflowEditorInner
            onRunDryRun={onRunDryRun}
            initialTemplateId={initialTemplateId}
            open={open}
            onOpenChange={onOpenChange}
          />
        </ReactFlowProvider>
      </BrandDialogContent>
    </BrandDialog>
  )
}

function WorkflowEditorInner({
  onRunDryRun,
  initialTemplateId,
  open,
  onOpenChange,
}: {
  onRunDryRun?: (template: WorkflowTemplate) => void
  initialTemplateId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const {
    nodes,
    edges,
    selectedNodeId,
    isDirty,
    validationResult,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    setSelectedNodeId,
    updateNodeData,
    deleteNode,
    loadTemplate,
    loadCustomWorkflow,
    createNewWorkflow,
    exportTemplate,
    isCustomWorkflow,
    saveCustomWorkflow,
    reset,
  } = useWorkflowEditor()
  const builtInTemplates = useMemo(() => listWorkflowTemplateBundles(), [])
  const customWorkflows = useEnabledWorkflows()
  const { loadWorkflows } = useCustomWorkflowStore()
  const [templateId, setTemplateId] = useState(initialTemplateId || '')
  const [isSaving, setIsSaving] = useState(false)
  const hasInitializedOnOpenRef = useRef(false)

  // Get selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return nodes.find((n) => n.id === selectedNodeId) || null
  }, [nodes, selectedNodeId])

  // Load custom workflows when dialog opens
  useEffect(() => {
    if (open) {
      loadWorkflows()
    }
  }, [open, loadWorkflows])

  // Load initial template when dialog opens
  useEffect(() => {
    if (!open) {
      hasInitializedOnOpenRef.current = false
      return
    }
    if (hasInitializedOnOpenRef.current) return

    // Handle "new workflow" special case
    if (initialTemplateId === '__new__') {
      createNewWorkflow()
      setTemplateId('')
      hasInitializedOnOpenRef.current = true
      return
    }

    // Handle custom workflow
    if (initialTemplateId?.startsWith(CUSTOM_PREFIX)) {
      const workflowId = initialTemplateId.slice(CUSTOM_PREFIX.length)
      const workflow = customWorkflows.find((w) => w.id === workflowId)
      if (workflow) {
        loadCustomWorkflow(workflow)
        setTemplateId(initialTemplateId)
        hasInitializedOnOpenRef.current = true
        return
      }
      // Wait for custom workflows to load
      return
    }

    // Handle built-in template
    const preferredId = initialTemplateId || builtInTemplates[0]?.id
    if (!preferredId) return

    const bundle = builtInTemplates.find((b) => b.id === preferredId)
    if (!bundle) return

    loadTemplate(bundle.workflow)
    setTemplateId(bundle.id)
    hasInitializedOnOpenRef.current = true
  }, [
    open,
    initialTemplateId,
    builtInTemplates,
    customWorkflows,
    createNewWorkflow,
    loadCustomWorkflow,
    loadTemplate,
  ])

  const handleTemplateSelect = useCallback(
    (id: string) => {
      if (!id) return
      if (isDirty && !window.confirm(t('workflowEditorDialog.unsavedChangesConfirm'))) {
        return
      }

      // Handle "new workflow"
      if (id === '__new__') {
        createNewWorkflow()
        setTemplateId('')
        return
      }

      // Handle custom workflow
      if (id.startsWith(CUSTOM_PREFIX)) {
        const workflowId = id.slice(CUSTOM_PREFIX.length)
        const workflow = customWorkflows.find((w) => w.id === workflowId)
        if (workflow) {
          loadCustomWorkflow(workflow)
          setTemplateId(id)
        }
        return
      }

      // Handle built-in template
      const bundle = builtInTemplates.find((b) => b.id === id)
      if (!bundle) return

      loadTemplate(bundle.workflow)
      setTemplateId(id)
    },
    [
      isDirty,
      createNewWorkflow,
      loadCustomWorkflow,
      loadTemplate,
      builtInTemplates,
      customWorkflows,
    ]
  )

  const handleRun = useCallback(() => {
    const template = exportTemplate()
    onRunDryRun?.(template)
  }, [exportTemplate, onRunDryRun])

  const handleSave = useCallback(async () => {
    if (!isCustomWorkflow) {
      // For built-in templates, just run the dry-run callback
      const template = exportTemplate()
      onRunDryRun?.(template)
      return
    }

    // Save custom workflow to SQLite
    setIsSaving(true)
    try {
      const success = await saveCustomWorkflow()
      if (success) {
        // Show success feedback (could add toast here)
        console.log('[WorkflowEditor] Workflow saved successfully')
      } else {
        console.error('[WorkflowEditor] Failed to save workflow')
      }
    } finally {
      setIsSaving(false)
    }
  }, [isCustomWorkflow, exportTemplate, saveCustomWorkflow, onRunDryRun])

  // Get display name for current selection
  const getDisplayName = useCallback(() => {
    if (!templateId) return t('workflowEditorDialog.untitledWorkflow')

    if (templateId === '__new__') return t('workflowEditorDialog.newWorkflow')

    if (templateId.startsWith(CUSTOM_PREFIX)) {
      const workflowId = templateId.slice(CUSTOM_PREFIX.length)
      const workflow = customWorkflows.find((w) => w.id === workflowId)
      return workflow?.name || t('workflowEditorDialog.customWorkflow')
    }

    const template = builtInTemplates.find((t) => t.id === templateId)
    return template?.label || t('workflowEditorDialog.workflow')
  }, [templateId, builtInTemplates, customWorkflows, t])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200/80 bg-white px-4 dark:border-neutral-800/80 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('workflowEditorDialog.back')}
          </button>

          <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
              <div className="h-3 w-3 rounded-sm bg-neutral-400 dark:bg-neutral-500" />
            </div>
            <h1 className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              {t('workflowEditorDialog.workflowEditor')}
            </h1>
          </div>

          {templateId && (
            <>
              <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                {getDisplayName()}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-[180px]">
            <BrandSelect value={templateId} onValueChange={handleTemplateSelect}>
              <BrandSelectTrigger className="h-8 text-xs bg-neutral-100 dark:bg-neutral-800 border-0">
                <BrandSelectValue placeholder={t('workflowEditorDialog.switchTemplate')} />
              </BrandSelectTrigger>
              <BrandSelectContent>
                {/* New workflow option */}
                <BrandSelectGroup>
                  <BrandSelectItem value="__new__">
                    <div className="flex items-center gap-2">
                      <Plus className="h-3 w-3" />
                      <span>{t('workflowEditorDialog.newWorkflow')}</span>
                    </div>
                  </BrandSelectItem>
                </BrandSelectGroup>

                <BrandSelectSeparator />

                {/* Custom workflows group */}
                {customWorkflows.length > 0 && (
                  <>
                    <BrandSelectGroup>
                      <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                        {t('workflowEditorDialog.myWorkflows')}
                      </div>
                      {customWorkflows.map((workflow) => (
                        <BrandSelectItem
                          key={workflow.id}
                          value={`${CUSTOM_PREFIX}${workflow.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-3 w-3 text-neutral-400" />
                            <span>{workflow.name}</span>
                          </div>
                        </BrandSelectItem>
                      ))}
                    </BrandSelectGroup>
                    <BrandSelectSeparator />
                  </>
                )}

                {/* Built-in templates group */}
                <BrandSelectGroup>
                  <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {t('workflowEditorDialog.builtInTemplates')}
                  </div>
                  {builtInTemplates.map((template) => (
                    <BrandSelectItem key={template.id} value={template.id}>
                      {template.label}
                    </BrandSelectItem>
                  ))}
                </BrandSelectGroup>
              </BrandSelectContent>
            </BrandSelect>
          </div>

          <BrandDialogClose asChild>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              aria-label={t('workflowEditorDialog.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </BrandDialogClose>
        </div>
      </header>

      {/* Main content: Canvas + Properties Panel */}
      <div className="flex min-h-0 flex-1">
        {/* Canvas area */}
        <div className="relative min-w-0 flex-1">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            onUpdateNodeData={updateNodeData}
            onDeleteNode={deleteNode}
          />

          {/* Floating action bar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-md dark:border-neutral-700/60 dark:bg-neutral-900/95">
              {/* Status indicator */}
              <div className="flex items-center gap-1.5 px-1">
                {validationResult.valid ? (
                  <>
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t('workflowEditorDialog.valid')}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                      {t('workflowEditorDialog.errors', { count: validationResult.errors.length })}
                    </span>
                  </>
                )}
              </div>

              <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

              {/* Actions */}
                <BrandButton
                  variant="ghost"
                  disabled={!isDirty}
                  onClick={reset}
                  className="h-7 gap-1.5 px-2.5 text-[11px] font-medium"
                >
                <RotateCcw className="h-3 w-3" />
                {t('workflowEditorDialog.reset')}
              </BrandButton>

                <BrandButton
                  variant="secondary"
                  disabled={!validationResult.valid || nodes.length === 0 || isSaving}
                  onClick={handleSave}
                  className="h-7 gap-1.5 px-2.5 text-[11px] font-medium"
                >
                {isSaving ? (
                  <RotateCcw className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {t('workflowEditorDialog.save')}
              </BrandButton>

                <BrandButton
                  disabled={!validationResult.valid || nodes.length === 0}
                  onClick={handleRun}
                  className="h-7 gap-1.5 px-2.5 text-[11px] font-medium"
                >
                <Play className="h-3 w-3" />
                {t('workflowEditorDialog.runSimulation')}
              </BrandButton>
            </div>
          </div>
        </div>

        {/* Properties Panel - Figma style */}
        <div className="w-[260px] shrink-0 border-l border-neutral-200/80 bg-white/95 backdrop-blur-sm dark:border-neutral-700/80 dark:bg-neutral-900/95">
          <NodePropertiesPanel
            selectedNode={selectedNode}
            onUpdateNodeData={updateNodeData}
            onDeleteNode={deleteNode}
          />
        </div>
      </div>
    </div>
  )
}
