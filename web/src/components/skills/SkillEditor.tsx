/**
 * SkillEditor - Create or edit a skill.
 *
 * Provides form-based editing for frontmatter fields
 * and a textarea for the Markdown content.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, Eye, EyeOff, Save, FileCode, ChevronDown } from 'lucide-react'
import { BrandDialog, BrandDialogContent, BrandDialogTitle } from '@browser-fs-analyzer/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { SkillMetadata, SkillCategory } from '@/skills/skill-types'
import { useSkillsStore } from '@/store/skills.store'
import { cn } from '@/lib/utils'

interface SkillEditorProps {
  /** Skill to edit (undefined = create new) */
  skill?: SkillMetadata
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog is closed */
  onClose: () => void
}

const CATEGORY_OPTIONS: { value: SkillCategory; label: string; color: string }[] = [
  { value: 'code-review', label: '代码审查', color: 'purple' },
  { value: 'testing', label: '测试', color: 'green' },
  { value: 'debugging', label: '调试', color: 'red' },
  { value: 'refactoring', label: '重构', color: 'orange' },
  { value: 'documentation', label: '文档', color: 'blue' },
  { value: 'security', label: '安全', color: 'yellow' },
  { value: 'performance', label: '性能', color: 'pink' },
  { value: 'architecture', label: '架构', color: 'indigo' },
  { value: 'general', label: '通用', color: 'gray' },
]

const CATEGORY_COLORS: Record<string, string> = {
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pink: 'bg-pink-50 text-pink-700 border-pink-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
}

export function SkillEditor({ skill, open, onClose }: SkillEditorProps) {
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
    lines.push(instruction || '*(请输入指令内容)*')
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
      setError('请输入技能名称')
      return
    }
    if (!description.trim()) {
      setError('请输入描述')
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
        setError(result.error || '保存失败')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const currentCategory = CATEGORY_OPTIONS.find((c) => c.value === category)
  const categoryColorClass = currentCategory
    ? CATEGORY_COLORS[currentCategory.color]
    : CATEGORY_COLORS.gray

  return (
    <BrandDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <BrandDialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        {/* Gradient Header */}
        <div className="border-b border-neutral-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <FileCode className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <BrandDialogTitle className="px-0 text-base font-semibold text-neutral-900">
                  {skill ? '编辑技能' : '新建技能'}
                </BrandDialogTitle>
                <p className="mt-1 text-xs text-neutral-600">
                  {skill ? '修改现有技能的配置和内容' : '创建自定义技能，扩展 AI 能力'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="bg-white/80 backdrop-blur-sm hover:bg-white"
              >
                {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPreview ? '编辑' : '预览'}
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/50">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {!showPreview ? (
            <EditForm
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
            <PreviewPanel content={previewContent()} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-6 py-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('border-2', categoryColorClass)}>
              {currentCategory?.label || '未分类'}
            </Badge>
            <span className="text-xs text-neutral-400">{skill ? '编辑模式' : '新建模式'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="bg-white hover:bg-neutral-100">
              取消
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1.5 h-4 w-4" />
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}

interface EditFormProps {
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
        <h3 className="text-sm font-semibold text-neutral-900">基本信息</h3>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="技能名称" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: code-reviewer"
              className="bg-neutral-50 focus:bg-white"
            />
          </FormField>

          <FormField label="分类">
            <div className="relative">
              <button
                type="button"
                onClick={() => setCategoryOpen(!categoryOpen)}
                className={cn(
                  'flex h-10 w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-sm transition-colors',
                  'border-neutral-300 hover:border-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
                )}
              >
                <span>{currentCategory?.label || '选择分类'}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-neutral-400 transition-transform',
                    categoryOpen && 'rotate-180'
                  )}
                />
              </button>
              {categoryOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
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
                          : 'text-neutral-700 hover:bg-neutral-50'
                      )}
                    >
                      <span>{opt.label}</span>
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
                            'bg-gray-500': opt.color === 'gray',
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

        <FormField label="描述" required>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简短描述这个技能的功能"
            className="bg-neutral-50 focus:bg-white"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="标签">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="review, quality"
              className="bg-neutral-50 focus:bg-white"
            />
            <p className="mt-1 text-xs text-neutral-400">逗号分隔，用于分类和搜索</p>
          </FormField>

          <FormField label="触发关键词">
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="审查, 检查"
              className="bg-neutral-50 focus:bg-white"
            />
            <p className="mt-1 text-xs text-neutral-400">逗号分隔，匹配时自动激活</p>
          </FormField>
        </div>

        <FormField label="文件扩展名">
          <Input
            value={fileExtensions}
            onChange={(e) => setFileExtensions(e.target.value)}
            placeholder=".ts, .tsx"
            className="bg-neutral-50 focus:bg-white"
          />
          <p className="mt-1 text-xs text-neutral-400">可选，针对特定文件类型激活</p>
        </FormField>
      </div>

      {/* Content Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">技能内容</h3>

        <FormField label="指令" required>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="你是代码审查专家。当用户要求审查代码时：&#10;1. 分析类型安全性&#10;2. 检查性能问题&#10;3. 评估可读性"
            rows={8}
            className="bg-neutral-50 font-mono text-sm focus:bg-white"
          />
        </FormField>

        <FormField label="示例对话">
          <Textarea
            value={examples}
            onChange={(e) => setExamples(e.target.value)}
            placeholder="用户: '帮我审查这个组件'&#10;AI: '让我检查一下...'"
            rows={5}
            className="bg-neutral-50 font-mono text-sm focus:bg-white"
          />
          <p className="mt-1 text-xs text-neutral-400">可选，提供使用示例帮助 AI 理解</p>
        </FormField>

        <FormField label="输出模板">
          <Textarea
            value={templates}
            onChange={(e) => setTemplates(e.target.value)}
            placeholder="## 审查报告&#10;- 文件: {{filename}}&#10;- 问题: {{issues}}"
            rows={5}
            className="bg-neutral-50 font-mono text-sm focus:bg-white"
          />
          <p className="mt-1 text-xs text-neutral-400">可选，定义标准输出格式</p>
        </FormField>
      </div>
    </div>
  )
}

function PreviewPanel({ content }: { content: string }) {
  const lineCount = content.split('\n').length
  const charCount = content.length

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-neutral-900">SKILL.md 预览</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {lineCount} 行
          </Badge>
          <Badge variant="outline" className="text-xs">
            {charCount} 字符
          </Badge>
        </div>
      </div>

      {/* Code Preview - Light Theme */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2">
          <span className="text-xs font-medium text-neutral-600">SKILL.md</span>
        </div>
        <pre className="max-h-96 overflow-y-auto bg-white p-4 font-mono text-xs text-neutral-700">
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
      <label className="mb-1.5 flex items-center text-sm font-medium text-neutral-700">
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
        'w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm transition-all',
        'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
        'placeholder:text-neutral-400',
        className
      )}
    />
  )
}
