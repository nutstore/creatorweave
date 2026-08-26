/**
 * FlowTemplateManager — save current workflow as template, browse and load templates.
 *
 * Two entry points:
 * - "Save as template" button → opens a name dialog
 * - "Template library" button → opens a dropdown listing all saved templates
 */

import { useState, useEffect, useCallback } from 'react'
import { Bookmark, BookmarkPlus, FileDown, Trash2, X, FolderOpen, Globe } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@creatorweave/ui'
import { useFlowStore } from '@/store/flow.store'
import { GLOBAL_PROJECT_ID } from '@/sqlite/repositories/flow-template.repository'
import type { FlowTemplate } from '@/agent/flow/types'

/** Per-button tooltip wrapper. */
function IconButtonTooltip({ label, side = 'bottom', children }: { label: string; side?: 'top' | 'bottom' | 'left' | 'right'; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface FlowTemplateManagerProps {
  conversationId: string
  /** When true (fullscreen), show text labels. When false (compact), show icon-only with tooltip. */
  showLabels?: boolean
}

export function FlowTemplateManager({ conversationId, showLabels = true }: FlowTemplateManagerProps) {
  const activeInstance = useFlowStore((s) => s.activeInstance)
  const templates = useFlowStore((s) => s.templates)
  const loadTemplates = useFlowStore((s) => s.loadTemplates)
  const createTemplate = useFlowStore((s) => s.createTemplate)
  const saveTemplate = useFlowStore((s) => s.saveTemplate)
  const deleteTemplate = useFlowStore((s) => s.deleteTemplate)
  const createInstanceFromTemplate = useFlowStore((s) => s.createInstanceFromTemplate)

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [isGlobal, setIsGlobal] = useState(false)

  // Resolve projectId from workspace
  const [projectId, setProjectId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { getWorkspaceRepository } = await import(
          '@/sqlite/repositories/workspace.repository'
        )
        const ws = await getWorkspaceRepository().findWorkspaceById(conversationId)
        if (!cancelled) setProjectId(ws?.projectId ?? 'default')
      } catch {
        if (!cancelled) setProjectId('default')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  // Load templates when projectId is available
  useEffect(() => {
    if (projectId) loadTemplates(projectId)
  }, [projectId, loadTemplates])

  const handleSave = useCallback(async () => {
    if (!activeInstance || !projectId) return
    const name = templateName.trim() || `工作流 ${new Date().toLocaleDateString('zh-CN')}`
    const targetProjectId = isGlobal ? GLOBAL_PROJECT_ID : projectId
    await createTemplate(targetProjectId, name, activeInstance.nodes, activeInstance.edges)
    setShowSaveDialog(false)
    setTemplateName('')
    setIsGlobal(false)
  }, [activeInstance, projectId, templateName, isGlobal, createTemplate])

  const handleLoad = useCallback(
    (templateId: string) => {
      createInstanceFromTemplate(conversationId, templateId)
      setShowLibrary(false)
    },
    [conversationId, createInstanceFromTemplate]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTemplate(id)
    },
    [deleteTemplate]
  )

  const handleToggleScope = useCallback(
    async (template: FlowTemplate) => {
      const isGlobal = template.projectId === GLOBAL_PROJECT_ID
      const newProjectId = isGlobal ? (projectId ?? 'default') : GLOBAL_PROJECT_ID
      await saveTemplate({
        ...template,
        projectId: newProjectId,
        updatedAt: Date.now(),
      })
    },
    [projectId, saveTemplate]
  )

  const hasNodes = (activeInstance?.nodes.length ?? 0) > 0

  // Split templates into global vs project-scoped
  const globalTemplates = templates.filter((t) => t.projectId === GLOBAL_PROJECT_ID)
  const projectTemplates = templates.filter((t) => t.projectId !== GLOBAL_PROJECT_ID)

  return (
    <>
      {/* Save as template button */}
      {showLabels ? (
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={!hasNodes}
          className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <BookmarkPlus className="h-3 w-3" />
          存模板
        </button>
      ) : (
        <IconButtonTooltip label="保存为模板">
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={!hasNodes}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
          </button>
        </IconButtonTooltip>
      )}

      {/* Template library button */}
      {showLabels ? (
        <button
          onClick={() => setShowLibrary(!showLibrary)}
          className="relative flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <FolderOpen className="h-3 w-3" />
          模板库
          {templates.length > 0 && (
            <span className="flex h-3 min-w-3 items-center justify-center rounded-full bg-primary-500 px-0.5 text-[8px] font-bold text-white">
              {templates.length}
            </span>
          )}
        </button>
      ) : (
        <IconButtonTooltip label="模板库">
          <button
            onClick={() => setShowLibrary(!showLibrary)}
            className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {templates.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary-500 px-0.5 text-[8px] font-bold text-white">
                {templates.length}
              </span>
            )}
          </button>
        </IconButtonTooltip>
      )}
      {showSaveDialog && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="w-[360px] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">
              <Bookmark className="h-4 w-4 text-primary-500" />
              保存为模板
            </h3>
            <input
              autoFocus
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
              placeholder="模板名称，如：技术热点追踪"
              className="mb-3 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700 placeholder:text-neutral-400 focus:border-primary-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            />
            <div className="mb-3 text-[10px] text-neutral-400">
              将保存 {activeInstance?.nodes.length ?? 0} 个节点和{' '}
              {activeInstance?.edges.length ?? 0} 条连线
            </div>

            {/* Global toggle */}
            <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-primary-500"
              />
              <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
                全局模板
              </span>
              <span className="text-[9px] text-neutral-400">
                勾选后所有项目都能看到此模板
              </span>
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="rounded-md px-3 py-1.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-primary-600"
              >
                <BookmarkPlus className="h-3 w-3" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Template library dropdown ── */}
      {showLibrary && (
        <div className="absolute right-3 top-11 z-50 w-[280px] rounded-xl border border-neutral-200 bg-white p-2 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
              模板库
            </span>
            <button
              onClick={() => setShowLibrary(false)}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="py-6 text-center">
              <Bookmark className="mx-auto mb-2 h-6 w-6 text-neutral-300 dark:text-neutral-700" />
              <p className="text-[10px] text-neutral-400">还没有保存的模板</p>
              <p className="mt-1 text-[10px] text-neutral-400">构建工作流后点「存模板」</p>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto">
              {/* Global templates section */}
              {globalTemplates.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center gap-1 px-1 py-1">
                    <Globe className="h-2.5 w-2.5 text-primary-400" />
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-primary-400">
                      全局模板
                    </span>
                    <span className="text-[8px] text-neutral-300 dark:text-neutral-600">
                      所有项目可用
                    </span>
                  </div>
                  {globalTemplates.map((tpl) => (
                    <TemplateRow
                      key={tpl.id}
                      template={tpl}
                      onLoad={() => handleLoad(tpl.id)}
                      onDelete={() => handleDelete(tpl.id)}
                      onToggleScope={() => handleToggleScope(tpl)}
                    />
                  ))}
                </div>
              )}
              {/* Project templates section */}
              {projectTemplates.length > 0 && (
                <div>
                  {globalTemplates.length > 0 && (
                    <div className="my-1 h-px bg-neutral-100 dark:bg-neutral-800" />
                  )}
                  <div className="flex items-center gap-1 px-1 py-1">
                    <FolderOpen className="h-2.5 w-2.5 text-neutral-400" />
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                      本项目模板
                    </span>
                  </div>
                  {projectTemplates.map((tpl) => (
                    <TemplateRow
                      key={tpl.id}
                      template={tpl}
                      onLoad={() => handleLoad(tpl.id)}
                      onDelete={() => handleDelete(tpl.id)}
                      onToggleScope={() => handleToggleScope(tpl)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function TemplateRow({
  template,
  onLoad,
  onDelete,
  onToggleScope,
}: {
  template: FlowTemplate
  onLoad: () => void
  onDelete: () => void
  onToggleScope: () => void
}) {
  const isGlobal = template.projectId === GLOBAL_PROJECT_ID
  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
      <FileDown className="h-3 w-3 shrink-0 text-neutral-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
          {template.name}
        </div>
        <div className="text-[9px] text-neutral-400">
          {template.nodes.length} 节点 ·{' '}
          {new Date(template.updatedAt).toLocaleDateString('zh-CN')}
        </div>
      </div>
      {/* Toggle global/project scope */}
      <button
        onClick={onToggleScope}
        title={isGlobal ? '转为项目模板' : '转为全局模板'}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-300 opacity-0 transition-opacity hover:text-primary-500 group-hover:opacity-100"
      >
        {isGlobal ? (
          <Globe className="h-3 w-3 text-primary-400" />
        ) : (
          <Globe className="h-3 w-3" />
        )}
      </button>
      <button
        onClick={onLoad}
        className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium text-primary-500 opacity-0 transition-opacity hover:bg-primary-50 group-hover:opacity-100 dark:hover:bg-primary-950/30"
      >
        加载
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 text-neutral-300 opacity-0 transition-opacity hover:text-danger-500 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}
