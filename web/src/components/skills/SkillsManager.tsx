/**
 * SkillsManager - Main skills management dialog.
 *
 * Displays skills in simple sections grouped by source (project/user/builtin)
 * with search, filter, and inline action buttons.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, RefreshCw, FolderOpen, User, Building, X, Inbox, Upload, ChevronDown, ChevronRight } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
  BrandDialogFooter,
  BrandDialogClose,
  BrandButton,
  BrandInput,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@creatorweave/ui'
import { SkillCard } from './SkillCard'
import { SkillEditor } from './SkillEditor'
import { ProjectSkillDropZone } from './ProjectSkillDropZone'
import { useSkillsStore } from '@/store/skills.store'
import type { SkillMetadata } from '@/skills/skill-types'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { getSkillManager } from '@/skills/skill-manager'
import { useProjectStore } from '@/store/project.store'

interface SkillsManagerProps {
  open: boolean
  onClose: () => void
  directoryHandle?: FileSystemDirectoryHandle | null
  roots?: Array<{ name: string; handle: FileSystemDirectoryHandle }>
}

type FilterType = 'all' | 'enabled' | 'disabled'
type EditorMode = 'view' | 'edit' | undefined

export function SkillsManager({ open, onClose, directoryHandle = null, roots = [] }: SkillsManagerProps) {
  const skillsStore = useSkillsStore()
  // Subscribe to loadSkills directly — Zustand action references are stable
  // (they don't change on state updates), so this won't cause infinite loops.
  const loadSkills = useSkillsStore((s) => s.loadSkills)
  const activeProjectId = useProjectStore((s) => s.activeProjectId || null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [refreshing, setRefreshing] = useState(false)
  const t = useT()

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(value), 300)
  }, [])

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillMetadata | undefined>()
  const [editorMode, setEditorMode] = useState<EditorMode>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  // Collapsed state for each section
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Reload skills every time the dialog opens, not just the first time.
  // Agent (or external code) may have written/deleted skill files in OPFS
  // since the last open — we need to re-scan to reflect those changes.
  // loadSkills() has its own `loading` guard to prevent concurrent runs.
  useEffect(() => {
    if (open) loadSkills()
  }, [open, loadSkills])

  const { projectSkills, userSkills, builtinSkills, totalFiltered } = useMemo(() => {
    let filtered = skillsStore.skills
    if (debouncedQuery) {
      const query = debouncedQuery.toLowerCase()
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query) || s.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    }
    if (filterType === 'enabled') filtered = filtered.filter((s) => s.enabled)
    else if (filterType === 'disabled') filtered = filtered.filter((s) => !s.enabled)
    return {
      projectSkills: filtered.filter((s) => s.source === 'project'),
      userSkills: filtered.filter((s) => s.source === 'user'),
      builtinSkills: filtered.filter((s) => s.source === 'builtin'),
      totalFiltered: filtered.length,
    }
  }, [skillsStore.skills, debouncedQuery, filterType])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (directoryHandle) {
        const manager = getSkillManager()
        await manager.scanProject(directoryHandle, activeProjectId)
      }
      await skillsStore.loadSkills()
    } finally { setRefreshing(false) }
  }, [directoryHandle, skillsStore, activeProjectId])

  const handleToggle = useCallback(async (id: string, enabled: boolean) => { await skillsStore.toggleSkill(id, enabled) }, [skillsStore])
  const handleDeleteConfirm = useCallback(async () => {
    if (deleteTarget) { await skillsStore.deleteSkill(deleteTarget.id); setDeleteTarget(null) }
  }, [skillsStore, deleteTarget])
  const handleView = useCallback((skill: SkillMetadata) => { setEditingSkill(skill); setEditorMode('view'); setEditorOpen(true) }, [])
  const handleEdit = useCallback((skill: SkillMetadata) => { setEditingSkill(skill); setEditorMode('edit'); setEditorOpen(true) }, [])
  const handleCreateNew = useCallback(() => { setEditingSkill(undefined); setEditorMode('edit'); setEditorOpen(true) }, [])
  const handleUploadDone = useCallback(() => {
    setUploadOpen(false); skillsStore.bumpSkillsScanVersion(); void skillsStore.loadSkills()
  }, [skillsStore])
  const handleEditorClose = useCallback(() => { setEditorOpen(false); setEditingSkill(undefined); setEditorMode(undefined) }, [])

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const enabledCount = skillsStore.skills.filter((s) => s.enabled).length
  const totalCount = skillsStore.skills.length

  const sections: Array<{
    key: string
    icon: React.ReactNode
    label: string
    skills: SkillMetadata[]
    isReadOnly?: boolean
    onDelete?: (id: string) => void
    action?: { label: string; icon: React.ReactNode; onClick: () => void; primary?: boolean }
  }> = [
    {
      key: 'project',
      icon: <FolderOpen className="h-4 w-4 text-amber-500 dark:text-amber-400" />,
      label: t('skills.projectSkills'),
      skills: projectSkills,
      isReadOnly: true,
      action: roots.length > 0
        ? { label: t('skills.importSkill'), icon: <Upload className="h-4 w-4" />, onClick: () => setUploadOpen(true) }
        : undefined,
    },
    {
      key: 'user',
      icon: <User className="h-4 w-4 text-blue-500 dark:text-blue-400" />,
      label: t('skills.mySkills'),
      skills: userSkills,
      onDelete: (id) => {
        const skill = skillsStore.skills.find((s) => s.id === id)
        if (skill) setDeleteTarget({ id, name: skill.name })
      },
      action: { label: t('skills.createNew'), icon: <Plus className="h-4 w-4" />, onClick: handleCreateNew },
    },
    {
      key: 'builtin',
      icon: <Building className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />,
      label: t('skills.builtinSkills'),
      skills: builtinSkills,
      isReadOnly: true,
    },
  ]

  return (
    <>
      <BrandDialog open={open} onOpenChange={onClose}>
        <BrandDialogContent className="flex max-h-[min(700px,85vh)] max-w-2xl flex-col overflow-hidden p-0">
          {/* Header */}
          <BrandDialogHeader>
            <BrandDialogTitle className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t('skills.title')}
            </BrandDialogTitle>
            <BrandDialogClose className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
              <X className="h-5 w-5" />
            </BrandDialogClose>
          </BrandDialogHeader>

          {/* Search & Filter */}
          <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-6 py-3 dark:border-neutral-700">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <BrandInput
                placeholder={t('skills.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="!h-9 !py-2 pl-9"
              />
            </div>
            <Tabs value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <TabsList variant="segment" className="h-9">
                <TabsTrigger variant="segment" value="all" className="text-sm">
                  {t('skills.filterAll')} ({totalCount})
                </TabsTrigger>
                <TabsTrigger variant="segment" value="enabled" className="text-sm">
                  {t('skills.filterEnabled')}
                </TabsTrigger>
                <TabsTrigger variant="segment" value="disabled" className="text-sm">
                  {t('skills.filterDisabled')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <BrandButton iconButton onClick={handleRefresh} disabled={refreshing} title={t('common.refresh')}>
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </BrandButton>
          </div>

          {/* Skills List */}
          <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
            {totalFiltered === 0 && (debouncedQuery || filterType !== 'all') ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-neutral-400 dark:text-neutral-500">
                <Inbox className="h-8 w-8 opacity-40" />
                <p className="text-sm">{t('skills.noResults') || 'No skills match your search'}</p>
                {debouncedQuery && (
                  <p className="text-xs text-neutral-300 dark:text-neutral-600">&quot;{debouncedQuery}&quot;</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {sections.map((section) => (
                  <SkillSection
                    key={section.key}
                    icon={section.icon}
                    label={section.label}
                    skills={section.skills}
                    isCollapsed={collapsed[section.key] ?? false}
                    onToggleCollapse={() => toggleCollapse(section.key)}
                    isReadOnly={section.isReadOnly}
                    onToggle={handleToggle}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={section.onDelete}
                    action={section.action}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex h-14 shrink-0 items-center justify-between border-t border-neutral-200 px-6 dark:border-neutral-700">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{enabledCount}</span>
              {' / '}
              {totalCount} {t('skills.enabled').toLowerCase()}
            </span>
            <BrandButton variant="outline" onClick={onClose}>
              {t('common.close')}
            </BrandButton>
          </div>
        </BrandDialogContent>
      </BrandDialog>

      {/* Skill Editor */}
      <SkillEditor skill={editingSkill} open={editorOpen} onClose={handleEditorClose} readOnly={editorMode === 'view'} />

      {/* Delete Confirmation */}
      <BrandDialog open={deleteTarget !== null} onOpenChange={(isOpen) => { if (!isOpen) setDeleteTarget(null) }}>
        <BrandDialogContent className="max-w-sm">
          <BrandDialogHeader>
            <BrandDialogTitle>
              {t('skills.deleteTitle') || 'Delete Skill'}
            </BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm text-secondary">
              {(t('skills.deleteConfirmMessage') || 'Are you sure you want to delete "{name}"? This action cannot be undone.').replace('{name}', deleteTarget?.name || '')}
            </p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel') || 'Cancel'}
            </BrandButton>
            <BrandButton variant="danger" onClick={handleDeleteConfirm}>
              {t('skills.deleteConfirm') || 'Delete'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Upload Dialog */}
      <BrandDialog open={uploadOpen} onOpenChange={(isOpen) => { if (!isOpen) setUploadOpen(false) }}>
        <BrandDialogContent className="max-w-lg p-0">
          <BrandDialogHeader>
            <BrandDialogTitle className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t('skills.importSkill') || 'Import Project Skill'}
            </BrandDialogTitle>
            <BrandDialogClose className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
              <X className="h-5 w-5" />
            </BrandDialogClose>
          </BrandDialogHeader>
          <ProjectSkillDropZone roots={roots} onUploaded={handleUploadDone} onClose={handleUploadDone} />
        </BrandDialogContent>
      </BrandDialog>
    </>
  )
}

// ============================================================================
// SkillSection — plain section with header + card list
// ============================================================================

interface SkillSectionAction {
  label: string
  icon: React.ReactNode
  onClick: () => void
}

interface SkillSectionProps {
  icon: React.ReactNode
  label: string
  skills: SkillMetadata[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  isReadOnly?: boolean
  onToggle: (id: string, enabled: boolean) => void
  onView: (skill: SkillMetadata) => void
  onEdit: (skill: SkillMetadata) => void
  onDelete?: (id: string) => void
  action?: SkillSectionAction
  t: (key: string) => string
}

function SkillSection({
  icon, label, skills, isCollapsed, onToggleCollapse,
  isReadOnly, onToggle, onView, onEdit, onDelete, action, t,
}: SkillSectionProps) {
  return (
    <div>
      {/* Section header — a proper row, no accordion hacks */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {icon}
          {label}
          <span className="text-xs tabular-nums text-neutral-400 dark:text-neutral-500">({skills.length})</span>
        </button>

        {/* Action button */}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors dark:text-neutral-400 dark:hover:text-neutral-300 dark:hover:bg-neutral-800'
            )}
          >
            {action.icon}
            {action.label}
          </button>
        )}
      </div>

      {/* Card list */}
      {!isCollapsed && (
        <div className="mt-2.5 space-y-2 pl-6">
          {skills.length === 0 ? (
            <div className="flex items-center gap-2 py-3 text-neutral-400 dark:text-neutral-500">
              <Inbox className="h-4 w-4 opacity-40" />
              <p className="text-xs">{t('skills.empty')}</p>
            </div>
          ) : (
            skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isReadOnly={isReadOnly}
                onToggle={onToggle}
                onView={onView}
                onEdit={isReadOnly ? onView : onEdit}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
