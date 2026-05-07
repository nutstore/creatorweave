/**
 * ConversationView - pure conversation display and interaction.
 *
 * Components & logic are split into:
 *   - useConversationLogic  — store selectors, effects, handlers
 *   - useInitialMessage     — initial message send-on-mount
 *   - ConversationMessages   — message turn rendering
 *   - ConversationEmptyState — empty conversation placeholder
 *   - AgentDropdown          — agent selector dropdown
 *   - ThinkingDropdown       — thinking mode toggle
 *   - ContextUsageBar        — context window usage display
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Send, StopCircle, ChevronDown } from 'lucide-react'
import { useT } from '@/i18n'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { AgentRichInput } from './AgentRichInput'
import { WorkflowQuickActions } from './WorkflowQuickActions'
import { WorkflowEditorDialog } from './workflow-editor/WorkflowEditorDialog'
import { AgentModeSwitchCompact } from './AgentModeSwitch'
import { useConversationLogic } from './useConversationLogic'
import type { FileMentionItem } from './FileMentionExtension'
import { useInitialMessage } from './useInitialMessage'
import { ConversationMessages } from './ConversationMessages'
import { ConversationEmptyState } from './ConversationEmptyState'
import { AgentDropdown } from './AgentDropdown'
import { ThinkingDropdown } from './ThinkingDropdown'
import { ContextUsageBar } from './ContextUsageBar'

/** Lightweight keyboard shortcut hint shown near the input area */
function ShortcutHint() {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl+'
  return (
    <span className="hidden text-[11px] leading-none text-neutral-400 dark:text-neutral-500 sm:inline-flex sm:items-center sm:gap-1">
      <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-800">
        {mod}K
      </kbd>
      {typeof navigator !== 'undefined' && /zh/i.test(navigator.language) ? '命令面板' : 'Commands'}
    </span>
  )
}

interface ConversationViewProps {
  initialMessage?: string | null
  onInitialMessageConsumed?: () => void
  disabled?: boolean
}

export function ConversationView({
  initialMessage,
  onInitialMessageConsumed,
  disabled = false,
}: ConversationViewProps) {
  const t = useT()
  const [selectedWorkflowTemplateId, setSelectedWorkflowTemplateId] = useState('')
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false)

  const logic = useConversationLogic()
  const {
    input, setInput, setMentionedAgentIds, inputResetToken, messagesEndRef, scrollContainerRef,
    showScrollToBottom, scrollToBottom,
    draftTextToRestore, onDraftRestored,
    allAgents, activeAgentId, setActiveAgent, createAgent, deleteAgent, mentionAgents,
    convId, activeMessages, activeDraftAssistant, activeStreamingState,
    activeWorkflowExecution, conversationError, activeContextWindowUsage,
    isProcessing, status, suggestedFollowUp, workflowTemplates, toolResults,
    streamingState, streamingContentMessage,
    hasApiKey, enableThinking, thinkingLevel, setEnableThinking, setThinkingLevel,
    agentMode, setAgentMode,
    handleSend, handleCancel, handleRunWorkflow, handleRealRunWorkflow,
    handleDeleteAgentLoop, handleEditAndResend, regenerateUserMessage,
    runCustomWorkflowDryRun,
    useConversationStore: convStore,
  } = logic

  // ── File search for # file mention ──
  // isComposing ref is toggled by AgentRichInput via onSetIsComposing callback
  const isComposingRef = useRef(false)
  const searchReqIdRef = useRef(0)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchFiles = useCallback(
    async (query: string): Promise<FileMentionItem[]> => {
      // Guard: skip search while IME is composing (pinyin letters should not trigger search)
      if (isComposingRef.current) return []
      // Monotonic request ID — lets us discard stale results
      const reqId = ++searchReqIdRef.current

      try {
        // --- Remote/Host mode: use fileTree from remote store ---
        const { useRemoteStore } = await import('@/store/remote.store')
        const remoteStore = useRemoteStore.getState()
        const fileTree = remoteStore.fileTree

        if (fileTree) {
          // Empty query → show project root entries as a quick pick
          if (!query.trim()) {
            const rootEntries = (fileTree.children ?? [])
              .slice(0, 10)
            if (reqId !== searchReqIdRef.current) return []
            return rootEntries.map((c: any) => ({
              path: c.path,
              name: c.name,
              extension: c.extension,
              isDirectory: c.type === 'directory',
            }))
          }

          const { fileDiscoveryService } = await import('@/services/file-discovery.service')
          const results = await fileDiscoveryService.search(query, [fileTree], { limit: 10 })
          if (reqId !== searchReqIdRef.current) return []
          return results
            .map((r) => ({ path: r.path, name: r.name, extension: r.extension, isDirectory: r.type === 'directory' }))
        }

        // --- Local mode: use shared file path cache from folder-access.store ---
        const { useFolderAccessStore } = await import('@/store/folder-access.store')
        let allPaths = await useFolderAccessStore.getState().ensureFilePaths()

        if (reqId !== searchReqIdRef.current) return []

        // Merge OPFS cachedPaths for pending files not yet on disk
        const { useOPFSStore } = await import('@/store/opfs.store')
        const opfsCached = useOPFSStore.getState().cachedPaths
        if (opfsCached.length > 0) {
          const existing = new Set(allPaths)
          for (const p of opfsCached) {
            if (!existing.has(p)) allPaths.push(p)
          }
        }

        if (reqId !== searchReqIdRef.current) return []

        // Build FileMentionItem list from paths
        const toItems = (paths: string[]): FileMentionItem[] =>
          paths.map((p) => {
            const name = p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p
            const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : undefined
            // A path with no extension or ending with a segment that has no dot is likely a directory
            const isDirectory = !name.includes('.')
            return { path: p, name, extension: ext, isDirectory }
          })

        // Empty query → show root-level entries (paths without '/' separator)
        if (!query.trim()) {
          return toItems(allPaths.filter((p) => !p.includes('/')).slice(0, 10))
        }

        // Simple fuzzy match
        const q = query.toLowerCase()
        return toItems(
          allPaths
            .filter((p) => p.toLowerCase().includes(q))
            .slice(0, 10),
        )
      } catch (err) {
        console.warn('[handleSearchFiles] error:', err)
        return []
      }
    },
    [],
  )

  /** Debounced wrapper — 200ms delay to avoid hammering search on every keystroke. */
  const debouncedSearchFiles = useCallback(
    (query: string): Promise<FileMentionItem[]> => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
      return new Promise<FileMentionItem[]>((resolve) => {
        searchTimerRef.current = setTimeout(() => {
          handleSearchFiles(query).then(resolve)
        }, 200)
      })
    },
    [handleSearchFiles],
  )

  const setIsComposing = useCallback(
    (v: boolean) => { isComposingRef.current = v },
    [],
  )

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  // ── Initial message handling ──
  useInitialMessage({
    initialMessage,
    convId,
    isRunning: logic.isRunning,
    sendMessage: logic.sendMessage,
    onConsumed: onInitialMessageConsumed,
  })

  // ── Workflow template selection sync ──
  useEffect(() => {
    if (workflowTemplates.length === 0) {
      if (selectedWorkflowTemplateId) setSelectedWorkflowTemplateId('')
      return
    }
    if (!workflowTemplates.some((t) => t.id === selectedWorkflowTemplateId)) {
      setSelectedWorkflowTemplateId(workflowTemplates[0].id)
    }
  }, [workflowTemplates, selectedWorkflowTemplateId])

  // ── Derived: isWaitingForModel ──
  const isWaitingForModel =
    status === 'pending' ||
    (status === 'tool_calling' &&
      !activeStreamingState?.currentToolCall &&
      (activeStreamingState?.activeToolCalls?.length || 0) === 0)

  return (
    <ErrorBoundary
      onError={(error) => {
        console.error('[ConversationView] Error:', error)
        if (convId) {
          const { resetConversationState } = convStore.getState()
          resetConversationState(convId)
        }
      }}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white dark:bg-neutral-950">
        {/* Messages area */}
        <div className="relative min-h-0 flex-1">
          <div ref={scrollContainerRef} className="custom-scrollbar absolute inset-0 overflow-y-auto">
          {activeMessages.length === 0 && !isProcessing ? (
            <ConversationEmptyState />
          ) : (
            <ConversationMessages
              activeMessages={activeMessages}
              toolResults={toolResults}
              isProcessing={isProcessing}
              isWaitingForModel={isWaitingForModel}
              streamingState={streamingState}
              streamingContentMessage={streamingContentMessage}
              activeDraftAssistant={activeDraftAssistant}
              activeStreamingState={activeStreamingState}
              activeWorkflowExecution={activeWorkflowExecution}
              status={status}
              onDeleteAgentLoop={handleDeleteAgentLoop}
              onEditAndResend={handleEditAndResend}
              onRegenerate={
                convId ? (id: string) => regenerateUserMessage(convId, id) : undefined
              }
              onCancel={handleCancel}
              messagesEndRef={messagesEndRef}
              conversationId={convId}
            />
          )}
        </div>

        {/* Scroll-to-bottom floating button */}
        {showScrollToBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 rounded-full bg-neutral-800/70 p-2 text-white shadow-lg backdrop-blur-sm transition-opacity hover:bg-neutral-700/80 dark:bg-neutral-200/70 dark:text-neutral-900 dark:hover:bg-neutral-200/90"
            title={t('conversation.buttons.scrollToBottom')}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

        {conversationError && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <div className="mx-auto max-w-3xl">
              <span className="font-medium">{t('conversation.error.requestFailed')}</span>
              <span>{conversationError}</span>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-3xl flex-col">
            <div className="relative">
              <AgentRichInput
                key={convId ?? 'new'}
                placeholder={
                  suggestedFollowUp ||
                  (hasApiKey ? t('conversation.input.placeholder') : t('conversation.input.placeholderNoKey'))
                }
                ariaLabel={t('conversation.input.ariaLabel')}
                disabled={isProcessing || !hasApiKey || disabled}
                resetToken={inputResetToken}
                initialText={draftTextToRestore ?? undefined}
                onDraftRestored={onDraftRestored}
                agents={mentionAgents}
                onSearchFiles={debouncedSearchFiles}
                onSetIsComposing={setIsComposing}
                activeAgentId={activeAgentId}
                allAgents={allAgents}
                onSetActiveAgent={setActiveAgent}
                onCreateAgent={createAgent}
                onDeleteAgent={deleteAgent}
                onChange={({ text, mentionedAgentIds: ids }) => {
                  setInput(text)
                  setMentionedAgentIds(ids)
                }}
                onSubmit={handleSend}
              />
              {isProcessing ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="absolute bottom-4 right-4 rounded-xl bg-red-500 p-2 text-white shadow-sm transition-colors hover:bg-red-600"
                  title={t('conversation.buttons.stop')}
                >
                  <StopCircle className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={(!input.trim() && !suggestedFollowUp) || !hasApiKey || disabled}
                  className="absolute bottom-4 right-4 rounded-xl bg-primary-600 p-2 text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-30 disabled:hover:bg-primary-600"
                  title={t('conversation.buttons.send')}
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Compact toolbar row */}
          <div className="mx-auto mt-2 flex max-w-3xl flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 pt-0.5 sm:flex-nowrap sm:pt-0">
              <AgentDropdown
                allAgents={allAgents}
                activeAgentId={activeAgentId}
                setActiveAgent={setActiveAgent}
                createAgent={createAgent}
                deleteAgent={deleteAgent}
              />
              <ThinkingDropdown
                enableThinking={enableThinking}
                thinkingLevel={thinkingLevel}
                setEnableThinking={setEnableThinking}
                setThinkingLevel={setThinkingLevel}
              />
              <WorkflowQuickActions
                templates={workflowTemplates}
                selectedTemplateId={selectedWorkflowTemplateId}
                disabled={isProcessing}
                onTemplateChange={setSelectedWorkflowTemplateId}
                onRun={(id, dsl) => void handleRunWorkflow(id, dsl)}
                onRealRun={(id, dsl) => void handleRealRunWorkflow(id, dsl)}
                onOpenEditor={() => setWorkflowEditorOpen(true)}
              />
              <AgentModeSwitchCompact mode={agentMode} onModeChange={setAgentMode} disabled={isProcessing} />
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <ShortcutHint />
              <ContextUsageBar contextWindowUsage={activeContextWindowUsage} isProcessing={isProcessing} />
            </div>
          </div>
        </div>
      </div>

      <WorkflowEditorDialog
        open={workflowEditorOpen}
        onOpenChange={setWorkflowEditorOpen}
        initialTemplateId={selectedWorkflowTemplateId}
        onRunDryRun={(template) => {
          void runCustomWorkflowDryRun(convId, template)
          setSelectedWorkflowTemplateId(template.id)
          setWorkflowEditorOpen(false)
        }}
      />
    </ErrorBoundary>
  )
}
