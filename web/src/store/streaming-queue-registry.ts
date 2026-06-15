/**
 * StreamingQueue registry — module-level Map<conversationId, {reasoning, content}>.
 *
 * Mirrors `agent-loop-registry.ts` for the same reason: `StreamingQueue` is a
 * service object (private fields `buffer`, `rafId`, `callback`, `isScheduled`,
 * …) with no business being inside an immer-drafted Map. Putting it in store
 * state surfaces `WritableNonArrayDraft<StreamingQueue>` errors and is
 * architecturally wrong — these are RAF-batched writers, not serializable data.
 *
 * Lifetime is bounded by the conversation: created when a run starts, removed
 * (and `.destroy()` called on each queue) when the run ends or the
 * conversation is deleted.
 */

import type { StreamingQueue } from '../utils/streaming-queue'

export interface StreamingQueuePair {
  reasoning: StreamingQueue
  content: StreamingQueue
}

const streamingQueues = new Map<string, StreamingQueuePair>()

/** Register a pair of streaming queues for a conversation. */
export function setStreamingQueues(convId: string, queues: StreamingQueuePair): void {
  streamingQueues.set(convId, queues)
}

/** Look up the streaming queues for a conversation, if any. */
export function getStreamingQueues(convId: string): StreamingQueuePair | undefined {
  return streamingQueues.get(convId)
}

/**
 * Remove the queues from the registry and return them. The caller is
 * responsible for calling `.destroy()` on each queue if they should be torn
 * down.
 */
export function deleteStreamingQueues(convId: string): StreamingQueuePair | undefined {
  const pair = streamingQueues.get(convId)
  streamingQueues.delete(convId)
  return pair
}

/** Test-only: drop every entry. Production code should never need this. */
export function clearStreamingQueues(): void {
  streamingQueues.clear()
}
