/**
 * SkillCard - Display a single skill with toggle and actions.
 */

import { Eye, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SkillMetadata } from '@/skills/skill-types'
import { useT } from '@/i18n'

interface SkillCardProps {
  skill: SkillMetadata
  /** Read-only mode for project skills (source files) */
  isReadOnly?: boolean
  onToggle: (id: string, enabled: boolean) => void
  onEdit: (skill: SkillMetadata) => void
  onDelete?: (id: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'code-review': 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300',
  testing: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300',
  debugging: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
  refactoring: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300',
  documentation: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300',
  security: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-300',
  performance: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/50 dark:bg-pink-950/30 dark:text-pink-300',
  architecture: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300',
  general: 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
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

export function SkillCard({ skill, isReadOnly, onToggle, onEdit, onDelete }: SkillCardProps) {
  const t = useT()

  const handleToggle = () => {
    onToggle(skill.id, !skill.enabled)
  }

  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-all hover:shadow-sm',
        skill.enabled
          ? 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900'
          : 'border-neutral-100 bg-neutral-50/50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/60'
      )}
    >
      {/* Header: Name + Status Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                'truncate text-sm font-medium',
                skill.enabled ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'
              )}
            >
              {skill.name}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
            skill.enabled
              ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-900/40'
              : 'bg-neutral-200 text-neutral-500 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              skill.enabled ? 'bg-green-600 dark:bg-green-400' : 'bg-neutral-400 dark:bg-neutral-500'
            )}
          />
          {skill.enabled ? t('skillCard.enabled') : t('skillCard.disabled')}
        </button>
      </div>

      {/* Description */}
      <p
        className={cn(
          'mt-1.5 line-clamp-1 text-xs',
          skill.enabled ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-400 dark:text-neutral-500'
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
            className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
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
          {skill.source === 'project' && <span className="text-neutral-300 dark:text-neutral-600">|</span>}
          {skill.source === 'project' && <span>{t('skillCard.project')}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            onClick={() => onEdit(skill)}
            title={t('skillCard.viewDetails')}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {!isReadOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                onClick={() => onEdit(skill)}
                title={t('skillCard.edit')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                  onClick={() => onDelete(skill.id)}
                  title={t('skillCard.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
