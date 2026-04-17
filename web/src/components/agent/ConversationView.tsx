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

import { useState, useEffect } from 'react'
import { Send, StopCircle } from 'lucide-react'
import { useT } from '@/i18n'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import { AgentRichInput } from './AgentRichInput'
import { WorkflowQuickActions } from './WorkflowQuickActions'
import { WorkflowEditorDialog } from './workflow-editor/WorkflowEditorDialog'
import { AgentModeSwitchCompact } from './AgentModeSwitch'
import { useConversationLogic } from './useConversationLogic'
import { useInitialMessage } from './useInitialMessage'
import { ConversationMessages } from './ConversationMessages'
import { ConversationEmptyState } from './ConversationEmptyState'
import { AgentDropdown } from './AgentDropdown'
import { ThinkingDropdown } from './ThinkingDropdown'
import { ContextUsageBar } from './ContextUsageBar'

interface ConversationViewProps {
  initialMessage?: string | null
  onInitialMessageConsumed?: () => void
}

export function ConversationView({
  initialMessage,
  onInitialMessageConsumed,
}: ConversationViewProps) {
  const t = useT()
  const [selectedWorkflowTemplateId, setSelectedWorkflowTemplateId] = useState('')
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false)

  const logic = useConversationLogic()
  const {
    input, setInput, mentionedAgentIds, setMentionedAgentIds, inputResetToken, messagesEndRef,
    allAgents, activeAgentId, setActiveAgent, createAgent, deleteAgent, mentionAgents,
    convId, activeMessages, activeDraftAssistant, activeStreamingState,
    activeWorkflowExecution, conversationError, activeContextWindowUsage,
    isProcessing, status, suggestedFollowUp, workflowTemplates, toolResults,
    streamingState, streamingContentMessage,
    hasApiKey, enableThinking, thinkingLevel, setEnableThinking, setThinkingLevel,
    agentMode, setAgentMode,
    handleSend, handleCancel, handleRunWorkflow, handleRealRunWorkflow,
    handleDeleteAgentLoop, handleEditAndResend, regenerateUserMessage,
    clearSuggestedFollowUp, runCustomWorkflowDryRun,
    useConversationStore: convStore,
  } = logic

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
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
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
            />
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
                placeholder={
                  suggestedFollowUp ||
                  (hasApiKey ? t('conversation.input.placeholder') : t('conversation.input.placeholderNoKey'))
                }
                ariaLabel={t('conversation.input.ariaLabel')}
                disabled={isProcessing || !hasApiKey}
                resetToken={inputResetToken}
                agents={mentionAgents}
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
                  disabled={(!input.trim() && !suggestedFollowUp) || !hasApiKey}
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
            <div className="self-start sm:self-auto">
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
