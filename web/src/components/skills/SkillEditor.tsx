/**
 * SkillEditor - Create or edit a skill.
 *
 * Provides form-based editing for frontmatter fields
 * and a textarea for the Markdown content.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, Eye, EyeOff, Save, FileCode, ChevronDown } from 'lucide-react'
import { BrandDialog, BrandDialogContent, BrandDialogTitle } from '@creatorweave/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { SkillMetadata, SkillCategory } from '@/skills/skill-types'
import { useSkillsStore } from '@/store/skills.store'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

interface SkillEditorProps {
  /** Skill to edit (undefined = create new) */
  skill?: SkillMetadata
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog is closed */
  onClose: () => void
}

const CATEGORY_OPTIONS: { value: SkillCategory; labelKey: string; color: string }[] = [
  { value: 'code-review', labelKey: 'skillEditor.categories.codeReview', color: 'purple' },
  { value: 'testing', labelKey: 'skillEditor.categories.testing', color: 'green' },
  { value: 'debugging', labelKey: 'skillEditor.categories.debugging', color: 'red' },
  { value: 'refactoring', labelKey: 'skillEditor.categories.refactoring', color: 'orange' },
  { value: 'documentation', labelKey: 'skillEditor.categories.documentation', color: 'blue' },
  { value: 'security', labelKey: 'skillEditor.categories.security', color: 'yellow' },
  { value: 'performance', labelKey: 'skillEditor.categories.performance', color: 'pink' },
  { value: 'architecture', labelKey: 'skillEditor.categories.architecture', color: 'indigo' },
  { value: 'general', labelKey: 'skillEditor.categories.general', color: 'gray' },
]

const CATEGORY_COLORS: Record<string, string> = {
  purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-300 dark:border-purple-900/40',
  green: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-300 dark:border-green-900/40',
  red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-900/40',
  orange: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-300 dark:border-orange-900/40',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/40',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-300 dark:border-yellow-900/40',
  pink: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/20 dark:text-pink-300 dark:border-pink-900/40',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-300 dark:border-indigo-900/40',
  gray: 'bg-neutral-50 text-neutral-700 border-neutral-200 dark:bg-muted dark:text-muted dark:border-border',
}

export function SkillEditor({ skill, open, onClose }: SkillEditorProps) {
  const t = useT()
  const skillsStore = useSkillsStore()
  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState(skill?.name || '')
  const [description, setDescription] = useState(skill?.description || '')
  const [category, setCategory] = useState<SkillCategory>(skill?.category || 'general')
  const [tags, setTags] = useState(skill?.tags?.join(', ') || '')
  const [keywords, setKeywords] = useState(skill?.triggers?.keywords?.join(', ') || '')
  const [fileExtensions, setFileExtensions] = useState(
    skill?.triggers?.fileExtensions?.join(', ') || ''
  )
  const [instruction, setInstruction] = useState('')
  const [examples, setExamples] = useState('')
  const [templates, setTemplates] = useState('')

  // Load full skill content when editing
  useEffect(() => {
    if (skill) {
      // Sync metadata fields from skill prop
      setName(skill.name || '')
      setDescription(skill.description || '')
      setCategory(skill.category || 'general')
      setTags(skill.tags?.join(', ') || '')
      setKeywords(skill.triggers?.keywords?.join(', ') || '')
      setFileExtensions(skill.triggers?.fileExtensions?.join(', ') || '')

      // Load full content for instruction, examples, templates
      skillsStore.getFullSkill(skill.id).then((fullSkill) => {
        if (fullSkill) {
          setInstruction(fullSkill.instruction || '')
          setExamples(fullSkill.examples || '')
          setTemplates(fullSkill.templates || '')
        }
      })
    } else {
      // Reset form when skill is undefined (create mode)
      setName('')
      setDescription('')
      setCategory('general')
      setTags('')
      setKeywords('')
      setFileExtensions('')
      setInstruction('')
      setExamples('')
      setTemplates('')
    }
  }, [skill, skillsStore])

  // Generate preview content
  const previewContent = useCallback(() => {
    const keywordList = keywords
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const extList = fileExtensions
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const lines: string[] = ['---']
    lines.push(`name: "${name}"`)
    lines.push(`version: "1.0.0"`)
    lines.push(`description: "${description}"`)
    lines.push(`author: "User"`)
    lines.push(`category: ${category}`)
    if (tagList.length > 0) {
      lines.push(`tags: [${tagList.map((t) => `"${t}"`).join(', ')}]`)
    }
    lines.push('triggers:')
    if (keywordList.length > 0) {
      lines.push(`  keywords: [${keywordList.map((k) => `"${k}"`).join(', ')}]`)
    }
    if (extList.length > 0) {
      lines.push(`  fileExtensions: [${extList.map((e) => `"${e}"`).join(', ')}]`)
    }
    lines.push('---')
    lines.push('')
    lines.push('# Instruction')
    lines.push(instruction || t('skillEditor.instructionPlaceholder'))
    if (examples) {
      lines.push('')
      lines.push('# Examples')
      lines.push(examples)
    }
    if (templates) {
      lines.push('')
      lines.push('# Templates')
      lines.push(templates)
    }

    return lines.join('\n')
  }, [
    name,
    description,
    category,
    tags,
    keywords,
    fileExtensions,
    instruction,
    examples,
    templates,
  ])

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError(t('skillEditor.nameRequired'))
      return
    }
    if (!description.trim()) {
      setError(t('skillEditor.descriptionRequired'))
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const content = previewContent()
      const result = await skillsStore.importSkillMd(content)

      if (result.success) {
        onClose()
      } else {
        setError(result.error || t('skillEditor.saveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const currentCategory = CATEGORY_OPTIONS.find((c) => c.value === category)
  const categoryColorClass = currentCategory
    ? CATEGORY_COLORS[currentCategory.color]
    : CATEGORY_COLORS.gray
  const currentCategoryLabel = currentCategory ? t(currentCategory.labelKey) : t('skillEditor.uncategorized')

  return (
    <BrandDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <BrandDialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        {/* Header - subtle background */}
        <div className="border-b border bg-muted/30 px-6 py-4 dark:border-border dark:bg-muted/30">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-muted">
                <FileCode className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <BrandDialogTitle className="px-0 text-base font-semibold text-primary dark:text-primary-foreground">
                  {skill ? t('skillEditor.editSkill') : t('skillEditor.createSkill')}
                </BrandDialogTitle>
                <p className="mt-1 text-xs text-secondary dark:text-muted">
                  {skill ? t('skillEditor.editDescription') : t('skillEditor.createDescription')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="bg-white/80 backdrop-blur-sm hover:bg-white dark:bg-muted dark:hover:bg-muted"
              >
                {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPreview ? t('skillEditor.edit') : t('skillEditor.preview')}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/50 dark:hover:bg-muted">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {!showPreview ? (
            <EditForm
              t={t}
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              category={category}
              setCategory={setCategory}
              tags={tags}
              setTags={setTags}
              keywords={keywords}
              setKeywords={setKeywords}
              fileExtensions={fileExtensions}
              setFileExtensions={setFileExtensions}
              instruction={instruction}
              setInstruction={setInstruction}
              examples={examples}
              setExamples={setExamples}
              templates={templates}
              setTemplates={setTemplates}
            />
          ) : (
            <PreviewPanel content={previewContent()} t={t} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border bg-muted px-6 py-3 dark:border-border dark:bg-muted">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('border-2', categoryColorClass)}>
              {currentCategoryLabel}
            </Badge>
            <span className="text-xs text-tertiary dark:text-muted">{skill ? t('skillEditor.editMode') : t('skillEditor.createMode')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="bg-white hover:bg-muted dark:bg-card dark:hover:bg-muted">
              {t('skillEditor.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1.5 h-4 w-4" />
              {isSaving ? t('skillEditor.saving') : t('skillEditor.save')}
            </Button>
          </div>
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}

interface EditFormProps {
  t: (key: string) => string
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  category: SkillCategory
  setCategory: (v: SkillCategory) => void
  tags: string
  setTags: (v: string) => void
  keywords: string
  setKeywords: (v: string) => void
  fileExtensions: string
  setFileExtensions: (v: string) => void
  instruction: string
  setInstruction: (v: string) => void
  examples: string
  setExamples: (v: string) => void
  templates: string
  setTemplates: (v: string) => void
}

function EditForm({
  t,
  name,
  setName,
  description,
  setDescription,
  category,
  setCategory,
  tags,
  setTags,
  keywords,
  setKeywords,
  fileExtensions,
  setFileExtensions,
  instruction,
  setInstruction,
  examples,
  setExamples,
  templates,
  setTemplates,
}: EditFormProps) {
  const [categoryOpen, setCategoryOpen] = useState(false)
  const currentCategory = CATEGORY_OPTIONS.find((c) => c.value === category)

  return (
    <div className="space-y-6 p-6">
      {/* Basic Info Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-primary dark:text-primary-foreground">{t('skillEditor.basicInfo')}</h3>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('skillEditor.skillName')} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('skillEditor.skillNamePlaceholder')}
              className="bg-muted focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
            />
          </FormField>

          <FormField label={t('skillEditor.category')}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCategoryOpen(!categoryOpen)}
                className={cn(
                  'flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-sm transition-colors dark:bg-card dark:text-primary-foreground',
                  'border hover:border focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-border dark:hover:border'
                )}
              >
                <span>{currentCategory ? t(currentCategory.labelKey) : t('skillEditor.selectCategory')}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-tertiary transition-transform',
                    categoryOpen && 'rotate-180'
                  )}
                />
              </button>
              {categoryOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border bg-card py-1 shadow-lg dark:border-border dark:bg-card">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setCategory(opt.value)
                        setCategoryOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors',
                        category === opt.value
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-secondary hover:bg-muted dark:text-muted dark:hover:bg-muted'
                      )}
                    >
                      <span>{t(opt.labelKey)}</span>
                      {category === opt.value && (
                        <div
                          className={cn('h-2 w-2 rounded-full', {
                            'bg-purple-500': opt.color === 'purple',
                            'bg-green-500': opt.color === 'green',
                            'bg-red-500': opt.color === 'red',
                            'bg-orange-500': opt.color === 'orange',
                            'bg-blue-500': opt.color === 'blue',
                            'bg-yellow-500': opt.color === 'yellow',
                            'bg-pink-500': opt.color === 'pink',
                            'bg-indigo-500': opt.color === 'indigo',
                            'bg-neutral-500': opt.color === 'gray',
                          })}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FormField>
        </div>

        <FormField label={t('skillEditor.description')} required>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('skillEditor.descriptionPlaceholder')}
            className="bg-muted focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('skillEditor.tags')}>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="review, quality"
              className="bg-muted focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
            />
            <p className="mt-1 text-xs text-tertiary dark:text-muted">{t('skillEditor.tagsHelp')}</p>
          </FormField>

          <FormField label={t('skillEditor.triggerKeywords')}>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={t('skillEditor.triggerKeywordsPlaceholder')}
              className="bg-muted focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
            />
            <p className="mt-1 text-xs text-tertiary dark:text-muted">{t('skillEditor.triggerKeywordsHelp')}</p>
          </FormField>
        </div>

        <FormField label={t('skillEditor.fileExtensions')}>
          <Input
            value={fileExtensions}
            onChange={(e) => setFileExtensions(e.target.value)}
            placeholder=".ts, .tsx"
            className="bg-muted focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
          />
          <p className="mt-1 text-xs text-tertiary dark:text-muted">{t('skillEditor.fileExtensionsHelp')}</p>
        </FormField>
      </div>

      {/* Content Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-primary dark:text-primary-foreground">{t('skillEditor.skillContent')}</h3>

        <FormField label={t('skillEditor.instruction')} required>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t('skillEditor.instructionPlaceholder')}
            rows={8}
            className="bg-muted font-mono text-sm focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
          />
        </FormField>

        <FormField label={t('skillEditor.exampleDialog')}>
          <Textarea
            value={examples}
            onChange={(e) => setExamples(e.target.value)}
            placeholder={t('skillEditor.exampleDialogPlaceholder')}
            rows={5}
            className="bg-muted font-mono text-sm focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
          />
          <p className="mt-1 text-xs text-tertiary dark:text-muted">{t('skillEditor.exampleDialogHelp')}</p>
        </FormField>

        <FormField label={t('skillEditor.outputTemplate')}>
          <Textarea
            value={templates}
            onChange={(e) => setTemplates(e.target.value)}
            placeholder={t('skillEditor.outputTemplatePlaceholder')}
            rows={5}
            className="bg-muted font-mono text-sm focus:bg-white dark:bg-muted dark:text-primary-foreground dark:focus:bg-card"
          />
          <p className="mt-1 text-xs text-tertiary dark:text-muted">{t('skillEditor.outputTemplateHelp')}</p>
        </FormField>
      </div>
    </div>
  )
}

function PreviewPanel({ content, t }: { content: string; t: (key: string) => string }) {
  const lineCount = content.split('\n').length
  const charCount = content.length

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-primary dark:text-primary-foreground">{t('skillEditor.skillMdPreview')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {lineCount} {t('skillEditor.lines')}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {charCount} {t('skillEditor.characters')}
          </Badge>
        </div>
      </div>

      {/* Code Preview - Light Theme */}
      <div className="overflow-hidden rounded-xl border border bg-card dark:border-border dark:bg-card">
        <div className="flex items-center justify-between border-b border bg-muted px-4 py-2 dark:border-border dark:bg-muted">
          <span className="text-xs font-medium text-secondary dark:text-muted">SKILL.md</span>
        </div>
        <pre className="max-h-96 overflow-y-auto bg-white p-4 font-mono text-xs text-secondary dark:bg-card dark:text-muted">
          {content}
        </pre>
      </div>
    </div>
  )
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center text-sm font-medium text-secondary dark:text-muted">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows,
  className,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        'w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm transition-all dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100',
        'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
        'placeholder:text-tertiary',
        className
      )}
    />
  )
}
