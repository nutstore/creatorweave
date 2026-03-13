/**
 * ProjectSkillsDialog - Dialog shown when project skills are discovered.
 *
 * Displays scanned skills from the project directory with checkboxes
 * for user to select which ones to load.
 */

import { useState, useCallback } from 'react'
import { Check, FolderOpen, Sparkles } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogTitle,
  BrandButton,
} from '@creatorweave/ui'
import { Badge } from '@/components/ui/badge'
import type { SkillMetadata } from '@/skills/skill-types'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

interface ProjectSkillsDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Skills discovered in the project */
  skills: SkillMetadata[]
  /** Callback when user confirms selection */
  onConfirm: (selectedIds: string[]) => void
  /** Callback when user skips loading */
  onSkip: () => void
  /** Called when dialog open state changes */
  onOpenChange?: (open: boolean) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'code-review': 'border-primary-200 bg-primary-50 text-primary-600 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-300',
  testing: 'border-success-200 bg-success-50 text-success-text dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-300',
  debugging: 'border-danger-200 bg-danger-50 text-danger dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300',
  refactoring: 'border-warning-200 bg-warning-50 text-warning dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300',
  documentation: 'border-neutral-200 bg-secondary text-text-secondary dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  security: 'border-danger-200 bg-danger-50 text-danger dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300',
  performance: 'border-primary-200 bg-primary-50 text-primary-600 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-300',
  architecture: 'border-primary-200 bg-primary-50 text-primary-600 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-300',
  general: 'border-neutral-200 bg-secondary text-text-secondary dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
}

export function ProjectSkillsDialog({
  open,
  skills,
  onConfirm,
  onSkip,
  onOpenChange,
}: ProjectSkillsDialogProps) {
  const t = useT()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && skills.length > 0) {
        setSelectedIds(new Set(skills.map((s) => s.id)))
      }
      onOpenChange?.(open)
    },
    [skills, onOpenChange]
  )

  const toggleSkill = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selectedIds.size === skills.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(skills.map((s) => s.id)))
    }
  }, [selectedIds.size, skills])

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedIds))
    setSelectedIds(new Set())
  }, [selectedIds, onConfirm])

  const handleSkip = useCallback(() => {
    onSkip()
    setSelectedIds(new Set())
  }, [onSkip])

  const isAllSelected = selectedIds.size === skills.length
  const isIndeterminate = !isAllSelected && selectedIds.size > 0

  // Extract file path from skill ID
  const getSkillPath = useCallback((id: string) => {
    if (id.startsWith('project:')) {
      return id.replace('project:', '').replace(/\.md$/, '.md')
    }
    return id
  }, [])

  // Get localized category label
  const getCategoryLabel = useCallback(
    (category: string) => {
      const labels: Record<string, string> = {
        'code-review': t('skills.categories.codeReview'),
        testing: t('skills.categories.testing'),
        debugging: t('skills.categories.debugging'),
        refactoring: t('skills.categories.refactoring'),
        documentation: t('skills.categories.documentation'),
        security: t('skills.categories.security'),
        performance: t('skills.categories.performance'),
        architecture: t('skills.categories.architecture'),
        general: t('skills.categories.general'),
      }
      return labels[category] || category
    },
    [t]
  )

  if (skills.length === 0) return null

  return (
    <BrandDialog open={open} onOpenChange={handleOpenChange}>
      <BrandDialogContent className="flex max-w-md flex-col overflow-hidden p-0">
        {/* Header - subtle background */}
        <div className="border-b border-neutral-100 bg-muted/30 px-6 py-5 dark:border-neutral-700 dark:bg-muted/30">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-neutral-800">
              <Sparkles className="h-5 w-5 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <BrandDialogTitle className="px-0 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {t('skills.projectDialog.title')}
              </BrandDialogTitle>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                {t('skills.projectDialog.description', { count: skills.length })}
              </p>
            </div>
          </div>
        </div>

        {/* Select All Bar */}
        <div className="flex items-center justify-between border-b border-neutral-100 bg-white px-6 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900 focus:outline-none dark:text-neutral-300 dark:hover:text-neutral-100"
          >
            <div
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                isAllSelected
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : isIndeterminate
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'hover:border-primary-400 border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
              )}
            >
              {isAllSelected ? (
                <Check className="h-3 w-3" />
              ) : isIndeterminate ? (
                <div className="h-2 w-2 rounded-full bg-white dark:bg-neutral-200" />
              ) : null}
            </div>
            {isAllSelected
              ? t('skills.projectDialog.deselectAll')
              : t('skills.projectDialog.selectAll')}
          </button>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {t('skills.projectDialog.selected')}{' '}
            <span className="font-medium text-neutral-600 dark:text-neutral-300">{selectedIds.size}</span> / {skills.length}
          </span>
        </div>

        {/* Skill List */}
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {skills.map((skill) => (
            <SkillListItem
              key={skill.id}
              skill={skill}
              selected={selectedIds.has(skill.id)}
              onToggle={() => toggleSkill(skill.id)}
              getPath={getSkillPath}
              getCategoryLabel={(cat) => getCategoryLabel(cat)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-6 py-3 dark:border-neutral-700 dark:bg-neutral-800">
          <BrandButton variant="outline" onClick={handleSkip}>
            {t('skills.projectDialog.skip')}
          </BrandButton>
          <BrandButton
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className="min-w-[90px]"
          >
            {selectedIds.size === 0
              ? t('skills.projectDialog.load')
              : selectedIds.size === skills.length
                ? t('skills.projectDialog.loadAll')
                : `${t('skills.projectDialog.load')} ${selectedIds.size}`}
          </BrandButton>
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}

interface SkillListItemProps {
  skill: SkillMetadata
  selected: boolean
  onToggle: () => void
  getPath: (id: string) => string
  getCategoryLabel: (category: string) => string
}

function SkillListItem({
  skill,
  selected,
  onToggle,
  getPath,
  getCategoryLabel,
}: SkillListItemProps) {
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all',
        selected
          ? 'border-primary-300 bg-primary-50/50'
          : 'hover:border-primary-200 border-neutral-200 bg-white hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
      )}
    >
      {/* Custom Checkbox */}
      <div className="flex-shrink-0 pt-0.5">
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-lg border-2 transition-all',
            selected
              ? 'border-primary-600 bg-primary-600'
              : 'group-hover:border-primary-400 border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900'
          )}
        >
          {selected && <Check className="h-3.5 w-3.5 text-white" />}
        </div>
        <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className={cn('text-sm font-semibold', selected ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-800 dark:text-neutral-200')}>
            {skill.name}
          </h4>
          <Badge
            variant="outline"
            className={cn(
              'px-2 py-0.5 text-xs font-medium',
              CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general
            )}
          >
            {getCategoryLabel(skill.category)}
          </Badge>
        </div>
          <p
            className={cn(
              'mt-1.5 line-clamp-2 text-xs leading-relaxed',
              selected ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-500 dark:text-neutral-400'
            )}
          >
            {skill.description}
          </p>
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="font-mono">{getPath(skill.id)}</span>
        </div>
      </div>
    </label>
  )
}
