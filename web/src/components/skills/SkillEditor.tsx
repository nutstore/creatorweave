/**
 * SkillEditor - Create, view, or edit a skill.
 *
 * Provides form-based editing for frontmatter fields
 * and a textarea for the Markdown content.
 *
 * Optimized:
 * - readOnly mode: structured detail view with sections
 * - edit mode: tabbed layout (Basic Info / Content / Preview)
 * - TextareaWithLines with line numbers & Tab indent
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  X, Eye, Save, FileCode, ChevronDown, Lock,
  Tag, FileText, Zap, Clock, User as UserIcon, Layers,
} from 'lucide-react'
import { BrandDialog, BrandDialogContent, BrandDialogTitle } from '@creatorweave/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { SkillMetadata, SkillCategory, SkillSource } from '@/skills/skill-types'
import { useSkillsStore } from '@/store/skills.store'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

// ============================================================================
// Constants
// ============================================================================

interface SkillEditorProps {
  skill?: SkillMetadata
  open: boolean
  onClose: () => void
  readOnly?: boolean
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

const CATEGORY_DOT_COLORS: Record<string, string> = {
  purple: 'bg-purple-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-500',
  gray: 'bg-neutral-500',
}

const SOURCE_ICONS: Record<SkillSource, { icon: typeof FileCode; labelKey: string }> = {
  builtin: { icon: Layers, labelKey: 'skillDetail.sourceBuiltin' },
  user: { icon: UserIcon, labelKey: 'skillDetail.sourceUser' },
  import: { icon: FileCode, labelKey: 'skillDetail.sourceImport' },
  project: { icon: FileText, labelKey: 'skillDetail.sourceProject' },
}

// ============================================================================
// Main Component
// ============================================================================

export function SkillEditor({ skill, open, onClose, readOnly = false }: SkillEditorProps) {
  const t = useT()
  const skillsStore = useSkillsStore()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit mode tabs
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'preview'>('basic')

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

  // Load full skill content
  useEffect(() => {
    if (skill) {
      setName(skill.name || '')
      setDescription(skill.description || '')
      setCategory(skill.category || 'general')
      setTags(skill.tags?.join(', ') || '')
      setKeywords(skill.triggers?.keywords?.join(', ') || '')
      setFileExtensions(skill.triggers?.fileExtensions?.join(', ') || '')

      skillsStore.getFullSkill(skill.id).then((fullSkill) => {
        if (fullSkill) {
          setInstruction(fullSkill.instruction || '')
          setExamples(fullSkill.examples || '')
          setTemplates(fullSkill.templates || '')
        }
      })
    } else {
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
    setActiveTab('basic')
  }, [skill, skillsStore])

  // Parsed tag/keyword lists
  const tagList = useMemo(() =>
    tags.split(',').map((t) => t.trim()).filter(Boolean), [tags])
  const keywordList = useMemo(() =>
    keywords.split(',').map((t) => t.trim()).filter(Boolean), [keywords])
  const extList = useMemo(() =>
    fileExtensions.split(',').map((t) => t.trim()).filter(Boolean), [fileExtensions])

  // Preview content
  const previewContent = useCallback(() => {
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
  }, [name, description, category, tagList, keywordList, extList, instruction, examples, templates, t])

  const handleSave = async () => {
    if (!name.trim()) { setError(t('skillEditor.nameRequired')); return }
    if (!description.trim()) { setError(t('skillEditor.descriptionRequired')); return }
    setError(null)
    setIsSaving(true)
    try {
      const content = previewContent()
      const result = await skillsStore.importSkillMd(content)
      if (result.success) { onClose() }
      else { setError(result.error || t('skillEditor.saveFailed')) }
    } finally { setIsSaving(false) }
  }

  const currentCategory = CATEGORY_OPTIONS.find((c) => c.value === category)
  const categoryColorClass = currentCategory ? CATEGORY_COLORS[currentCategory.color] : CATEGORY_COLORS.gray
  const currentCategoryLabel = currentCategory ? t(currentCategory.labelKey) : t('skillEditor.uncategorized')
  const categoryDotColor = currentCategory ? CATEGORY_DOT_COLORS[currentCategory.color] : 'bg-neutral-500'

  return (
    <BrandDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <BrandDialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        {/* Header */}
        <div className="border-b border-neutral-200 bg-muted/30 px-6 py-4 dark:border-neutral-700 dark:bg-neutral-900/50">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-neutral-800">
                {readOnly ? (
                  <Eye className="h-5 w-5 text-blue-500" />
                ) : (
                  <FileCode className="h-5 w-5 text-blue-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <BrandDialogTitle className="flex items-center gap-2 px-0 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  {readOnly
                    ? skill?.name || t('skillCard.viewDetails')
                    : skill
                      ? t('skillEditor.editSkill')
                      : t('skillEditor.createSkill')}
                  {readOnly && (
                    <Lock className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                  )}
                </BrandDialogTitle>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {readOnly
                    ? skill?.description
                    : skill
                      ? t('skillEditor.editDescription')
                      : t('skillEditor.createDescription')}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/50 dark:hover:bg-neutral-800">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Content Area */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {readOnly ? (
            <SkillDetailView
              skill={skill}
              instruction={instruction}
              examples={examples}
              templates={templates}
              previewContent={previewContent()}
              t={t}
              currentCategoryLabel={currentCategoryLabel}
              categoryColorClass={categoryColorClass}
              categoryDotColor={categoryDotColor}
            />
          ) : (
            <EditTabLayout
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              t={t}
              tabs={[
                { key: 'basic', label: t('skillEditor.basicInfo') },
                { key: 'content', label: t('skillEditor.skillContent') },
                { key: 'preview', label: t('skillEditor.preview') },
              ]}
            >
              {activeTab === 'basic' && (
                <BasicInfoTab
                  t={t}
                  name={name} setName={setName}
                  description={description} setDescription={setDescription}
                  category={category} setCategory={setCategory}
                  tags={tags} setTags={setTags}
                  keywords={keywords} setKeywords={setKeywords}
                  fileExtensions={fileExtensions} setFileExtensions={setFileExtensions}
                />
              )}
              {activeTab === 'content' && (
                <ContentTab
                  t={t}
                  instruction={instruction} setInstruction={setInstruction}
                  examples={examples} setExamples={setExamples}
                  templates={templates} setTemplates={setTemplates}
                />
              )}
              {activeTab === 'preview' && (
                <div className="p-6">
                  <PreviewPanel content={previewContent()} t={t} />
                </div>
              )}
            </EditTabLayout>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-muted/30 px-6 py-3 dark:border-neutral-700 dark:bg-neutral-900/50">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('border-2', categoryColorClass)}>
              {currentCategoryLabel}
            </Badge>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {readOnly
                ? t('skillEditor.readOnly') || 'Read-only'
                : skill ? t('skillEditor.editMode') : t('skillEditor.createMode')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {readOnly ? (
              <Button variant="outline" onClick={onClose} className="bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700">
                {t('skillEditor.close')}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={onClose} className="bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700">
                  {t('skillEditor.cancel')}
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {isSaving ? t('skillEditor.saving') : t('skillEditor.save')}
                </Button>
              </>
            )}
          </div>
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}

// ============================================================================
// SkillDetailView - Structured read-only view
// ============================================================================

interface SkillDetailViewProps {
  skill?: SkillMetadata
  instruction: string
  examples: string
  templates: string
  previewContent: string
  t: (key: string) => string
  currentCategoryLabel: string
  categoryColorClass: string
  categoryDotColor: string
}

function SkillDetailView({
  skill,
  instruction,
  examples,
  templates,
  previewContent,
  t,
  currentCategoryLabel,
  categoryColorClass,
  categoryDotColor,
}: SkillDetailViewProps) {
  const [detailTab, setDetailTab] = useState<'overview' | 'content' | 'raw'>('overview')

  if (!skill) return null

  const sourceInfo = SOURCE_ICONS[skill.source] || SOURCE_ICONS.project
  const SourceIcon = sourceInfo.icon
  const keywordList = skill.triggers?.keywords || []
  const extList = skill.triggers?.fileExtensions || []
  const hasContent = !!(instruction || examples || templates)

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-neutral-200 dark:border-neutral-700">
        <DetailTabBtn active={detailTab === 'overview'} onClick={() => setDetailTab('overview')}>
          {t('skillDetail.tabOverview') || 'Overview'}
        </DetailTabBtn>
        {hasContent && (
          <DetailTabBtn active={detailTab === 'content'} onClick={() => setDetailTab('content')}>
            {t('skillDetail.tabContent') || 'Content'}
          </DetailTabBtn>
        )}
        <DetailTabBtn active={detailTab === 'raw'} onClick={() => setDetailTab('raw')}>
          {t('skillDetail.tabRaw') || 'SKILL.md'}
        </DetailTabBtn>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {detailTab === 'overview' && (
          <div className="space-y-6 p-6">
            {/* Title section */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-neutral-800">
                <div className={cn('h-3 w-3 rounded-full', categoryDotColor)} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  {skill.name}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {skill.description}
                </p>
              </div>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-4">
              <MetaItem
                icon={<Badge variant="outline" className={cn('border-2 text-xs', categoryColorClass)}>{currentCategoryLabel}</Badge>}
                label={t('skillDetail.category') || 'Category'}
              />
              <MetaItem
                icon={<SourceIcon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />}
                label={t(sourceInfo.labelKey) || skill.source}
              />
              <MetaItem
                icon={<UserIcon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />}
                label={skill.author || 'Unknown'}
              />
              <MetaItem
                icon={<Clock className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />}
                label={formatDate(skill.updatedAt)}
              />
            </div>

            {/* Tags */}
            {skill.tags.length > 0 && (
              <MetaSection
                icon={<Tag className="h-4 w-4" />}
                title={t('skillDetail.tags') || 'Tags'}
              >
                <div className="flex flex-wrap gap-1.5">
                  {skill.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </MetaSection>
            )}

            {/* Trigger keywords */}
            {keywordList.length > 0 && (
              <MetaSection
                icon={<Zap className="h-4 w-4" />}
                title={t('skillDetail.triggerKeywords') || 'Trigger Keywords'}
              >
                <div className="flex flex-wrap gap-1.5">
                  {keywordList.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </MetaSection>
            )}

            {/* File extensions */}
            {extList.length > 0 && (
              <MetaSection
                icon={<FileText className="h-4 w-4" />}
                title={t('skillDetail.fileExtensions') || 'File Extensions'}
              >
                <div className="flex flex-wrap gap-1.5">
                  {extList.map((ext) => (
                    <span
                      key={ext}
                      className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 font-mono text-xs font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </MetaSection>
            )}
          </div>
        )}

        {detailTab === 'content' && (
          <div className="space-y-6 p-6">
            {/* Instruction */}
            {instruction && (
              <ContentSection title={t('skillEditor.instruction')} color="blue">
                <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {instruction}
                </div>
              </ContentSection>
            )}
            {/* Examples */}
            {examples && (
              <ContentSection title={t('skillEditor.exampleDialog')} color="green">
                <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {examples}
                </div>
              </ContentSection>
            )}
            {/* Templates */}
            {templates && (
              <ContentSection title={t('skillEditor.outputTemplate')} color="purple">
                <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {templates}
                </div>
              </ContentSection>
            )}
          </div>
        )}

        {detailTab === 'raw' && (
          <div className="p-6">
            <PreviewPanel content={previewContent} t={t} />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Detail sub-components
// ============================================================================

function DetailTabBtn({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
      )}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
      )}
    </button>
  )
}

function MetaItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="shrink-0">{icon}</div>
      <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">{label}</span>
    </div>
  )
}

function MetaSection({ icon, title, children }: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-400">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function ContentSection({ title, color, children }: {
  title: string
  color: 'blue' | 'green' | 'purple'
  children: React.ReactNode
}) {
  const colors: Record<string, { border: string; header: string; dot: string }> = {
    blue: {
      border: 'border-blue-200 dark:border-blue-900/40',
      header: 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300',
      dot: 'bg-blue-500',
    },
    green: {
      border: 'border-green-200 dark:border-green-900/40',
      header: 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300',
      dot: 'bg-green-500',
    },
    purple: {
      border: 'border-purple-200 dark:border-purple-900/40',
      header: 'bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-300',
      dot: 'bg-purple-500',
    },
  }
  const c = colors[color] || colors.blue

  return (
    <div className={cn('overflow-hidden rounded-xl border', c.border)}>
      <div className={cn('flex items-center gap-2 px-4 py-2', c.header)}>
        <span className={cn('h-2 w-2 rounded-full', c.dot)} />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="bg-white p-4 dark:bg-neutral-800/50">
        {children}
      </div>
    </div>
  )
}

// ============================================================================
// EditTabLayout - Tabbed layout for edit mode
// ============================================================================

function EditTabLayout({
  activeTab,
  setActiveTab,
  t: _t,
  tabs,
  children,
}: {
  activeTab: string
  setActiveTab: (tab: any) => void
  t: (key: string) => string
  tabs: { key: string; label: string }[]
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-neutral-200 dark:border-neutral-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

// ============================================================================
// Tab Content Components
// ============================================================================

function BasicInfoTab({
  t, name, setName, description, setDescription,
  category, setCategory, tags, setTags,
  keywords, setKeywords, fileExtensions, setFileExtensions,
}: {
  t: (key: string) => string
  name: string; setName: (v: string) => void
  description: string; setDescription: (v: string) => void
  category: SkillCategory; setCategory: (v: SkillCategory) => void
  tags: string; setTags: (v: string) => void
  keywords: string; setKeywords: (v: string) => void
  fileExtensions: string; setFileExtensions: (v: string) => void
}) {
  const [categoryOpen, setCategoryOpen] = useState(false)
  const currentCategory = CATEGORY_OPTIONS.find((c) => c.value === category)

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('skillEditor.skillName')} required>
          <Input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('skillEditor.skillNamePlaceholder')}
            className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
          />
        </FormField>

        <FormField label={t('skillEditor.category')}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCategoryOpen(!categoryOpen)}
              className={cn(
                'flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100',
                'border-neutral-200 hover:border-neutral-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600'
              )}
            >
              <div className="flex items-center gap-2">
                {currentCategory && (
                  <div className={cn('h-2 w-2 rounded-full', CATEGORY_DOT_COLORS[currentCategory.color])} />
                )}
                <span>{currentCategory ? t(currentCategory.labelKey) : t('skillEditor.selectCategory')}</span>
              </div>
              <ChevronDown className={cn('h-4 w-4 text-neutral-400 transition-transform', categoryOpen && 'rotate-180')} />
            </button>
            {categoryOpen && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setCategory(opt.value); setCategoryOpen(false) }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                      category === opt.value
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                        : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    )}
                  >
                    <div className={cn('h-2 w-2 rounded-full', CATEGORY_DOT_COLORS[opt.color])} />
                    <span>{t(opt.labelKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </FormField>
      </div>

      <FormField label={t('skillEditor.description')} required>
        <Input
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={t('skillEditor.descriptionPlaceholder')}
          className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('skillEditor.tags')}>
          <Input
            value={tags} onChange={(e) => setTags(e.target.value)}
            placeholder="review, quality"
            className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
          />
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{t('skillEditor.tagsHelp')}</p>
        </FormField>

        <FormField label={t('skillEditor.triggerKeywords')}>
          <Input
            value={keywords} onChange={(e) => setKeywords(e.target.value)}
            placeholder={t('skillEditor.triggerKeywordsPlaceholder')}
            className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
          />
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{t('skillEditor.triggerKeywordsHelp')}</p>
        </FormField>
      </div>

      <FormField label={t('skillEditor.fileExtensions')}>
        <Input
          value={fileExtensions} onChange={(e) => setFileExtensions(e.target.value)}
          placeholder=".ts, .tsx"
          className="bg-neutral-50 focus:bg-white dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-700"
        />
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{t('skillEditor.fileExtensionsHelp')}</p>
      </FormField>
    </div>
  )
}

function ContentTab({
  t, instruction, setInstruction,
  examples, setExamples, templates, setTemplates,
}: {
  t: (key: string) => string
  instruction: string; setInstruction: (v: string) => void
  examples: string; setExamples: (v: string) => void
  templates: string; setTemplates: (v: string) => void
}) {
  return (
    <div className="space-y-5 p-6">
      <FormField label={t('skillEditor.instruction')} required>
        <TextareaWithLines
          value={instruction} onChange={(e) => setInstruction(e.target.value)}
          placeholder={t('skillEditor.instructionPlaceholder')}
          rows={10}
        />
      </FormField>

      <FormField label={t('skillEditor.exampleDialog')}>
        <TextareaWithLines
          value={examples} onChange={(e) => setExamples(e.target.value)}
          placeholder={t('skillEditor.exampleDialogPlaceholder')}
          rows={6}
        />
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{t('skillEditor.exampleDialogHelp')}</p>
      </FormField>

      <FormField label={t('skillEditor.outputTemplate')}>
        <TextareaWithLines
          value={templates} onChange={(e) => setTemplates(e.target.value)}
          placeholder={t('skillEditor.outputTemplatePlaceholder')}
          rows={6}
        />
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{t('skillEditor.outputTemplateHelp')}</p>
      </FormField>
    </div>
  )
}

// ============================================================================
// PreviewPanel - Markdown preview
// ============================================================================

function PreviewPanel({ content, t }: { content: string; t: (key: string) => string }) {
  const lineCount = content.split('\n').length
  const charCount = content.length

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">SKILL.md</span>
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
      <pre className="max-h-[55vh] overflow-y-auto bg-white p-4 font-mono text-xs leading-relaxed text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        {content}
      </pre>
    </div>
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

// ============================================================================
// Helpers
// ============================================================================

function formatDate(timestamp: number): string {
  if (!timestamp) return '-'
  const d = new Date(timestamp)
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}
