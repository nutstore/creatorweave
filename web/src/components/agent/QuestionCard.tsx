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
 * Options can be either:
 *   - String (legacy): "PostgreSQL" or "⭐ PostgreSQL — 推荐：成熟稳定"
 *   - Object: { label: "PostgreSQL", description?: "...", recommended?: true }
 *
 * String parsing rules (backward compat):
 *   1. Leading "⭐ " marks the option as recommended.
 *   2. First occurrence of " — " splits label and description.
 * Use the object form if either rule would interfere with your text.
 *
 * The card is shown when the tool call is executing (waiting for user input).
 * Once answered, it shows the original question, the type, and the full answer
 * for better context when reviewing conversation history.
 */

import { useState, useCallback, useId, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import { MessageCircleQuestion, CheckCircle2, Clock, FileText, PencilLine, Star } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'
import { useT } from '@/i18n'

// ---------------------------------------------------------------------------
// Option types — accept both string (legacy) and rich object form
// ---------------------------------------------------------------------------

export type RawOption = string | {
  label: string
  description?: string
  recommended?: boolean
}

export interface NormalizedOption {
  label: string
  description?: string
  recommended: boolean
}

/** Normalize a RawOption to a consistent object form. See header for parsing rules. */
function normalizeOption(raw: RawOption): NormalizedOption {
  if (typeof raw === 'object' && raw !== null) {
    return {
      label: raw.label,
      description: raw.description,
      recommended: !!raw.recommended,
    }
  }
  let str = raw
  let recommended = false
  if (str.startsWith('⭐ ')) {
    recommended = true
    str = str.slice(2)
  }
  const dashIdx = str.indexOf(' — ')
  if (dashIdx > 0) {
    return {
      label: str.slice(0, dashIdx).trim(),
      description: str.slice(dashIdx + 3).trim(),
      recommended,
    }
  }
  return { label: str.trim(), recommended }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuestionCardProps {
  /** The question text */
  question: string
  /** Question type */
  type: 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text'
  /** Options for single_choice / multi_choice (accepts string or object form) */
  options?: RawOption[]
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
  const normalizedOptions = (options ?? []).map(normalizeOption)

  // Already answered — show question + answer for context
  if (answered) {
    return (
      <div className="my-1 max-w-full overflow-hidden rounded border border-green-200 bg-green-50 text-sm dark:border-green-800 dark:bg-green-950/30">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-green-200 px-3 py-2 dark:border-green-800">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
          <span className="break-words text-xs font-medium text-green-700 dark:text-green-300">
            {t('questionCard.answered')}
          </span>
        </div>

        {/* Original question */}
        <div className="border-b border-green-200 px-3 py-2 dark:border-green-800">
          <div className="break-words text-xs text-green-800 dark:text-green-200">
            <MarkdownContent content={question} />
          </div>
        </div>

        {/* Context: affected files */}
        {context?.affected_files && context.affected_files.length > 0 && (
          <div className="border-b border-green-200 px-3 py-2 dark:border-green-800">
            <div className="mb-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <FileText className="h-3 w-3 shrink-0" />
              <span>{t('questionCard.affectedFiles')}</span>
            </div>
            <div className="space-y-0.5">
              {context.affected_files.map((file) => (
                <div
                  key={file}
                  title={file}
                  className="break-all font-mono text-xs text-green-800 dark:text-green-200"
                >
                  {file}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Context: preview */}
        {context?.preview && (
          <div className="border-b border-green-200 px-3 py-2 dark:border-green-800">
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-xs text-green-800 dark:text-green-200">
              {context.preview}
            </pre>
          </div>
        )}

        {/* User's answer */}
        {resultAnswer && (
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-green-600 dark:text-green-400">
              {t('questionCard.userAnswer')}
            </div>
            <div className="mt-1 break-words rounded bg-green-100 px-2 py-1.5 text-sm text-green-900 dark:bg-green-900/40 dark:text-green-100">
              {resultAnswer}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="my-1 max-w-full overflow-hidden rounded border border-amber-200 bg-amber-50 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 dark:border-amber-800">
        <MessageCircleQuestion className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="break-words text-xs font-medium text-amber-700 dark:text-amber-300">
          {t('questionCard.title')}
        </span>
        <Clock className="ml-auto h-3 w-3 shrink-0 text-amber-400 dark:text-amber-500" />
      </div>

      {/* Context: affected files */}
      {context?.affected_files && context.affected_files.length > 0 && (
        <div className="border-b border-amber-200 px-3 py-2 dark:border-amber-800">
          <div className="mb-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <FileText className="h-3 w-3 shrink-0" />
            <span>{t('questionCard.affectedFiles')}</span>
          </div>
          <div className="space-y-0.5">
            {context.affected_files.map((file) => (
              <div
                key={file}
                title={file}
                className="break-all font-mono text-xs text-amber-800 dark:text-amber-200"
              >
                {file}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context: preview */}
      {context?.preview && (
        <div className="border-b border-amber-200 px-3 py-2 dark:border-amber-800">
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-xs text-amber-800 dark:text-amber-200">
            {context.preview}
          </pre>
        </div>
      )}

      {/* Question body */}
      <div className="px-3 py-3">
        <div className="mb-3 break-words text-sm text-amber-900 dark:text-amber-100">
          <MarkdownContent content={question} />
        </div>

        {/* Question type-specific input */}
        {type === 'yes_no' && (
          <YesNoInput defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'single_choice' && (
          <SingleChoiceInput options={normalizedOptions} defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'multi_choice' && (
          <MultiChoiceInput options={normalizedOptions} defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
        {type === 'free_text' && (
          <FreeTextInput defaultAnswer={defaultAnswer} onAnswer={onAnswer} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared option renderer (label + optional description + ⭐ badge)
// ---------------------------------------------------------------------------

function OptionContent({ option }: { option: NormalizedOption }) {
  const t = useT()
  return (
    <div className="min-w-0 flex-1 break-words">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {option.recommended && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-200/70 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-800/60 dark:text-amber-200"
            title={t('questionCard.recommended')}
          >
            <Star className="h-2.5 w-2.5 fill-current" />
            <span>{t('questionCard.recommended')}</span>
          </span>
        )}
        <span className="break-words text-sm text-amber-900 dark:text-amber-100">{option.label}</span>
      </div>
      {option.description && (
        <div className="mt-0.5 break-words text-xs text-amber-700 dark:text-amber-300">
          {option.description}
        </div>
      )}
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
  // Highlight the default button. Match on yes/no/true/false/1/0 (case-insensitive, trimmed).
  const normalizedDefault = (defaultAnswer ?? '').trim().toLowerCase()
  const yesIsDefault = normalizedDefault === 'yes' || normalizedDefault === 'true' || normalizedDefault === '1'
  const noIsDefault = normalizedDefault === 'no' || normalizedDefault === 'false' || normalizedDefault === '0'

  const handleYes = useCallback(() => onAnswer?.('yes'), [onAnswer])
  const handleNo = useCallback(() => onAnswer?.('no'), [onAnswer])
  const handleCustomSubmit = useCallback(() => {
    if (customText.trim()) {
      onAnswer?.(customText.trim())
    }
  }, [customText, onAnswer])
  const handleCustomKeyDown: TextareaHTMLAttributes<HTMLTextAreaElement>['onKeyDown'] = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleCustomSubmit()
      }
    },
    [handleCustomSubmit]
  )

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleYes}
          disabled={showCustom}
          className={
            'rounded-md px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ' +
            (yesIsDefault
              ? 'bg-green-700 text-white ring-2 ring-green-400 hover:bg-green-800 focus:ring-green-500 dark:bg-green-600 dark:ring-green-500 dark:hover:bg-green-700'
              : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 dark:bg-green-700 dark:hover:bg-green-600')
          }
        >
          {t('questionCard.yes')}
        </button>
        <button
          type="button"
          onClick={handleNo}
          disabled={showCustom}
          className={
            'rounded-md px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ' +
            (noIsDefault
              ? 'bg-neutral-300 text-neutral-900 ring-2 ring-neutral-500 hover:bg-neutral-400 focus:ring-neutral-400 dark:bg-neutral-600 dark:text-neutral-100 dark:ring-neutral-400 dark:hover:bg-neutral-500'
              : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300 focus:ring-neutral-400 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600')
          }
        >
          {t('questionCard.no')}
        </button>
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className={
            'rounded-md px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 ' +
            (showCustom
              ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-400 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-600'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700')
          }
          title={t('questionCard.customInputHint')}
          aria-label={t('questionCard.customInputHint')}
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
            placeholder={t('questionCard.placeholder')}
            rows={2}
            className="w-full break-words rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-amber-500 dark:text-amber-400">
              {t('questionCard.submitHint')}
            </span>
            <button
              type="button"
              disabled={!customText.trim()}
              onClick={handleCustomSubmit}
              className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              {t('questionCard.submit')}
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
  options: NormalizedOption[]
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
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        {options.map((option, idx) => {
          // Use a stable key — prefer label, fall back to index for duplicates
          const value = option.label
          const key = `${idx}-${option.label}`
          return (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            >
              <input
                type="radio"
                name={radioName}
                value={value}
                checked={selected === value}
                onChange={() => handleSelect(value)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 focus:ring-amber-500"
              />
              <OptionContent option={option} />
            </label>
          )
        })}
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
            className="h-3.5 w-3.5 shrink-0 text-amber-600 focus:ring-amber-500"
          />
          <PencilLine className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            {t('questionCard.customInput')}
          </span>
        </label>
      </div>
      {showCustom && (
        <div className="mt-2 ml-5">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            placeholder={t('questionCard.placeholder')}
            rows={2}
            className="w-full break-words rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
      )}
      <button
        type="button"
        disabled={selected === CUSTOM_VALUE ? !customText.trim() : !selected}
        onClick={handleSubmit}
        className="mt-2 rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {t('questionCard.submit')}
      </button>
    </div>
  )
}

function MultiChoiceInput({
  options,
  defaultAnswer,
  onAnswer,
}: {
  options: NormalizedOption[]
  defaultAnswer?: string
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  // Parse default answer: comma-separated labels (trimmed).
  // Only labels that match actual options are included (silently ignore stale/typo defaults).
  const validLabels = new Set(options.map((o) => o.label))
  const defaultSet = new Set<string>()
  if (defaultAnswer) {
    for (const part of defaultAnswer.split(',')) {
      const trimmed = part.trim()
      if (trimmed && validLabels.has(trimmed)) {
        defaultSet.add(trimmed)
      }
    }
  }
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
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        {options.map((option, idx) => {
          const value = option.label
          const key = `${idx}-${option.label}`
          return (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            >
              <input
                type="checkbox"
                value={value}
                checked={selected.has(value)}
                onChange={() => toggle(value)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded text-amber-600 focus:ring-amber-500"
              />
              <OptionContent option={option} />
            </label>
          )
        })}
      </div>
      {/* Toggle custom input */}
      <button
        type="button"
        onClick={() => setShowCustom(!showCustom)}
        className={
          'mt-2 flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors ' +
          (showCustom
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            : 'text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30')
        }
      >
        <PencilLine className="h-3.5 w-3.5" />
        <span>{t('questionCard.customInput')}</span>
      </button>
      {showCustom && (
        <div className="mt-2">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            placeholder={t('questionCard.placeholder')}
            rows={2}
            className="w-full break-words rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
      )}
      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="mt-2 rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {t('questionCard.submit')}
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
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        placeholder={t('questionCard.placeholder')}
        rows={3}
        className="w-full break-words rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-amber-500 dark:text-amber-400">
          {t('questionCard.submitHint')}
        </span>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={handleSubmit}
          className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-700 dark:hover:bg-amber-600"
        >
          {t('questionCard.submit')}
        </button>
      </div>
    </div>
  )
}