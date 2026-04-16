/**
 * CustomWorkflowManager - Page for managing custom workflows.
 * Provides CRUD operations, navigation, and basic management features.
 */

import { useCallback, useMemo, useState } from 'react'
import {
  Copy,
  Edit,
  Trash2,
  Plus,
  FolderOpen,
  Search,
  FileText,
} from 'lucide-react'
import {
  BrandButton,
  BrandInput,
  BrandDialog,
  BrandDialogContent,
  BrandDialogClose,
} from '@creatorweave/ui'

import {
  useCustomWorkflowStore,
  createEmptyWorkflow,
} from '@/store/custom-workflow.store'
import type { CustomWorkflowTemplate } from '@/agent/workflow/types'
import { useT } from '@/i18n'

interface CustomWorkflowManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditWorkflow?: (workflow: CustomWorkflowTemplate) => void
}

export function CustomWorkflowManager({
  open,
  onOpenChange,
  onEditWorkflow,
}: CustomWorkflowManagerProps) {
  const t = useT()
  const {
    workflows,
    loadWorkflows,
    deleteWorkflow,
    duplicateWorkflow,
  } = useCustomWorkflowStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Load workflows when dialog opens
  useMemo(() => {
    if (open) {
      loadWorkflows()
    }
  }, [open, loadWorkflows])

  // Filter workflows by search query
  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) return workflows
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [workflows, searchQuery])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmId) return

    await deleteWorkflow(deleteConfirmId)
    setDeleteConfirmId(null)
  }, [deleteConfirmId, deleteWorkflow])

  const handleDuplicate = useCallback(
    async (id: string) => {
      await duplicateWorkflow(id)
    },
    [duplicateWorkflow]
  )

  const handleCreateNew = useCallback(() => {
    const newWorkflow = createEmptyWorkflow()
    onEditWorkflow?.(newWorkflow)
  }, [onEditWorkflow])

  const handleEdit = useCallback(
    (workflow: CustomWorkflowTemplate) => {
      onEditWorkflow?.(workflow)
      onOpenChange(false)
    },
    [onEditWorkflow, onOpenChange]
  )

  // Get domain label
  const domainLabels: Record<string, string> = {
    generic: t('customWorkflowManager.generic'),
    novel: t('customWorkflowManager.novel'),
    video: t('customWorkflowManager.video'),
    course: t('customWorkflowManager.course'),
    custom: t('customWorkflowManager.custom'),
  }

  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <BrandDialogContent className="flex h-[85vh] w-[90vw] max-w-[1200px] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-xl dark:bg-neutral-950">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <FolderOpen className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {t('customWorkflowManager.title')}
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {t('customWorkflowManager.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <BrandButton onClick={handleCreateNew} className="h-9 gap-2 px-4 text-sm font-medium">
              <Plus className="h-4 w-4" />
              {t('customWorkflowManager.createNew')}
            </BrandButton>
          </div>
        </header>

        {/* Search and content */}
        <div className="flex-1 overflow-hidden">
          {/* Search bar */}
          <div className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <BrandInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('customWorkflowManager.searchPlaceholder')}
                className="h-9 w-full pl-9 text-sm"
              />
            </div>
          </div>

          {/* Workflow list */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredWorkflows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <FolderOpen className="h-8 w-8 text-neutral-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {searchQuery ? t('customWorkflowManager.noResultsWithSearch') : t('customWorkflowManager.noResultsWithoutSearch')}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    {searchQuery
                      ? t('customWorkflowManager.tryDifferentKeyword')
                      : t('customWorkflowManager.clickToCreateFirst')}
                  </p>
                </div>
                {!searchQuery && (
                  <BrandButton onClick={handleCreateNew} className="h-8 gap-2 px-4 text-sm font-medium">
                    <Plus className="h-4 w-4" />
                    {t('customWorkflowManager.createNew')}
                  </BrandButton>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWorkflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="group relative rounded-lg border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                  >
                    {/* Workflow header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          <FileText className="h-5 w-5 text-neutral-500" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {workflow.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {domainLabels[workflow.domain] || t('customWorkflowManager.generic')}
                            </span>
                            <span className="text-xs text-neutral-300 dark:text-neutral-600">
                              •
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {t('customWorkflowManager.nodesCount', { count: workflow.nodes.length })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(workflow)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(workflow.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(workflow.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Workflow description */}
                    {workflow.description && (
                      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                        {workflow.description}
                      </p>
                    )}

                    {/* Footer */}
                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500">
                      <div className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${workflow.enabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
                        {workflow.enabled ? t('customWorkflowManager.enabled') : t('customWorkflowManager.disabled')}
                      </div>
                      <span>{t('customWorkflowManager.updatedAt', { date: new Date(workflow.updatedAt).toLocaleDateString() })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation dialog */}
        {deleteConfirmId && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm dark:bg-black/40">
            <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-800">
              <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {t('customWorkflowManager.confirmDelete')}
              </h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {t('customWorkflowManager.deleteConfirmMessage', { name: workflows.find((w) => w.id === deleteConfirmId)?.name ?? '' })}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <BrandButton
                  variant="secondary"
                  onClick={() => setDeleteConfirmId(null)}
                  className="h-8 px-3 text-sm"
                >
                  {t('customWorkflowManager.cancel')}
                </BrandButton>
                <BrandButton
                  onClick={confirmDelete}
                  className="h-8 bg-red-600 px-3 text-sm hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                >
                  {t('customWorkflowManager.delete')}
                </BrandButton>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-neutral-200 bg-neutral-50 px-6 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('customWorkflowManager.totalWorkflows', { count: workflows.length })}
          </span>
          <BrandDialogClose asChild>
            <BrandButton variant="ghost" className="h-8 px-3 text-sm">
              {t('customWorkflowManager.close')}
            </BrandButton>
          </BrandDialogClose>
        </footer>
      </BrandDialogContent>
    </BrandDialog>
  )
}
