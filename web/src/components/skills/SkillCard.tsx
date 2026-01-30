/**
 * SkillCard - Display a single skill with toggle and actions.
 */

import { Eye, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SkillMetadata } from '@/skills/skill-types'

interface SkillCardProps {
  skill: SkillMetadata
  /** Read-only mode for project skills (source files) */
  isReadOnly?: boolean
  onToggle: (id: string, enabled: boolean) => void
  onEdit: (skill: SkillMetadata) => void
  onDelete?: (id: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  'code-review': 'bg-purple-50 text-purple-700 border-purple-200',
  testing: 'bg-green-50 text-green-700 border-green-200',
  debugging: 'bg-red-50 text-red-700 border-red-200',
  refactoring: 'bg-orange-50 text-orange-700 border-orange-200',
  documentation: 'bg-blue-50 text-blue-700 border-blue-200',
  security: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  performance: 'bg-pink-50 text-pink-700 border-pink-200',
  architecture: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  general: 'bg-gray-50 text-gray-700 border-gray-200',
}

const CATEGORY_LABELS: Record<string, string> = {
  'code-review': '代码审查',
  testing: '测试',
  debugging: '调试',
  refactoring: '重构',
  documentation: '文档',
  security: '安全',
  performance: '性能',
  architecture: '架构',
  general: '通用',
}

export function SkillCard({ skill, isReadOnly, onToggle, onEdit, onDelete }: SkillCardProps) {
  const handleToggle = () => {
    onToggle(skill.id, !skill.enabled)
  }

  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-all hover:shadow-sm',
        skill.enabled
          ? 'border-neutral-200 bg-white'
          : 'border-neutral-100 bg-neutral-50/50 opacity-60'
      )}
    >
      {/* Header: Name + Status Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                'truncate text-sm font-medium',
                skill.enabled ? 'text-neutral-900' : 'text-neutral-500'
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
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-neutral-200 text-neutral-500 hover:bg-neutral-300'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              skill.enabled ? 'bg-green-600' : 'bg-neutral-400'
            )}
          />
          {skill.enabled ? '已启用' : '已禁用'}
        </button>
      </div>

      {/* Description */}
      <p
        className={cn(
          'mt-1.5 line-clamp-1 text-xs',
          skill.enabled ? 'text-neutral-500' : 'text-neutral-400'
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
          {CATEGORY_LABELS[skill.category] || skill.category}
        </Badge>
        {skill.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600"
          >
            {tag}
          </span>
        ))}
        {skill.tags.length > 3 && (
          <span className="text-xs text-neutral-400">+{skill.tags.length - 3}</span>
        )}
      </div>

      {/* Footer: Metadata + Actions */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          {skill.author !== 'Unknown' && <span>{skill.author}</span>}
          {skill.source === 'project' && <span className="text-neutral-300">|</span>}
          {skill.source === 'project' && <span>项目</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-neutral-400 hover:text-neutral-600"
            onClick={() => onEdit(skill)}
            title="查看详情"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {!isReadOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-neutral-400 hover:text-neutral-600"
                onClick={() => onEdit(skill)}
                title="编辑"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-neutral-400 hover:text-red-500"
                  onClick={() => onDelete(skill.id)}
                  title="删除"
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
