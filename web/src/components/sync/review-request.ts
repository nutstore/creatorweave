import { createUserMessage } from '@/agent/message-types'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { getActiveConversation } from '@/store/conversation-context.store'
import { isImageFile, readFileFromNativeFS, readFileFromOPFS } from '@/opfs'
import type { FileChange } from '@/opfs/types/opfs-types'
import { buildCommitSummaryDiffSections } from '@/workers/commit-summary-worker-manager'

function buildReviewPrompt(changeCount: number, changesText: string, diffSections: string[]): string {
  return [
    'Please review the following code/file changes.',
    'Output requirements:',
    '1) Findings first, ordered by severity (High/Medium/Low).',
    '2) For each finding, include file path and concrete reason.',
    '3) Then provide a short fix plan.',
    '4) If no major issue, explicitly say "No blocking issues found".',
    '5) Keep it concise and avoid repeating raw diff.',
    '',
    `Changed files: ${changeCount}`,
    changesText,
    '',
    ...(diffSections.length > 0
      ? ['Key diff snippets:', diffSections.join('\n\n')]
      : ['Key diff snippets:', '[diff unavailable; review from file list only]']),
  ].join('\n')
}

async function buildReviewMessage(changes: FileChange[]): Promise<string> {
  const activeConversation = await getActiveConversation()
  if (!activeConversation) {
    throw new Error('当前没有可用工作区')
  }

  const { conversation, conversationId } = activeConversation
  const nativeDir = await conversation.getNativeDirectoryHandle()

  const changesText = changes
    .slice(0, 30)
    .map((c) => `- ${c.type}: ${c.path}`)
    .join('\n')

  const diffInputs: Array<{
    path: string
    beforeText: string
    afterText: string
    isBinary?: boolean
  }> = []

  for (const change of changes.slice(0, 10)) {
    if (isImageFile(change.path)) {
      diffInputs.push({
        path: change.path,
        beforeText: '',
        afterText: '',
        isBinary: true,
      })
      continue
    }

    let beforeText = ''
    let afterText = ''
    if (change.type !== 'add' && nativeDir) {
      const text = await readFileFromNativeFS(nativeDir, change.path)
      beforeText = text ?? ''
    }
    if (change.type !== 'delete') {
      const text = await readFileFromOPFS(conversationId, change.path)
      afterText = text ?? ''
    }

    diffInputs.push({
      path: change.path,
      beforeText: beforeText.slice(0, 2400),
      afterText: afterText.slice(0, 2400),
    })
  }

  let diffSections: string[] = []
  try {
    diffSections = await buildCommitSummaryDiffSections(diffInputs, {
      timeoutMs: 2500,
      maxOutputLines: 110,
      contextLines: 2,
      maxNoChangeLines: 20,
    })
  } catch {
    diffSections = []
  }

  return buildReviewPrompt(changes.length, changesText, diffSections)
}

export async function sendChangeReviewToConversation(changes: FileChange[]): Promise<void> {
  if (changes.length === 0) {
    throw new Error('没有可审阅的变更')
  }

  const settings = useSettingsStore.getState()
  if (!settings.hasApiKey) {
    throw new Error('请先配置 API Key')
  }

  const conversationStore = useConversationStore.getState()
  const { directoryHandle } = useAgentStore.getState()

  let targetConvId = conversationStore.activeConversationId
  if (!targetConvId) {
    const conv = conversationStore.createNew('变更审阅')
    targetConvId = conv.id
    await conversationStore.setActive(targetConvId)
  }

  if (conversationStore.isConversationRunning(targetConvId)) {
    throw new Error('当前会话正在运行，请稍后再试')
  }

  const reviewMessage = await buildReviewMessage(changes)
  const userMessage = createUserMessage(reviewMessage)
  const currentConv = useConversationStore
    .getState()
    .conversations.find((c) => c.id === targetConvId)
  const currentMessages = currentConv ? [...currentConv.messages, userMessage] : [userMessage]
  conversationStore.updateMessages(targetConvId, currentMessages)

  await conversationStore.runAgent(
    targetConvId,
    settings.providerType,
    settings.modelName,
    settings.maxTokens,
    directoryHandle
  )
}
