/**
 * Pending Question Store — bridges ask_user_question executor (Promise)
 * with the UI (QuestionCard component).
 *
 * Flow:
 * 1. Executor calls context.askUserQuestion() → creates Promise, stores resolver
 * 2. UI (QuestionCard) reads pending question from this store
 * 3. User clicks answer → UI calls resolve() → executor unblocks
 *
 * This is intentionally kept as a simple module-level map (not Zustand)
 * because it's a runtime bridge that shouldn't be persisted.
 */

export interface PendingQuestion {
  /** The conversation ID this question belongs to */
  conversationId: string
  /** The tool call ID that triggered this question */
  toolCallId: string
  /** The question text */
  question: string
  /** Question type */
  type: 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text'
  /** Options for choice types */
  options?: Array<string | { label: string; description?: string; recommended?: boolean }>
  /** Default answer */
  defaultAnswer?: string
  /** Additional context */
  context?: {
    affected_files?: string[]
    preview?: string
  }
  /** Resolve the pending question with the user's answer */
  resolve: (result: { answer: string; confirmed: boolean; timed_out: boolean }) => void
}

/**
 * Map from `${conversationId}::${toolCallId}` to PendingQuestion.
 * Uses composite key because a conversation may have multiple pending questions
 * (though typically only one at a time).
 */
const pendingQuestions = new Map<string, PendingQuestion>()

function makeKey(conversationId: string, toolCallId: string): string {
  return `${conversationId}::${toolCallId}`
}

/** Register a pending question (called by the executor) */
export function setPendingQuestion(question: PendingQuestion): void {
  pendingQuestions.set(makeKey(question.conversationId, question.toolCallId), question)
}

/** Get the pending question for a given tool call (called by UI) */
export function getPendingQuestion(
  conversationId: string,
  toolCallId: string
): PendingQuestion | undefined {
  return pendingQuestions.get(makeKey(conversationId, toolCallId))
}

/** Remove a pending question after it's resolved */
export function removePendingQuestion(conversationId: string, toolCallId: string): void {
  pendingQuestions.delete(makeKey(conversationId, toolCallId))
}

/** Get all pending questions for a conversation */
export function getPendingQuestionsForConversation(
  conversationId: string
): PendingQuestion[] {
  const results: PendingQuestion[] = []
  for (const [, q] of pendingQuestions) {
    if (q.conversationId === conversationId) {
      results.push(q)
    }
  }
  return results
}

/** Clear all pending questions for a conversation (e.g. on cancel) */
export function clearPendingQuestions(conversationId: string): void {
  for (const [key, q] of pendingQuestions) {
    if (q.conversationId === conversationId) {
      // Resolve with cancelled to unblock any waiting executors
      q.resolve({ answer: q.defaultAnswer ?? 'cancelled', confirmed: false, timed_out: false })
      pendingQuestions.delete(key)
    }
  }
}
