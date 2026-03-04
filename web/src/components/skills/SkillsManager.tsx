/**
 * SkillsManager - Main skills management dialog.
 *
 * Displays all skills grouped by source (project/user/builtin)
 * with search, filter, and management actions.
 * Phase 4: Added i18n support
 * Phase 5: Refactored to use brand components
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Search, RefreshCw, FolderOpen, User, Building, X, Inbox } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
  BrandButton,
  BrandInput,
  BrandAccordion,
  BrandAccordionItem,
  BrandAccordionTrigger,
  BrandAccordionContent,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@browser-fs-analyzer/ui'
import { SkillCard } from './SkillCard'
import { SkillEditor } from './SkillEditor'
import { useSkillsStore } from '@/store/skills.store'
import type { SkillMetadata } from '@/skills/skill-types'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

interface SkillsManagerProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog is closed */
  onClose: () => void
}

type FilterType = 'all' | 'enabled' | 'disabled'

export function SkillsManager({ open, onClose }: SkillsManagerProps) {
  const skillsStore = useSkillsStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [refreshing, setRefreshing] = useState(false)
  const t = useT()

  // Skill editor state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillMetadata | undefined>()

  // Load skills when dialog opens
  useEffect(() => {
    if (open && !skillsStore.loaded) {
      skillsStore.loadSkills()
    }
  }, [open, skillsStore])

  // Group and filter skills
  const { projectSkills, userSkills, builtinSkills } = useMemo(() => {
    let filtered = skillsStore.skills

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    }

    // Apply enabled filter
    if (filterType === 'enabled') {
      filtered = filtered.filter((s) => s.enabled)
    } else if (filterType === 'disabled') {
      filtered = filtered.filter((s) => !s.enabled)
    }

    // Group by source
    return {
      projectSkills: filtered.filter((s) => s.source === 'project'),
      userSkills: filtered.filter((s) => s.source === 'user'),
      builtinSkills: filtered.filter((s) => s.source === 'builtin'),
    }
  }, [skillsStore.skills, searchQuery, filterType])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await skillsStore.loadSkills()
    setRefreshing(false)
  }, [skillsStore])

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      await skillsStore.toggleSkill(id, enabled)
    },
    [skillsStore]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm(t('skills.deleteConfirm'))) {
        await skillsStore.deleteSkill(id)
      }
    },
    [skillsStore, t]
  )

  const handleEdit = useCallback((skill: SkillMetadata) => {
    setEditingSkill(skill)
    setEditorOpen(true)
  }, [])

  const handleCreateNew = useCallback(() => {
    setEditingSkill(undefined)
    setEditorOpen(true)
  }, [])

  const handleEditorClose = useCallback(() => {
    setEditorOpen(false)
    setEditingSkill(undefined)
  }, [])

  return (
    <>
      <BrandDialog open={open} onOpenChange={onClose}>
        <BrandDialogContent className="flex max-h-[600px] max-w-2xl flex-col overflow-hidden p-0">
          {/* Header */}
          <BrandDialogHeader className="h-16 px-6">
            <BrandDialogTitle className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
              {t('skills.title')}
            </BrandDialogTitle>
            <BrandDialogClose className="text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300">
              <X className="h-5 w-5" />
            </BrandDialogClose>
          </BrandDialogHeader>

          {/* Search & Filter Bar */}
          <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-6 py-4 dark:border-neutral-700">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <BrandInput
                placeholder={t('skills.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="!h-9 !py-2 pl-9"
              />
            </div>
            <Tabs value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <TabsList variant="segment" className="h-9">
                <TabsTrigger variant="segment" value="all" className="text-sm">
                  {t('skills.filterAll')} ({skillsStore.skills.length})
                </TabsTrigger>
                <TabsTrigger variant="segment" value="enabled" className="text-sm">
                  {t('skills.filterEnabled')}
                </TabsTrigger>
                <TabsTrigger variant="segment" value="disabled" className="text-sm">
                  {t('skills.filterDisabled')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <BrandButton
              iconButton
              onClick={handleRefresh}
              disabled={refreshing}
              title={t('common.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </BrandButton>
          </div>

          {/* Skills List - scrollable */}
          <div className="custom-scrollbar min-h-[400px] flex-1 overflow-y-auto px-6 py-4">
            <BrandAccordion type="multiple" defaultValue={['user', 'builtin', 'project']}>
              {/* Project Skills */}
              <BrandAccordionItem value="project">
                <BrandAccordionTrigger className="rounded-t-lg px-4 py-3 hover:no-underline data-[state=open]:bg-gray-50 dark:data-[state=open]:bg-neutral-800">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                      {t('skills.projectSkills')}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-neutral-500">({projectSkills.length})</span>
                  </div>
                </BrandAccordionTrigger>
                <BrandAccordionContent className="pb-0 pt-0">
                  <div className="space-y-2 rounded-b-lg bg-gray-50/50 p-4 dark:bg-neutral-900/50">
                    {projectSkills.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-gray-400 dark:text-neutral-500">
                        <Inbox className="h-4 w-4 opacity-50" />
                        <p className="text-xs">{t('skills.empty')}</p>
                      </div>
                    ) : (
                      projectSkills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isReadOnly
                          onToggle={handleToggle}
                          onEdit={handleEdit}
                        />
                      ))
                    )}
                  </div>
                </BrandAccordionContent>
              </BrandAccordionItem>

              {/* User Skills */}
              <BrandAccordionItem value="user">
                <BrandAccordionTrigger className="rounded-t-lg px-4 py-3 hover:no-underline data-[state=open]:bg-gray-50 dark:data-[state=open]:bg-neutral-800">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                      {t('skills.mySkills')}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-neutral-500">({userSkills.length})</span>
                  </div>
                </BrandAccordionTrigger>
                <BrandAccordionContent className="pb-0 pt-0">
                  <div className="space-y-2 rounded-b-lg bg-gray-50/50 p-4 dark:bg-neutral-900/50">
                    {userSkills.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-gray-400 dark:text-neutral-500">
                        <Inbox className="h-4 w-4 opacity-50" />
                        <p className="text-xs">{t('skills.empty')}</p>
                      </div>
                    ) : (
                      userSkills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          onToggle={handleToggle}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))
                    )}
                  </div>
                </BrandAccordionContent>
              </BrandAccordionItem>

              {/* Builtin Skills */}
              <BrandAccordionItem value="builtin">
                <BrandAccordionTrigger className="rounded-t-lg px-4 py-3 hover:no-underline data-[state=open]:bg-gray-50 dark:data-[state=open]:bg-neutral-800">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                      {t('skills.builtinSkills')}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-neutral-500">({builtinSkills.length})</span>
                  </div>
                </BrandAccordionTrigger>
                <BrandAccordionContent className="pb-0 pt-0">
                  <div className="space-y-2 rounded-b-lg bg-gray-50/50 p-4 dark:bg-neutral-900/50">
                    {builtinSkills.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-gray-400 dark:text-neutral-500">
                        <Inbox className="h-4 w-4 opacity-50" />
                        <p className="text-xs">{t('skills.empty')}</p>
                      </div>
                    ) : (
                      builtinSkills.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isReadOnly
                          onToggle={handleToggle}
                          onEdit={handleEdit}
                        />
                      ))
                    )}
                  </div>
                </BrandAccordionContent>
              </BrandAccordionItem>
            </BrandAccordion>
          </div>

          {/* Footer */}
          <div className="flex h-16 shrink-0 items-center justify-between border-t border-gray-200 px-6 dark:border-neutral-700">
            <span className="text-sm text-gray-500 dark:text-neutral-400">
              <span className="font-medium text-gray-700 dark:text-neutral-200">
                {skillsStore.skills.filter((s) => s.enabled).length}
              </span>
              {' / '}
              {skillsStore.skills.length} {t('skills.enabled').toLowerCase()}
            </span>
            <div className="flex items-center gap-2">
              <BrandButton variant="outline" onClick={onClose}>
                {t('common.close')}
              </BrandButton>
              <BrandButton onClick={handleCreateNew}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('skills.createNew')}
              </BrandButton>
            </div>
          </div>
        </BrandDialogContent>
      </BrandDialog>

      {/* Skill Editor Dialog */}
      <SkillEditor skill={editingSkill} open={editorOpen} onClose={handleEditorClose} />
    </>
  )
}
