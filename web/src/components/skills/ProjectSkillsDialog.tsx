/**
 * ProjectSkillsDialog - Dialog shown when project skills are discovered.
 *
 * Displays scanned skills from the project directory with checkboxes
 * for user to select which ones to load.
 */

import { useState, useCallback } from 'react'
import { Check, FolderOpen, Sparkles } from 'lucide-react'
import { DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SkillMetadata } from '@/skills/skill-types'
import { cn } from '@/lib/utils'

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

export function ProjectSkillsDialog({
  open,
  skills,
  onConfirm,
  onSkip,
  onOpenChange,
}: ProjectSkillsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const isOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen && skills.length > 0) {
        setSelectedIds(new Set(skills.map((s) => s.id)))
      }
      onOpenChange?.(isOpen)
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

  if (skills.length === 0) return null

  return (
    <DialogContent
      open={open}
      onOpenChange={isOpen}
      className="flex max-w-md flex-col overflow-hidden p-0"
    >
      {/* Header */}
      <div className="border-b border-neutral-100 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="px-0 text-base font-semibold text-neutral-900">
              发现项目技能
            </DialogTitle>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              在项目中发现了 <span className="font-semibold text-amber-600">{skills.length}</span>{' '}
              个技能，是否加载到工作区？
            </p>
          </div>
        </div>
      </div>

      {/* Select All Bar */}
      <div className="flex items-center justify-between border-b border-neutral-100 bg-white px-6 py-2.5">
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <div
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border transition-colors',
              isAllSelected
                ? 'border-primary-600 bg-primary-600 text-white'
                : isIndeterminate
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-neutral-300 bg-white hover:border-primary-400'
            )}
          >
            {isAllSelected ? (
              <Check className="h-3 w-3" />
            ) : isIndeterminate ? (
              <div className="h-2 w-2 rounded-full bg-white" />
            ) : null}
          </div>
          {isAllSelected ? '取消全选' : '全选'}
        </button>
        <span className="text-xs text-neutral-400">
          已选 <span className="font-medium text-neutral-600">{selectedIds.size}</span> /{' '}
          {skills.length}
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
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-6 py-3">
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
        >
          跳过
        </Button>
        <Button onClick={handleConfirm} disabled={selectedIds.size === 0} className="min-w-[90px]">
          {selectedIds.size === skills.length ? '加载全部' : `加载 ${selectedIds.size}`}
        </Button>
      </div>
    </DialogContent>
  )
}

interface SkillListItemProps {
  skill: SkillMetadata
  selected: boolean
  onToggle: () => void
  getPath: (id: string) => string
}

function SkillListItem({ skill, selected, onToggle, getPath }: SkillListItemProps) {
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all',
        selected
          ? 'border-amber-300 bg-amber-50/50'
          : 'border-neutral-200 bg-white hover:border-amber-200 hover:shadow-md'
      )}
    >
      {/* Custom Checkbox */}
      <div className="flex-shrink-0 pt-0.5">
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-lg border-2 transition-all',
            selected
              ? 'border-amber-500 bg-amber-500'
              : 'border-neutral-300 bg-white group-hover:border-amber-400'
          )}
        >
          {selected && <Check className="h-3.5 w-3.5 text-white" />}
        </div>
        <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4
            className={cn(
              'text-sm font-semibold',
              selected ? 'text-neutral-900' : 'text-neutral-800'
            )}
          >
            {skill.name}
          </h4>
          <Badge
            variant="outline"
            className={cn(
              'px-2 py-0.5 text-xs font-medium',
              CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general
            )}
          >
            {CATEGORY_LABELS[skill.category] || skill.category}
          </Badge>
        </div>
        <p
          className={cn(
            'mt-1.5 line-clamp-2 text-xs leading-relaxed',
            selected ? 'text-neutral-600' : 'text-neutral-500'
          )}
        >
          {skill.description}
        </p>
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-400">
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="font-mono">{getPath(skill.id)}</span>
        </div>
      </div>
    </label>
  )
}
