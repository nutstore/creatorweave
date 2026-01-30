/**
 * SkillEditor - Create or edit a skill.
 *
 * Provides form-based editing for frontmatter fields
 * and a textarea for the Markdown content.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, Eye, EyeOff, Save } from 'lucide-react'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { SkillMetadata, SkillCategory } from '@/skills/skill-types'
import { useSkillsStore } from '@/store/skills.store'
import { MarkdownContent } from '@/components/agent/MarkdownContent'
import { cn } from '@/lib/utils'

interface SkillEditorProps {
  /** Skill to edit (undefined = create new) */
  skill?: SkillMetadata
  /** Callback when dialog is closed */
  onClose: () => void
}

const CATEGORY_OPTIONS: { value: SkillCategory; label: string }[] = [
  { value: 'code-review', label: '代码审查' },
  { value: 'testing', label: '测试' },
  { value: 'debugging', label: '调试' },
  { value: 'refactoring', label: '重构' },
  { value: 'documentation', label: '文档' },
  { value: 'security', label: '安全' },
  { value: 'performance', label: '性能' },
  { value: 'architecture', label: '架构' },
  { value: 'general', label: '通用' },
]

export function SkillEditor({ skill, onClose }: SkillEditorProps) {
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
      skillsStore.getFullSkill(skill.id).then((fullSkill) => {
        if (fullSkill) {
          setInstruction(fullSkill.instruction || '')
          setExamples(fullSkill.examples || '')
          setTemplates(fullSkill.templates || '')
        }
      })
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

  return (
    <DialogContent
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden"
    >
      <DialogHeader className="flex-row items-center justify-between">
        <DialogTitle>{skill ? '编辑技能' : '新建技能'}</DialogTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? '编辑' : '预览'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>

      <div className="-mx-6 flex-1 overflow-y-auto px-6">
        {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

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

      <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
        <span className="text-sm text-neutral-500">{skill ? '编辑模式' : '新建模式'}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-1 h-4 w-4" />
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </DialogContent>
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
  return (
    <div className="space-y-6 py-4">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-neutral-900">基本信息</h3>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="技能名称" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: code-reviewer"
            />
          </FormField>

          <FormField label="分类">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SkillCategory)}
              className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="描述" required>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简短描述这个技能的功能"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="标签 (逗号分隔)">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="review, quality, improvement"
            />
          </FormField>

          <FormField label="触发关键词 (逗号分隔)">
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="审查, code review, 检查"
            />
          </FormField>
        </div>

        <FormField label="文件扩展名 (逗号分隔，可选)">
          <Input
            value={fileExtensions}
            onChange={(e) => setFileExtensions(e.target.value)}
            placeholder=".ts, .tsx, .js"
          />
        </FormField>
      </div>

      {/* Content Sections */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-neutral-900">内容</h3>

        <FormField label="# Instruction" required>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="你是代码审查专家。当用户要求审查代码时：&#10;1. 分析类型安全性&#10;2. 检查性能问题&#10;3. 评估可读性"
            rows={6}
            className="font-mono text-xs"
          />
        </FormField>

        <FormField label="# Examples (可选)">
          <Textarea
            value={examples}
            onChange={(e) => setExamples(e.target.value)}
            placeholder="用户: '帮我审查这个组件'&#10;AI: '让我检查一下...'"
            rows={4}
            className="font-mono text-xs"
          />
        </FormField>

        <FormField label="# Templates (可选)">
          <Textarea
            value={templates}
            onChange={(e) => setTemplates(e.target.value)}
            placeholder="## 审查报告模板&#10;- 文件: {{filename}}&#10;- 问题: {{issues}}"
            rows={4}
            className="font-mono text-xs"
          />
        </FormField>
      </div>
    </div>
  )
}

function PreviewPanel({ content }: { content: string }) {
  return (
    <div className="py-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-900">预览 (SKILL.md)</h3>
        <Badge variant="neutral" className="text-xs">
          {content.split('\n').length} 行
        </Badge>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-700">{content}</pre>
      </div>
      <div className="mt-4">
        <h4 className="mb-2 text-xs font-medium text-neutral-700">渲染预览:</h4>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
          <MarkdownContent content={content} />
        </div>
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
      <label className="mb-1 block text-sm font-medium text-neutral-700">
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
        'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
        className
      )}
    />
  )
}
