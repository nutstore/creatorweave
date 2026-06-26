/**
 * SkillCard - Display a single skill with toggle switch and actions.
 * Optimized: Switch toggle, dark mode contrast, separated view/edit actions.
 */

import { Eye, Pencil, Trash2 } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SkillMetadata } from '@/skills/skill-types'
import { useT } from '@/i18n'

interface SkillCardProps {
  skill: SkillMetadata
  /** Read-only mode for project/builtin skills (cannot edit/delete) */
  isReadOnly?: boolean
  onToggle: (id: string, enabled: boolean) => void
  onView: (skill: SkillMetadata) => void
  onEdit: (skill: SkillMetadata) => void
  onDelete?: (id: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'code-review': 'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  testing: 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300',
  debugging: 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300',
  refactoring: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  documentation: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  security: 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  performance: 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  architecture: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  general: 'border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
}

const CATEGORY_KEYS: Record<string, string> = {
  'code-review': 'skillCard.category.codeReview',
  testing: 'skillCard.category.testing',
  debugging: 'skillCard.category.debugging',
  refactoring: 'skillCard.category.refactoring',
  documentation: 'skillCard.category.documentation',
  security: 'skillCard.category.security',
  performance: 'skillCard.category.performance',
  architecture: 'skillCard.category.architecture',
  general: 'skillCard.category.general',
}

export function SkillCard({ skill, isReadOnly, onToggle, onView, onEdit, onDelete }: SkillCardProps) {
  const t = useT()

  return (
    <div
      className={cn(
        'group rounded-lg border p-3 transition-all hover:shadow-sm',
        skill.enabled
          ? 'border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-800/90'
          : 'border-neutral-150 bg-neutral-50/60 opacity-55 dark:border-neutral-750 dark:bg-neutral-850/60'
      )}
    >
      {/* Header: Name + Switch Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                'truncate text-sm font-medium',
                skill.enabled
                  ? 'text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 dark:text-neutral-400'
              )}
            >
              {skill.name}
            </h3>
          </div>
        </div>
        <Switch
          checked={skill.enabled}
          onCheckedChange={(checked) => onToggle(skill.id, checked)}
          className="shrink-0"
        />
      </div>

      {/* Description */}
      <p
        className={cn(
          'mt-1.5 line-clamp-2 text-xs leading-relaxed',
          skill.enabled
            ? 'text-neutral-600 dark:text-neutral-300'
            : 'text-neutral-400 dark:text-neutral-500'
        )}
      >
        {skill.description}
      </p>

      {/* Badges: Category + Tags */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className={cn(
            'px-1.5 py-0 text-xs font-normal',
            CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general
          )}
        >
          {t(CATEGORY_KEYS[skill.category] || CATEGORY_KEYS.general)}
        </Badge>
        {skill.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
          >
            {tag}
          </span>
        ))}
        {skill.tags.length > 3 && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">+{skill.tags.length - 3}</span>
        )}
      </div>

      {/* Footer: Metadata + Actions */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
          {skill.author !== 'Unknown' && <span>{skill.author}</span>}
          {skill.source === 'project' && (
            <>
              <span className="text-neutral-200 dark:text-neutral-700">|</span>
              <span>{t('skillCard.project')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {/* View - read-only preview */}
          <BrandButton
            iconButton
            className="h-7 w-7 text-neutral-400 hover:text-blue-600 dark:text-neutral-500 dark:hover:text-blue-400"
            onClick={() => onView(skill)}
            title={t('skillCard.viewDetails')}
          >
            <Eye className="h-3.5 w-3.5" />
          </BrandButton>
          {/* Edit - only for non-readOnly skills */}
          {!isReadOnly && (
            <BrandButton
              iconButton
              className="h-7 w-7 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
              onClick={() => onEdit(skill)}
              title={t('skillCard.edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </BrandButton>
          )}
          {/* Delete - shown when onDelete is provided (even for read-only skills like project skills) */}
          {onDelete && (
            <BrandButton
              iconButton
              className="h-7 w-7 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
              onClick={() => onDelete(skill.id)}
              title={t('skillCard.delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </BrandButton>
          )}
        </div>
      </div>
    </div>
  )
}
