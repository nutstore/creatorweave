import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import History from '@tiptap/extension-history'
import Mention from '@tiptap/extension-mention'
import { FileMention, type FileMentionItem } from './FileMentionExtension'
import { Plus, Trash2, Check, FileIcon } from 'lucide-react'
import { useT } from '@/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentMentionCandidate {
  id: string
  name?: string
}

export interface AgentRichInputValue {
  text: string
  mentionedAgentIds: string[]
  /** Selected file paths (displayed as tags above the editor). */
  selectedFiles: string[]
}

export interface AgentInfo {
  id: string
  name?: string
}

interface AgentRichInputProps {
  ariaLabel?: string
  placeholder: string
  disabled?: boolean
  resetToken?: number
  agents: AgentMentionCandidate[]
  onSubmit: () => void
  onChange: (value: AgentRichInputValue) => void
  /** Async file search callback for # file mention. */
  onSearchFiles?: (query: string) => Promise<FileMentionItem[]>
  /** Called when IME composition starts/ends — lets the parent suppress search during composition. */
  onSetIsComposing?: (composing: boolean) => void
  // Agent selector props
  activeAgentId: string | null
  allAgents: AgentMentionCandidate[]
  onSetActiveAgent: (id: string) => Promise<void>
  onCreateAgent: (id: string) => Promise<AgentInfo | null>
  onDeleteAgent: (id: string) => Promise<boolean>
}

// ---------------------------------------------------------------------------
// Suggestion dropdown – imperative handle so the Mention extension can
// drive keyboard navigation without extra React state wiring.
// ---------------------------------------------------------------------------

interface SuggestionDropdownHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface SuggestionDropdownProps<T> {
  items: T[]
  getItemKey: (item: T) => string
  onSelect: (item: T) => void
  renderItem: (item: T, isSelected: boolean) => React.ReactNode
  width?: string // default 'w-72'
  selectedColor?: string // default 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
}

const SuggestionDropdown = forwardRef(
  function SuggestionDropdown<T>(
    {
      items,
      getItemKey,
      onSelect,
      renderItem,
      width = 'w-72',
      selectedColor = 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
    }: SuggestionDropdownProps<T>,
    ref: React.Ref<SuggestionDropdownHandle>,
  ) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const selectedRef = useRef(0)

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) onSelect(item)
      },
      [items, onSelect],
    )

    useEffect(() => {
      setSelectedIndex(0)
      selectedRef.current = 0
    }, [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((idx) => {
            const next = Math.max(0, idx - 1)
            selectedRef.current = next
            return next
          })
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((idx) => {
            const max = Math.max(items.length - 1, 0)
            const next = idx >= max ? max : idx + 1
            selectedRef.current = next
            return next
          })
          return true
        }
        if (event.key === 'Enter') {
          if (items.length === 0) return true // prevent accidental submit
          selectItem(selectedRef.current)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) return null

    return (
      <div
        className={`absolute bottom-full left-0 z-20 mb-2 ${width} overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900`}
      >
        <div className="max-h-56 overflow-y-auto py-1">
          {items.map((item, idx) => {
            const selected = idx === selectedIndex
            return (
              <button
                key={getItemKey(item)}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? selectedColor
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectItem(idx)
                }}
              >
                {renderItem(item, selected)}
              </button>
            )
          })}
        </div>
      </div>
    )
  },
) as <T>(
  props: SuggestionDropdownProps<T> & { ref?: React.Ref<SuggestionDropdownHandle> },
) => React.ReactElement | null

// ---------------------------------------------------------------------------
// Helpers – extract plain text & mention IDs from editor document
// ---------------------------------------------------------------------------

/**
 * Walk the ProseMirror document and produce a plain-text string where each
 * mention node is rendered as `@<id>`.  This keeps the output compatible
 * with the downstream `extractFirstMentionedAgentId` / regex-based consumers.
 */
function getPlainText(editor: Editor): string {
  const { doc } = editor.state
  const lines: string[] = []
  let lineBuf = ''

  doc.descendants((node) => {
    if (node.isText) {
      lineBuf += node.text ?? ''
    } else if (node.type.name === 'mention') {
      const id = node.attrs.id ?? ''
      // Downstream regex `extractFirstMentionedAgentId` requires a space or
      // line-start before `@`.  Ensure we never produce bare `foo@bar`.
      if (id && lineBuf.length > 0 && !/[\s\n]$/.test(lineBuf)) {
        lineBuf += ' '
      }
      lineBuf += `@${id}`
    } else if (node.type.name === 'hardBreak') {
      lineBuf += '\n'
    } else if (node.type.isBlock && lineBuf) {
      lines.push(lineBuf)
      lineBuf = ''
    }
  })
  if (lineBuf) lines.push(lineBuf)
  return lines.join('\n')
}

function getMentionedAgentIds(editor: Editor): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mention') {
      const id: string | undefined = node.attrs.id
      if (id && id !== 'default' && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
  })
  return ids
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentRichInput({
  ariaLabel,
  placeholder,
  disabled = false,
  resetToken = 0,
  agents,
  onSubmit,
  onChange,
  onSearchFiles,
  onSetIsComposing,
  activeAgentId,
  allAgents,
  onSetActiveAgent,
  onCreateAgent,
  onDeleteAgent,
}: AgentRichInputProps) {
  const t = useT()
  const [isFocused, setIsFocused] = useState(false)
  // Agent selector state
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [isCreatingAgent, setIsCreatingAgent] = useState(false)
  const [newAgentInput, setNewAgentInput] = useState('')
  const [agentSelection, setAgentSelection] = useState(0)

  // Suggestion state – driven by tiptap Mention/Suggestion
  const [suggestionItems, setSuggestionItems] = useState<AgentMentionCandidate[]>([])
  const [suggestionCommand, setSuggestionCommand] = useState<((item: { id: string }) => void) | null>(null)
  const suggestionDropdownRef = useRef<SuggestionDropdownHandle>(null)

  // File suggestion state – driven by tiptap FileMention/Suggestion
  const [fileSuggestionItems, setFileSuggestionItems] = useState<FileMentionItem[]>([])
  const [fileSuggestionCommand, setFileSuggestionCommand] = useState<((item: FileMentionItem) => void) | null>(null)
  const fileSuggestionDropdownRef = useRef<SuggestionDropdownHandle>(null)
  // Refs for accessing latest state inside the tiptap suggestion callback (avoids stale closures)
  const fileSuggestionItemsRef = useRef<FileMentionItem[]>([])
  const fileSuggestionCommandRef = useRef<((item: FileMentionItem) => void) | null>(null)
  useEffect(() => { fileSuggestionItemsRef.current = fileSuggestionItems }, [fileSuggestionItems])
  useEffect(() => { fileSuggestionCommandRef.current = fileSuggestionCommand }, [fileSuggestionCommand])

  // Selected files – displayed as tags above the editor, not inline in text
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const selectedFilesRef = useRef<string[]>([])
  useEffect(() => { selectedFilesRef.current = selectedFiles }, [selectedFiles])

  const disabledRef = useRef(disabled)
  const onSubmitRef = useRef(onSubmit)
  const onChangeRef = useRef(onChange)
  const showAgentSelectorRef = useRef(showAgentSelector)
  const agentSelectionRef = useRef(agentSelection)
  const allAgentsRef = useRef(allAgents)
  const agentsRef = useRef(agents)

  // ---- emit value --------------------------------------------------------
  const emitValue = useCallback(
    (editor: Editor) => {
      const text = getPlainText(editor)
      const mentionedAgentIds = getMentionedAgentIds(editor)
      onChangeRef.current({ text, mentionedAgentIds, selectedFiles: selectedFilesRef.current })
    },
    [],
  )

  // ---- ref sync ----------------------------------------------------------
  useEffect(() => { disabledRef.current = disabled }, [disabled])
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { agentsRef.current = agents }, [agents])
  useEffect(() => { showAgentSelectorRef.current = showAgentSelector }, [showAgentSelector])
  useEffect(() => { agentSelectionRef.current = agentSelection }, [agentSelection])
  useEffect(() => { allAgentsRef.current = allAgents }, [allAgents])

  // ---- editor -------------------------------------------------------------
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      History,
      Mention.configure({
        HTMLAttributes: {
          class:
            'inline-flex items-center rounded px-1.5 py-0.5 bg-primary-100 text-primary-800 text-sm font-medium dark:bg-primary-900/60 dark:text-primary-200',
        },
        suggestion: {
          char: '@',
          items: ({ query }) => {
            const q = query.toLowerCase().trim()
            return agentsRef.current
              .filter((a) => a.id !== 'default')
              .filter((a) => {
                if (!q) return true
                const haystack = `${a.id} ${a.name || ''}`.toLowerCase()
                return haystack.includes(q)
              })
              .slice(0, 8)
          },
          render: () => {
            return {
              onStart: (props) => {
                setSuggestionItems(props.items as AgentMentionCandidate[])
                setSuggestionCommand(() => props.command)
              },
              onUpdate: (props) => {
                setSuggestionItems(props.items as AgentMentionCandidate[])
                setSuggestionCommand(() => props.command)
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  setSuggestionItems([])
                  setSuggestionCommand(null)
                  return true
                }
                return suggestionDropdownRef.current?.onKeyDown(props.event) ?? false
              },
              onExit: () => {
                setSuggestionItems([])
                setSuggestionCommand(null)
              },
            }
          },
          command: ({ editor: e, range, props }) => {
            // Insert the mention node at the @trigger range.
            // We explicitly add a trailing space so the user can keep typing
            // after the mention without the cursor sticking to the chip.
            e
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: 'mention',
                  attrs: { id: props.id },
                },
                {
                  type: 'text',
                  text: ' ',
                },
              ])
              .run()
          },
        },
      }),
      ...(onSearchFiles
        ? [
            FileMention.configure({
              onSearch: onSearchFiles,
              render: () => {
                // Track selection index locally so Enter works even when
                // the React dropdown hasn't rendered yet (async items).
                let activeIdx = 0
                // We save the suggestion range + editor so we can delete the
                // `#query` trigger text when a file is selected, without
                // inserting an inline fileMention node.
                let savedRange: { from: number; to: number } | null = null
                let savedEditor: Editor | null = null

                /** Select a file: delete the `#query` trigger text and add the path to selectedFiles. */
                const selectFile = (item: FileMentionItem) => {
                  if (savedRange && savedEditor) {
                    savedEditor.chain().focus().deleteRange(savedRange).run()
                  }
                  setSelectedFiles((prev) => {
                    const next = prev.includes(item.path) ? prev : [...prev, item.path]
                    selectedFilesRef.current = next
                    // Manually emit value since editor onUpdate won't capture selectedFiles change
                    const text = getPlainText(savedEditor!)
                    const mentionedAgentIds = getMentionedAgentIds(savedEditor!)
                    onChangeRef.current({ text, mentionedAgentIds, selectedFiles: next })
                    return next
                  })
                  // Clear suggestion state
                  setFileSuggestionItems([])
                  setFileSuggestionCommand(null)
                  fileSuggestionItemsRef.current = []
                  fileSuggestionCommandRef.current = null
                }

                return {
                  onStart: async (props) => {
                    // items() is async → props.items may be an unresolved Promise
                    const items = await (props.items as Promise<FileMentionItem[]> | FileMentionItem[])
                    setFileSuggestionItems(items as FileMentionItem[])
                    // Save a wrapped command that selects file without inserting inline node
                    setFileSuggestionCommand(() => selectFile)
                    // Sync refs immediately (before next React render) for onKeyDown access
                    fileSuggestionItemsRef.current = items as FileMentionItem[]
                    fileSuggestionCommandRef.current = selectFile
                    activeIdx = 0
                    savedRange = props.range
                    savedEditor = props.editor
                  },
                  onUpdate: async (props) => {
                    const items = await (props.items as Promise<FileMentionItem[]> | FileMentionItem[])
                    setFileSuggestionItems(items as FileMentionItem[])
                    setFileSuggestionCommand(() => selectFile)
                    fileSuggestionItemsRef.current = items as FileMentionItem[]
                    fileSuggestionCommandRef.current = selectFile
                    activeIdx = 0
                    savedRange = props.range
                    savedEditor = props.editor
                  },
                  onKeyDown: (props) => {
                    if (props.event.key === 'Escape') {
                      setFileSuggestionItems([])
                      setFileSuggestionCommand(null)
                      fileSuggestionItemsRef.current = []
                      fileSuggestionCommandRef.current = null
                      return true
                    }
                    // Try delegating to the rendered dropdown first.
                    const dropdownResult = fileSuggestionDropdownRef.current?.onKeyDown(props.event)
                    if (dropdownResult) return true

                    // Fallback: if the dropdown ref is not yet mounted but we
                    // have items, handle navigation / selection ourselves so
                    // that Enter never accidentally submits the message.
                    const items = fileSuggestionItemsRef.current
                    if (items.length === 0) return false

                    if (props.event.key === 'ArrowUp') {
                      activeIdx = Math.max(0, activeIdx - 1)
                      return true
                    }
                    if (props.event.key === 'ArrowDown') {
                      activeIdx = Math.min(items.length - 1, activeIdx + 1)
                      return true
                    }
                    if (props.event.key === 'Enter') {
                      const item = items[activeIdx]
                      if (item) {
                        const cmd = fileSuggestionCommandRef.current
                        if (cmd) cmd(item)
                      }
                      return true // always consume Enter to prevent submit
                    }
                    return false
                  },
                  onExit: () => {
                    setFileSuggestionItems([])
                    setFileSuggestionCommand(null)
                    fileSuggestionItemsRef.current = []
                    fileSuggestionCommandRef.current = null
                  },
                }
              }
            }),
          ]
        : []),
    ],
    editorProps: {
      attributes: {
        'aria-label': ariaLabel || placeholder,
        class:
          'min-h-[44px] max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 outline-none',
      },
      handleKeyDown: (view, event) => {
        if (disabledRef.current) return false
        if (event.isComposing) return false

        // Enter (without Shift) submits the message.
        // Suggestion handles its own Enter, so this only fires when the
        // suggestion popup is closed.
        if (event.key === 'Enter' && !event.shiftKey) {
          // Guard: if the file-mention suggestion popup is showing, block submit.
          // The Suggestion plugin's onKeyDown runs AFTER editorProps.handleKeyDown
          // in ProseMirror, so it never gets a chance to handle Enter.  We must
          // intercept here and delegate to the dropdown's own key handler.
          const fileItems = fileSuggestionItemsRef.current
          if (fileItems.length > 0) {
            // Let the dropdown handle Enter (select current item)
            const handled = fileSuggestionDropdownRef.current?.onKeyDown(event) ?? false
            if (handled) return true
            // Fallback: select first item directly
            const cmd = fileSuggestionCommandRef.current
            if (cmd) {
              cmd(fileItems[0])
              return true
            }
          }
          event.preventDefault()
          onSubmitRef.current()
          return true
        }
        return false
      },
    },
    onCreate: ({ editor: created }) => {
      emitValue(created)
    },
    onUpdate: ({ editor: updated }) => {
      emitValue(updated)
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    editor.commands.clearContent()
    setSelectedFiles([])
    emitValue(editor)
  }, [editor, emitValue, resetToken])

  // ---- IME composition tracking -------------------------------------------
  // Notifies parent (ConversationView) so it can suppress file search
  // during composition — prevents pinyin letters from triggering searches.
  useEffect(() => {
    if (!editor || !onSetIsComposing) return
    const el = editor.view.dom as HTMLElement

    const start = () => onSetIsComposing(true)
    const end = () => onSetIsComposing(false)

    el.addEventListener('compositionstart', start)
    el.addEventListener('compositionend', end)
    return () => {
      el.removeEventListener('compositionstart', start)
      el.removeEventListener('compositionend', end)
    }
  }, [editor, onSetIsComposing])

  // ---- Agent selector handlers -------------------------------------------
  const handleCreateAgent = useCallback(async () => {
    const id = newAgentInput.trim()
    if (!id) return
    const created = await onCreateAgent(id)
    if (!created) return
    await onSetActiveAgent(created.id)
    setNewAgentInput('')
    setIsCreatingAgent(false)
    setShowAgentSelector(false)
  }, [newAgentInput, onCreateAgent, onSetActiveAgent])

  const handleDeleteAgent = useCallback(
    async (agentId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      if (agentId === 'default') return
      if (!window.confirm(`Delete agent "${agentId}"?`)) return
      const success = await onDeleteAgent(agentId)
      if (success) {
        const newAgents = allAgentsRef.current.filter((a) => a.id !== agentId)
        if (agentSelectionRef.current >= newAgents.length) {
          setAgentSelection(Math.max(0, newAgents.length - 1))
        }
      }
    },
    [onDeleteAgent],
  )

  const handleSelectAgent = useCallback(
    async (agentId: string) => {
      await onSetActiveAgent(agentId)
      setShowAgentSelector(false)
    },
    [onSetActiveAgent],
  )

  // Keyboard navigation for agent selector
  useEffect(() => {
    if (!showAgentSelector) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentAgents = allAgentsRef.current
      const currentSelection = agentSelectionRef.current

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAgentSelection((idx) => {
          const max = Math.max(currentAgents.length - 1, 0)
          return idx >= max ? max : idx + 1
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAgentSelection((idx) => Math.max(0, idx - 1))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowAgentSelector(false)
        setIsCreatingAgent(false)
      } else if (e.key === 'Enter' && !isCreatingAgent) {
        e.preventDefault()
        const agent = currentAgents[currentSelection]
        if (agent) {
          void handleSelectAgent(agent.id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAgentSelector, isCreatingAgent, handleSelectAgent])

  // Click outside to close agent selector
  useEffect(() => {
    if (!showAgentSelector) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.agent-selector-dropdown') && !target.closest('.agent-selector-button')) {
        setShowAgentSelector(false)
        setIsCreatingAgent(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAgentSelector])

  const isEmpty = editor ? editor.isEmpty : true
  const showSuggestion = !disabled && suggestionItems.length > 0 && !!suggestionCommand
  const showFileSuggestion = !disabled && fileSuggestionItems.length > 0 && !!fileSuggestionCommand

  return (
    <div className="relative">
      <div className="focus-within:border-primary-400 focus-within:ring-primary-400/20 w-full rounded-xl border border-neutral-300 bg-white px-5 py-4 pr-14 text-sm text-neutral-900 shadow-sm transition-all hover:border-neutral-400 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-500 dark:focus-within:bg-neutral-900 dark:focus-within:border-primary-500">
        {editor && (
          <>
            {selectedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selectedFiles.map((filePath) => (
                  <span
                    key={filePath}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200"
                  >
                    <FileIcon className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="max-w-[200px] truncate">{filePath}</span>
                    <button
                      type="button"
                      className="ml-0.5 rounded p-0.5 hover:bg-sky-200 dark:hover:bg-sky-800"
                      onClick={() => {
                        setSelectedFiles((prev) => {
                          const next = prev.filter((p) => p !== filePath)
                          selectedFilesRef.current = next
                          // Notify parent of selectedFiles change
                          if (editor) {
                            const text = getPlainText(editor)
                            const mentionedAgentIds = getMentionedAgentIds(editor)
                            onChangeRef.current({ text, mentionedAgentIds, selectedFiles: next })
                          }
                          return next
                        })
                      }}
                      aria-label={`Remove ${filePath}`}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <EditorContent editor={editor} />
          </>
        )}
        {!isFocused && isEmpty && (
          <div
            className={`pointer-events-none absolute left-5 pr-16 text-sm text-neutral-400 dark:text-neutral-500 ${selectedFiles.length > 0 ? 'top-12' : 'top-4'}`}
          >
            {placeholder}
          </div>
        )}
      </div>

      {/* Agent selector dropdown - expands downward */}
      {showAgentSelector && (
        <div className="agent-selector-dropdown absolute top-full left-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="max-h-[280px] overflow-y-auto py-1">
            {allAgents.map((agent, idx) => {
              const isActive = agent.id === activeAgentId
              const selected = idx === agentSelection
              return (
                <div
                  key={agent.id}
                  className={`flex items-center gap-2 px-3 py-2 ${
                    selected
                      ? 'bg-primary-50 dark:bg-primary-900/40'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void handleSelectAgent(agent.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={`text-sm font-medium ${
                        isActive
                          ? 'text-primary-700 dark:text-primary-200'
                          : 'text-neutral-700 dark:text-neutral-200'
                      }`}
                    >
                      @{agent.id}
                    </span>
                    {agent.name && agent.name !== agent.id && (
                      <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {agent.name}
                      </span>
                    )}
                  </button>
                  {isActive && (
                    <Check className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                  )}
                  {agent.id !== 'default' && (
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteAgent(agent.id, e)}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-red-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-red-400"
                      title={`Delete ${agent.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Create new agent row */}
          <div className="border-t border-neutral-200 dark:border-neutral-700">
            {isCreatingAgent ? (
              <div className="flex items-center gap-1.5 px-3 py-2">
                <input
                  value={newAgentInput}
                  onChange={(e) => setNewAgentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleCreateAgent()
                    } else if (e.key === 'Escape') {
                      setIsCreatingAgent(false)
                      setNewAgentInput('')
                    }
                  }}
                  placeholder="agent-id"
                  autoFocus
                  className="h-7 flex-1 rounded border border-neutral-300 bg-white px-2 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateAgent()}
                  disabled={!newAgentInput.trim()}
                  className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreatingAgent(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t('agent.createNew')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mention suggestions dropdown – rendered by tiptap suggestion plugin */}
      {showSuggestion && suggestionCommand && (
        <SuggestionDropdown<AgentMentionCandidate>
          ref={suggestionDropdownRef}
          items={suggestionItems}
          getItemKey={(c) => c.id}
          onSelect={(c) => suggestionCommand?.({ id: c.id })}
          renderItem={(candidate, _selected) => (
            <>
              <span className="font-medium">@{candidate.id}</span>
              {candidate.name && candidate.name !== candidate.id && (
                <span className="truncate pl-3 text-xs text-neutral-500 dark:text-neutral-400">
                  {candidate.name}
                </span>
              )}
            </>
          )}
        />
      )}

      {/* File suggestions dropdown – rendered by tiptap fileMention suggestion plugin */}
      {showFileSuggestion && fileSuggestionCommand && (
        <SuggestionDropdown<FileMentionItem>
          ref={fileSuggestionDropdownRef}
          items={fileSuggestionItems}
          getItemKey={(f) => f.path}
          onSelect={(f) => fileSuggestionCommand?.(f)}
          width="w-80"
          selectedColor="bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
          renderItem={(file, _selected) => (
            <>
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{file.name}</div>
                <div className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                  {file.path}
                </div>
              </div>
              {file.extension && (
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  .{file.extension}
                </span>
              )}
            </>
          )}
        />
      )}
    </div>
  )
}
