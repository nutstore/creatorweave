/**
 * QuestionCard - renders an ask_user_question tool call as an interactive question card.
 *
 * Supports four question types:
 * - yes_no: Two-button confirmation (Yes / No) + optional free text input
 * - single_choice: Radio button list + optional free text input
 * - multi_choice: Checkbox list with submit + optional free text input
 * - free_text: Textarea with submit
 *
 * All choice-based types also offer a "自定义输入" (custom input) option so the user
 * can type their own answer instead of (or in addition to) selecting from presets.
 *
 * The card is shown when the tool call is executing (waiting for user input).
 * Once answered, it shows the original question, the type, and the full answer
 * for better context when reviewing conversation history.
 */

import { useState, useCallback, useId, type TextareaHTMLAttributes } from 'react'
import { MessageCircleQuestion, CheckCircle2, Clock, FileText, PencilLine } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'
import { useT } from '@/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionCardProps {
  /** The question text */
  question: string
  /** Question type */
  type: 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text'
  /** Options for single_choice / multi_choice */
  options?: string[]
  /** Default answer for pre-selection */
  defaultAnswer?: string
  /** Additional context */
  context?: {
    affected_files?: string[]
    preview?: string
  }
  /** Whether the question has already been answered (show compact result) */
  answered?: boolean
  /** The answer that was given (for answered state) */
  resultAnswer?: string
  /** Callback when user submits an answer */
  onAnswer?: (answer: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionCard({
  question,
  type,
  options,
  defaultAnswer,
  context,
  answered,
  resultAnswer,
  onAnswer,
}: QuestionCardProps) {
  const t = useT()

  // Already answered — show question + answer for context
  if (answered) {
    return (
      <div className="my-1 rounded border border-green-200 bg-green-50 text-sm dark:border-green-800 dark:bg-green-950/30">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-green-200 px-3 py-2 dark:border-green-800">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <span className="text-xs font-medium text-green-700 dark:text-green-300">
            {t('questionCard.answered', '已回答')}
          </span>
        </div>

        {/* Original question */}
        <div className="border-b border-green-200 px-3 py-2 dark:border-green-800">
          <div className="text-xs text-green-800 dark:text-green-200">
            <MarkdownContent content={question} />
          </div>
        </div>

        {/* Context: affected files */}
        {context?.affected_files && context.affected_files.length > 0 && (
          <div className="border-b border-green-200 px-3 py-2 dark:border-green-800">
            <div className="mb-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <FileText className="h-3 w-3" />
              <span>{t('questionCard.affectedFiles', '相关文件')}</span>
            </div>
            <div className="space-y-0.5">
              {context.affected_files.map((file) => (
                <div key={file} className="truncate font-mono text-xs text-green-800 dark:text-green-200">
                  {file}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Context: preview */}
        {context?.preview && (
          <div className="border-b border-green-200 px-3 py-2 dark:border-green-800">
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-green-800 dark:text-green-200">
              {context.preview}
            </pre>
          </div>
        )}

        {/* User's answer */}
        {resultAnswer && (
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-green-600 dark:text-green-400">
              {t('questionCard.userAnswer', '用户回答')}
            </div>
            <div className="mt-1 rounded bg-green-100 px-2 py-1.5 text-sm text-green-900 dark:bg-green-900/40 dark:text-green-100">
              {resultAnswer}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="my-1 rounded border border-amber-200 bg-amber-50 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 dark:border-amber-800">
        <MessageCircleQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {t('questionCard.title', 'Agent 提问')}
        </span>
        <Clock className="ml-auto h-3 w-3 text-amber-400 dark:text-amber-500" />
      </div>

      {/* Context: affected files */}
      {context?.affected_files && context.affected_files.length > 0 && (
        <div className="border-b border-amber-200 px-3 py-2 dark:border-amber-800">
          <div className="mb-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <FileText className="h-3 w-3" />
            <span>{t('questionCard.affectedFiles', '相关文件')}</span>
          </div>
          <div className="space-y-0.5">
            {context.affected_files.map((file) => (
              <div key={file} className="truncate font-mono text-xs text-amber-800 dark:text-amber-200">
                {file}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context: preview */}
      {context?.preview && (
        <div className="border-b border-amber-200 px-3 py-2 dark:border-amber-800">
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-amber-800 dark:text-amber-200">
            {context.preview}
          </pre>
        </div>
      )}

      {/* Question body */}
      <div className="px-3 py-3">
        <div className="mb-3 text-sm text-amber-900 dark:text-amber-100">
          <MarkdownContent content={question} />
        </div>

        {/* Question type-specific input */}
        {type === 'yes_no' && (
          <YesNoInput defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'single_choice' && (
          <SingleChoiceInput options={options ?? []} defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'multi_choice' && (
          <MultiChoiceInput options={options ?? []} defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'free_text' && (
          <FreeTextInput defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components for each question type
// ---------------------------------------------------------------------------

function YesNoInput({
  defaultAnswer,
  onAnswer,
}: {
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const [showCustom, setShowCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const handleYes = useCallback(() => onAnswer?.('yes'), [onAnswer])
  const handleNo = useCallback(() => onAnswer?.('no'), [onAnswer])
  const handleCustomSubmit = useCallback(() => {
    if (customText.trim()) {
      onAnswer?.(customText.trim())
    }
  }, [customText, onAnswer])
  const handleCustomKeyDown: TextareaHTMLAttributes<HTMLTextAreaElement>['onKeyDown'] = useCallback(
    (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleCustomSubmit()
      }
    },
    [handleCustomSubmit]
  )

  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleYes}
          disabled={showCustom}
          className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-green-700 dark:hover:bg-green-600"
        >
          {t('questionCard.yes', '确认')}
        </button>
        <button
          type="button"
          onClick={handleNo}
          disabled={showCustom}
          className="rounded-md bg-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
        >
          {t('questionCard.no', '取消')}
        </button>
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 ${
            showCustom
              ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-400 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-600'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
          }`}
          title={t('questionCard.customInputHint', '自己填写回答')}
          aria-label={t('questionCard.customInputHint', '自己填写回答')}
        >
          <PencilLine className="h-4 w-4" />
        </button>
      </div>
      {showCustom && (
        <div className="mt-2">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            placeholder={t('questionCard.placeholder', '请输入你的回答…')}
            rows={2}
            className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-amber-500 dark:text-amber-400">
              {t('questionCard.submitHint', 'Ctrl+Enter 提交')}
            </span>
            <button
              type="button"
              disabled={!customText.trim()}
              onClick={handleCustomSubmit}
              className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              {t('questionCard.submit', '提交')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SingleChoiceInput({
  options,
  defaultAnswer,
  onAnswer,
}: {
  options: string[]
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const radioName = useId()
  const [selected, setSelected] = useState(defaultAnswer ?? '')
  const [showCustom, setShowCustom] = useState(false)
  const [customText, setCustomText] = useState('')
  const CUSTOM_VALUE = '__custom__'

  const handleSelect = useCallback((value: string) => {
    setSelected(value)
    if (value !== CUSTOM_VALUE) {
      setShowCustom(false)
      setCustomText('')
    } else {
      setShowCustom(true)
    }
  }, [])

  const handleSubmit = useCallback(() => {
    if (selected === CUSTOM_VALUE && customText.trim()) {
      onAnswer?.(customText.trim())
    } else if (selected && selected !== CUSTOM_VALUE) {
      onAnswer?.(selected)
    }
  }, [selected, customText, onAnswer])

  const handleCustomKeyDown: TextareaHTMLAttributes<HTMLTextAreaElement>['onKeyDown'] = useCallback(
    (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            <input
              type="radio"
              name={radioName}
              value={option}
              checked={selected === option}
              onChange={() => handleSelect(option)}
              className="h-3.5 w-3.5 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-amber-900 dark:text-amber-100">{option}</span>
          </label>
        ))}
        {/* Custom input option */}
        <label
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30"
        >
          <input
            type="radio"
            name={radioName}
            value={CUSTOM_VALUE}
            checked={selected === CUSTOM_VALUE}
            onChange={() => handleSelect(CUSTOM_VALUE)}
            className="h-3.5 w-3.5 text-amber-600 focus:ring-amber-500"
          />
          <PencilLine className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            {t('questionCard.customInput', '自定义输入')}
          </span>
        </label>
      </div>
      {showCustom && (
        <div className="mt-2 ml-5">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            placeholder={t('questionCard.placeholder', '请输入你的回答…')}
            rows={2}
            className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
      )}
      <button
        type="button"
        disabled={selected === CUSTOM_VALUE ? !customText.trim() : !selected}
        onClick={handleSubmit}
        className="mt-2 rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {t('questionCard.confirm', '确认')}
      </button>
    </div>
  )
}

function MultiChoiceInput({
  options,
  defaultAnswer,
  onAnswer,
}: {
  options: string[]
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const defaultSet = defaultAnswer ? new Set(defaultAnswer.split(',')) : new Set<string>()
  const [selected, setSelected] = useState<Set<string>>(defaultSet)
  const [showCustom, setShowCustom] = useState(false)
  const [customText, setCustomText] = useState('')

  const toggle = useCallback((option: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(option)) {
        next.delete(option)
      } else {
        next.add(option)
      }
      return next
    })
  }, [])

  const handleSubmit = useCallback(() => {
    const parts: string[] = Array.from(selected)
    if (showCustom && customText.trim()) {
      parts.push(customText.trim())
    }
    if (parts.length > 0) {
      onAnswer?.(parts.join(','))
    }
  }, [selected, showCustom, customText, onAnswer])

  const handleCustomKeyDown: TextareaHTMLAttributes<HTMLTextAreaElement>['onKeyDown'] = useCallback(
    (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const canSubmit = selected.size > 0 || (showCustom && customText.trim().length > 0)

  return (
    <div>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            <input
              type="checkbox"
              value={option}
              checked={selected.has(option)}
              onChange={() => toggle(option)}
              className="h-3.5 w-3.5 rounded text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-amber-900 dark:text-amber-100">{option}</span>
          </label>
        ))}
      </div>
      {/* Toggle custom input */}
      <button
        type="button"
        onClick={() => setShowCustom(!showCustom)}
        className={`mt-2 flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors ${
          showCustom
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            : 'text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30'
        }`}
      >
        <PencilLine className="h-3.5 w-3.5" />
        <span>{t('questionCard.customInput', '自定义输入')}</span>
      </button>
      {showCustom && (
        <div className="mt-2">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            placeholder={t('questionCard.placeholder', '请输入你的回答…')}
            rows={2}
            className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
      )}
      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="mt-2 rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {t('questionCard.confirm', '确认')}
      </button>
    </div>
  )
}

function FreeTextInput({
  defaultAnswer,
  onAnswer,
}: {
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const [text, setText] = useState(defaultAnswer ?? '')
  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onAnswer?.(text.trim())
    }
  }, [text, onAnswer])

  const handleKeyDown: TextareaHTMLAttributes<HTMLTextAreaElement>['onKeyDown'] = useCallback(
    (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('questionCard.placeholder', '请输入你的回答…')}
        rows={3}
        className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-amber-500 dark:text-amber-400">
          {t('questionCard.submitHint', 'Ctrl+Enter 提交')}
        </span>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={handleSubmit}
          className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
        >
          {t('questionCard.submit', '提交')}
        </button>
      </div>
    </div>
  )
}
