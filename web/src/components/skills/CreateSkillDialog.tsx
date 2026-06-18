/**
 * CreateSkillDialog - Lightweight 2-field dialog for creating a new user skill.
 *
 * Collects: skill name (also used as directory name, validated + conflict-checked)
 *            and description.
 * On create, generates a SKILL.md skeleton via `createSkillSkeleton` and
 * immediately hands control to the caller (which opens SkillFileEditor).
 *
 * This replaces the old SkillEditor form-based creation flow, unifying the
 * create and edit experiences through the same file editor.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, FileCode, Save, AlertCircle } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
  BrandButton,
} from '@creatorweave/ui'
import { Input } from '@/components/ui/input'
import { useSkillsStore } from '@/store/skills.store'
import { userSkillDirExists } from '@/skills/user-skills-scanner'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

// The skill name doubles as the OPFS directory name. It must start with a
// letter and contain only letters, digits, and hyphens — this keeps it a safe
// directory identifier while remaining human-readable.
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/

interface CreateSkillDialogProps {
  open: boolean
  onClose: () => void
  /** Called with the newly created skill id after successful creation. */
  onCreated: (skillId: string) => void
}

export function CreateSkillDialog({ open, onClose, onCreated }: CreateSkillDialogProps) {
  const t = useT()
  const createSkillSkeleton = useSkillsStore((s) => s.createSkillSkeleton)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameTaken, setNameTaken] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setError(null)
      setNameTaken(false)
    }
  }, [open])

  // Debounced availability check — the name is used as the directory name,
  // so we need to ensure it doesn't collide with an existing skill.
  useEffect(() => {
    if (!name || !NAME_PATTERN.test(name)) {
      setNameTaken(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const exists = await userSkillDirExists(name).catch(() => false)
      if (!cancelled) setNameTaken(exists)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [name])

  const nameValid = NAME_PATTERN.test(name)
  const nameError = !name
    ? null
    : !nameValid
      ? t('skillEditor.invalidDirName')
      : nameTaken
        ? t('skillEditor.dirNameTaken')
        : null

  const canSubmit = nameValid && !nameTaken && !!description.trim() && !isSaving

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setError(null)
    setIsSaving(true)
    try {
      // The name is used as both the display name and the directory name.
      const result = await createSkillSkeleton(name, name, description.trim())
      if (result.success && result.skillId) {
        onCreated(result.skillId)
      } else {
        setError(result.error || t('skillEditor.saveFailed'))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }, [canSubmit, createSkillSkeleton, name, description, onCreated, t])

  return (
    <BrandDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <BrandDialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden p-0">
        <BrandDialogHeader>
          <BrandDialogTitle className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            <FileCode className="h-4.5 w-4.5 text-blue-500" />
            {t('skillEditor.createSkill')}
          </BrandDialogTitle>
          <BrandDialogClose className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
            <X className="h-5 w-5" />
          </BrandDialogClose>
        </BrandDialogHeader>

        {error && (
          <div className="mx-6 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-5">
            {/* Skill name (also used as directory name) */}
            <div>
              <label className="mb-1.5 flex items-center text-sm font-medium text-neutral-600 dark:text-neutral-400">
                {t('skillEditor.skillName')}
                <span className="ml-1 text-red-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('skillEditor.skillNamePlaceholder')}
                className={cn(
                  'bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700',
                  nameError && 'border-red-400 focus-visible:ring-red-400'
                )}
                autoFocus
              />
              {nameError ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  {nameError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                  {t('skillEditor.skillNameHelp')}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 flex items-center text-sm font-medium text-neutral-600 dark:text-neutral-400">
                {t('skillEditor.description')}
                <span className="ml-1 text-red-500">*</span>
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('skillEditor.descriptionPlaceholder')}
                className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-6 py-3 dark:border-neutral-700">
          <BrandButton variant="outline" onClick={onClose}>
            {t('skillEditor.cancel')}
          </BrandButton>
          <BrandButton onClick={handleSubmit} disabled={!canSubmit}>
            <Save className="mr-1.5 h-4 w-4" />
            {isSaving ? t('skillEditor.saving') : t('skillEditor.create')}
          </BrandButton>
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}
