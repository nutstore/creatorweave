/**
 * SkillEditor - Create, view, or edit a skill.
 *
 * Simplified: only name, description, and content (instruction).
 * Other fields auto-filled with defaults.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, Eye, Save, FileCode, Lock,
} from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
  BrandButton,
} from '@creatorweave/ui'
import { Input } from '@/components/ui/input'
import type { SkillMetadata } from '@/skills/skill-types'
import { useSkillsStore } from '@/store/skills.store'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

// ============================================================================

interface SkillEditorProps {
  skill?: SkillMetadata
  open: boolean
  onClose: () => void
  readOnly?: boolean
}

// ============================================================================

export function SkillEditor({ skill, open, onClose, readOnly = false }: SkillEditorProps) {
  const t = useT()
  const skillsStore = useSkillsStore()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state — only 3 fields
  const [name, setName] = useState(skill?.name || '')
  const [description, setDescription] = useState(skill?.description || '')
  const [instruction, setInstruction] = useState('')

  // Load full skill content
  useEffect(() => {
    if (skill) {
      setName(skill.name || '')
      setDescription(skill.description || '')

      skillsStore.getFullSkill(skill.id).then((fullSkill) => {
        if (fullSkill) {
          setInstruction(fullSkill.instruction || '')
        }
      })
    } else {
      setName('')
      setDescription('')
      setInstruction('')
    }
  }, [skill, skillsStore])

  // Build SKILL.md content
  const buildSkillMd = useCallback(() => {
    const lines: string[] = ['---']
    lines.push(`name: "${name}"`)
    lines.push(`version: "1.0.0"`)
    lines.push(`description: "${description}"`)
    lines.push(`author: "User"`)
    lines.push(`category: general`)
    lines.push(`tags: []`)
    lines.push('triggers:')
    lines.push('  keywords: []')
    lines.push('---')
    lines.push('')
    if (instruction) {
      lines.push(instruction)
    }
    return lines.join('\n')
  }, [name, description, instruction])

  const handleSave = async () => {
    if (!name.trim()) { setError(t('skillEditor.nameRequired')); return }
    if (!description.trim()) { setError(t('skillEditor.descriptionRequired')); return }
    setError(null)
    setIsSaving(true)
    try {
      const content = buildSkillMd()
      const result = await skillsStore.importSkillMd(content)
      if (result.success) {
        // Delete old skill after successful import to avoid orphaned slug-based IDs
        if (skill) {
          await skillsStore.deleteSkill(skill.id)
        }
        onClose()
      } else {
        setError(result.error || t('skillEditor.saveFailed'))
      }
    } finally { setIsSaving(false) }
  }

  const dialogTitle = readOnly
    ? skill?.name || t('skillCard.viewDetails')
    : skill
      ? t('skillEditor.editSkill')
      : t('skillEditor.createSkill')

  return (
    <BrandDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <BrandDialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden p-0">
        {/* Header — consistent with system BrandDialogHeader */}
        <BrandDialogHeader>
          <BrandDialogTitle className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {readOnly ? (
              <Eye className="h-4.5 w-4.5 text-blue-500" />
            ) : (
              <FileCode className="h-4.5 w-4.5 text-blue-500" />
            )}
            {dialogTitle}
            {readOnly && (
              <Lock className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
            )}
          </BrandDialogTitle>
          <BrandDialogClose className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
            <X className="h-5 w-5" />
          </BrandDialogClose>
        </BrandDialogHeader>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {readOnly ? (
            <div className="space-y-5">
              {skill?.description && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t('skillEditor.description')}
                  </label>
                  <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {skill.description}
                  </p>
                </div>
              )}
              {instruction && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t('skillEditor.instruction')}
                  </label>
                  <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <div className="bg-white p-4 dark:bg-neutral-800/50">
                      <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                        {instruction}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <FormField label={t('skillEditor.skillName')} required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('skillEditor.skillNamePlaceholder')}
                  className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
                />
              </FormField>

              <FormField label={t('skillEditor.description')} required>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('skillEditor.descriptionPlaceholder')}
                  className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
                />
              </FormField>

              <FormField label={t('skillEditor.instruction')}>
                <TextareaWithLines
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={t('skillEditor.instructionPlaceholder')}
                  rows={16}
                />
              </FormField>
            </div>
          )}
        </div>

        {/* Footer — consistent with system */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-6 py-3 dark:border-neutral-700">
          {readOnly ? (
            <BrandButton variant="outline" onClick={onClose}>
              {t('skillEditor.close')}
            </BrandButton>
          ) : (
            <>
              <BrandButton variant="outline" onClick={onClose}>
                {t('skillEditor.cancel')}
              </BrandButton>
              <BrandButton onClick={handleSave} disabled={isSaving}>
                <Save className="mr-1.5 h-4 w-4" />
                {isSaving ? t('skillEditor.saving') : t('skillEditor.save')}
              </BrandButton>
            </>
          )}
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}

// ============================================================================
// TextareaWithLines - Enhanced textarea with line numbers
// ============================================================================

function TextareaWithLines({
  value, onChange, placeholder, rows,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  className?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  const lineCount = value ? value.split('\n').length : 1
  const displayLines = Math.max(lineCount, rows || 1)

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.substring(0, start) + '  ' + value.substring(end)
      const syntheticEvent = {
        target: { value: newValue, selectionStart: start + 2, selectionEnd: start + 2 },
      } as React.ChangeEvent<HTMLTextAreaElement>
      onChange(syntheticEvent)
      requestAnimationFrame(() => {
        textarea.selectionStart = start + 2
        textarea.selectionEnd = start + 2
      })
    }
  }, [value, onChange])

  return (
    <div className="flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-600">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="flex shrink-0 select-none flex-col items-end overflow-hidden bg-neutral-50 px-2 py-3 text-right font-mono text-xs leading-[1.625rem] text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600"
        aria-hidden="true"
      >
        {Array.from({ length: displayLines }, (_, i) => (
          <span key={i} className="block h-[1.625rem] leading-[1.625rem]">
            {i + 1}
          </span>
        ))}
      </div>
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          'flex-1 resize-none bg-white px-4 py-3 font-mono text-sm leading-[1.625rem] text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200',
          'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
          'focus:outline-none'
        )}
      />
    </div>
  )
}

// ============================================================================
// FormField - Label wrapper
// ============================================================================

function FormField({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center text-sm font-medium text-neutral-600 dark:text-neutral-400">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
