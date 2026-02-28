/* eslint-disable react-refresh/only-export-components */
/**
 * Example usage of conversation threading feature
 *
 * This demonstrates how to use the threading functionality in your components
 */

import { useConversationStore } from '@/store/conversation.store'
import { useState } from 'react'

export function ThreadManagementExample({ conversationId }: { conversationId: string }) {
  const {
    createThread,
    forkThread,
    mergeThreads,
    deleteThread,
    navigateToNextThread,
    navigateToPreviousThread,
    getActiveThreadId,
  } = useConversationStore()

  const [selectedMessageId] = useState<string | null>(null)

  // Example: Create a new thread from a message
  const handleCreateThread = () => {
    if (selectedMessageId) {
      createThread(conversationId, selectedMessageId, 'Custom Thread Title')
      console.log('Thread created successfully')
    }
  }

  // Example: Fork a thread at a specific message
  const handleForkThread = () => {
    if (selectedMessageId) {
      forkThread(conversationId, selectedMessageId, 'Forked Thread')
      console.log('Thread forked successfully')
    }
  }

  // Example: Navigate between threads
  const handleNavigateNext = () => {
    const nextThreadId = navigateToNextThread(conversationId)
    if (nextThreadId) {
      console.log('Navigated to thread:', nextThreadId)
    }
  }

  const handleNavigatePrevious = () => {
    const prevThreadId = navigateToPreviousThread(conversationId)
    if (prevThreadId) {
      console.log('Navigated to thread:', prevThreadId)
    }
  }

  // Example: Merge two threads
  const handleMergeThreads = (sourceThreadId: string, targetThreadId: string) => {
    mergeThreads(conversationId, sourceThreadId, targetThreadId)
    console.log('Threads merged successfully')
  }

  // Example: Delete a thread
  const handleDeleteThread = (threadId: string) => {
    deleteThread(conversationId, threadId)
    console.log('Thread deleted successfully')
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold">Thread Management Example</h2>

      {/* Thread creation */}
      <div className="mb-4 space-y-2">
        <h3 className="font-medium">Create Thread</h3>
        <p className="text-sm text-neutral-600">Select a message and create a thread from it</p>
        <button
          onClick={handleCreateThread}
          disabled={!selectedMessageId}
          className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
        >
          Create Thread from Message
        </button>
      </div>

      {/* Thread forking */}
      <div className="mb-4 space-y-2">
        <h3 className="font-medium">Fork Thread</h3>
        <p className="text-sm text-neutral-600">Create a branch from a specific message</p>
        <button
          onClick={handleForkThread}
          disabled={!selectedMessageId}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Fork Thread at Message
        </button>
      </div>

      {/* Thread navigation */}
      <div className="mb-4 space-y-2">
        <h3 className="font-medium">Navigate Threads</h3>
        <p className="text-sm text-neutral-600">Navigate between threads in the conversation</p>
        <div className="flex gap-2">
          <button
            onClick={handleNavigatePrevious}
            className="rounded-lg bg-neutral-200 px-4 py-2 hover:bg-neutral-300"
          >
            Previous Thread
          </button>
          <button
            onClick={handleNavigateNext}
            className="rounded-lg bg-neutral-200 px-4 py-2 hover:bg-neutral-300"
          >
            Next Thread
          </button>
        </div>
        <p className="text-sm text-neutral-600">
          Active Thread: {getActiveThreadId(conversationId) || 'None'}
        </p>
      </div>

      {/* Thread merging and deletion */}
      <div className="space-y-2">
        <h3 className="font-medium">Advanced Operations</h3>
        <p className="text-sm text-neutral-600">Merge or delete threads (requires thread IDs)</p>
        <button
          onClick={() => handleMergeThreads('thread-1', 'thread-2')}
          className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
        >
          Merge Threads (Example)
        </button>
        <button
          onClick={() => handleDeleteThread('thread-1')}
          className="ml-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          Delete Thread (Example)
        </button>
      </div>
    </div>
  )
}

/**
 * Programmatic usage examples
 */

// Example 1: Automatically create threads for different topics
export function autoOrganizeConversation(conversationId: string) {
  const { createThread } = useConversationStore.getState()
  const conversations = useConversationStore.getState().conversations
  const conversation = conversations.find((c) => c.id === conversationId)

  if (!conversation) return

  // Find messages about "bug fixes" and create a thread
  const bugFixMessages = conversation.messages.filter((m) =>
    m.content?.toLowerCase().includes('bug')
  )

  if (bugFixMessages.length > 0) {
    createThread(conversationId, bugFixMessages[0].id, 'Bug Fixes')
  }

  // Find messages about "features" and create a thread
  const featureMessages = conversation.messages.filter((m) =>
    m.content?.toLowerCase().includes('feature')
  )

  if (featureMessages.length > 0) {
    createThread(conversationId, featureMessages[0].id, 'Feature Requests')
  }
}

// Example 2: Create branches for different solutions
export function exploreAlternatives(conversationId: string, messageId: string) {
  const { forkThread } = useConversationStore.getState()

  // Create multiple branches to explore different approaches
  forkThread(conversationId, messageId, 'Approach 1: Direct Solution')
  forkThread(conversationId, messageId, 'Approach 2: Refactored Solution')
  forkThread(conversationId, messageId, 'Approach 3: Alternative Method')
}

// Example 3: Clean up threads by merging related ones
export function consolidateThreads(
  conversationId: string,
  threadIds: string[],
  targetThreadId: string
) {
  const { mergeThreads } = useConversationStore.getState()

  // Merge all specified threads into target thread
  for (const threadId of threadIds) {
    if (threadId !== targetThreadId) {
      mergeThreads(conversationId, threadId, targetThreadId)
    }
  }
}
