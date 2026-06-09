/**
 * TTS Auto-Play Queue — singleton manager for automatic TTS playback.
 *
 * Design:
 * - Queue capacity > 1: messages accumulate and play sequentially
 * - Only plays for the active workspace (conversationId === activeWorkspaceId)
 * - Switching workspace → flush queue + stop current
 * - User sends new message in same workspace → stop current, clear queue
 *   (new reply will enqueue itself when complete)
 *
 * Usage:
 *   // When an assistant turn finishes:
 *   ttsQueue.enqueue(conversationId, content, voice)
 *
 *   // When user sends a new message:
 *   ttsQueue.interrupt(conversationId)
 *
 *   // When workspace switches:
 *   ttsQueue.flush()
 */

import removeMarkdown from 'remove-markdown'

// ── Lazy store imports (avoid circular deps) ─────────────────────────

// Lazy module references — resolved on first call, not at import time
let _workspaceStore: typeof import('@/store/workspace.store') | undefined
let _settingsStore: typeof import('@/store/settings.store') | undefined

async function ensureStores(): Promise<void> {
  if (!_workspaceStore) _workspaceStore = await import('@/store/workspace.store')
  if (!_settingsStore) _settingsStore = await import('@/store/settings.store')
}

function getActiveWorkspaceId(): string | null {
  return _workspaceStore?.useWorkspaceStore.getState().activeWorkspaceId ?? null
}

function getTTSSettings(): { enableTTS: boolean; autoPlayTTS: boolean } {
  return _settingsStore?.useSettingsStore.getState() ?? { enableTTS: false, autoPlayTTS: false }
}

// ── Types ────────────────────────────────────────────────────────────

interface TTSQueueItem {
  conversationId: string
  plainText: string
  voice: string
  /** Unique ID for dedup (e.g. message ID or timestamp) */
  key: string
}

type QueueState = 'idle' | 'playing'

// ── Singleton ────────────────────────────────────────────────────────

class TTSAutoPlayQueue {
  private queue: TTSQueueItem[] = []
  private state: QueueState = 'idle'
  private currentKey: string | null = null
  private _onStateChange?: (state: QueueState, queueLength: number) => void
  /** Keys already enqueued (prevents duplicate enqueue of same message) */
  private seenKeys = new Set<string>()
  /** Abort controller for cancelling in-flight playNext() */
  private _abortController: AbortController | null = null
  /** Resolve function for the audio-ended promise, so stopAudio can unblock it */
  private _audioEndResolve: (() => void) | null = null

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Enqueue a completed assistant message for auto-play.
   * Only enqueues if the conversation is the active workspace.
   * Deduplicates by key (same key won't be enqueued twice).
   */
  enqueue(
    conversationId: string,
    content: string,
    voice: string,
    key: string,
  ): void {
    // Skip if already enqueued or currently playing this key
    if (this.seenKeys.has(key)) return

    // Ensure stores are loaded before checking
    if (!_workspaceStore || !_settingsStore) {
      // Stores not loaded yet — schedule async init and retry
      ensureStores().then(() => this.enqueue(conversationId, content, voice, key))
      return
    }

    // Check active workspace
    const activeWorkspaceId = getActiveWorkspaceId()
    if (activeWorkspaceId !== conversationId) return

    // Check if TTS is enabled and autoPlay is on
    const { enableTTS, autoPlayTTS } = getTTSSettings()
    if (!enableTTS || !autoPlayTTS) return

    // Strip markdown
    const plainText = removeMarkdown(content).trim()
    if (!plainText) return

    this.seenKeys.add(key)
    this.queue.push({ conversationId, plainText, voice, key })

    // If idle, start playing
    if (this.state === 'idle') {
      this.playNext()
    }

    this.notifyStateChange()
  }

  /**
   * Interrupt: stop current playback and clear queue for this conversation.
   * Called when user sends a new message.
   */
  interrupt(conversationId: string): void {
    // Only interrupt if the playing item belongs to this conversation
    const currentIdx = this.queue.findIndex(
      (item) => item.conversationId === conversationId
    )

    // Stop audio
    this.stopAudio()

    // Remove all items for this conversation from queue
    this.queue = this.queue.filter(
      (item) => item.conversationId !== conversationId
    )

    this.state = 'idle'
    this.currentKey = null
    this.notifyStateChange()

    // If queue still has items from other conversations (shouldn't normally happen),
    // play next
    if (this.queue.length > 0) {
      this.playNext()
    }
  }

  /**
   * Flush: stop everything and clear entire queue.
   * Called when workspace switches.
   */
  flush(): void {
    this.stopAudio()
    this.queue = []
    this.seenKeys.clear()
    this.state = 'idle'
    this.currentKey = null
    this.notifyStateChange()
  }

  /**
   * Clear seen keys for a specific conversation (e.g. on new conversation load).
   */
  resetConversation(conversationId: string): void {
    for (const key of this.seenKeys) {
      // Keys are prefixed with conversationId, so we can filter
      if (key.startsWith(conversationId + ':')) {
        this.seenKeys.delete(key)
      }
    }
  }

  /** Get current state for UI display */
  getState(): { state: QueueState; queueLength: number; currentKey: string | null } {
    return {
      state: this.state,
      queueLength: this.queue.length,
      currentKey: this.currentKey,
    }
  }

  /** Register a state change callback (for React re-renders) */
  onStateChange(cb: (state: QueueState, queueLength: number) => void): void {
    this._onStateChange = cb
  }

  // ── Internal ─────────────────────────────────────────────────────

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.state = 'idle'
      this.currentKey = null
      this.notifyStateChange()
      return
    }

    // Re-check active workspace before playing
    const activeWorkspaceId = getActiveWorkspaceId()

    // Find first item matching active workspace
    const idx = this.queue.findIndex(
      (item) => item.conversationId === activeWorkspaceId
    )

    if (idx === -1) {
      // No items for active workspace; discard non-active items and stay idle
      this.queue = []
      this.state = 'idle'
      this.currentKey = null
      this.notifyStateChange()
      return
    }

    const item = this.queue.splice(idx, 1)[0]
    this.state = 'playing'
    this.currentKey = item.key
    this.notifyStateChange()

    // Create abort controller for this playback session
    const abortController = new AbortController()
    this._abortController = abortController

    try {
      const bridge = (window as any).__agentWeb
      if (!bridge?.ttsPlay) {
        // Bridge not available (extension not installed)
        if (abortController.signal.aborted) return
        this.state = 'idle'
        this.currentKey = null
        this.notifyStateChange()
        this.playNext() // Try next in queue
        return
      }

      const result = await bridge.ttsPlay(item.plainText, {
        voice: item.voice || 'zh-CN-XiaoxiaoNeural',
      })

      // Check if aborted during synthesis
      if (abortController.signal.aborted) return

      if (result?.ok && result?.playing) {
        const audio = (window as any).__ttsAudio as HTMLAudioElement | undefined
        if (audio) {
          await new Promise<void>((resolve) => {
            // Store resolver so stopAudio() can unblock us
            this._audioEndResolve = resolve

            const cleanup = () => {
              audio.removeEventListener('ended', onEnd)
              audio.removeEventListener('error', onError)
              abortController.signal.removeEventListener('abort', onAbort)
              this._audioEndResolve = null
            }

            const onEnd = () => { cleanup(); resolve() }
            const onError = () => { cleanup(); resolve() }
            const onAbort = () => { cleanup(); resolve() }

            audio.addEventListener('ended', onEnd)
            audio.addEventListener('error', onError)
            abortController.signal.addEventListener('abort', onAbort)
          })
        }
      }

      // Check again after audio finishes — don't advance if aborted
      if (abortController.signal.aborted) return

    } catch (err) {
      console.error('[TTSQueue] Playback failed:', err)
      if (abortController.signal.aborted) return
    }

    this.state = 'idle'
    this.currentKey = null
    this.notifyStateChange()

    // Play next in queue
    this.playNext()
  }

  private stopAudio(): void {
    // Abort any in-flight playNext() — unblocks the synthesis await and the audio-ended promise
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }

    // Also resolve the audio-ended promise directly as a safety net
    if (this._audioEndResolve) {
      this._audioEndResolve()
      this._audioEndResolve = null
    }

    try {
      const bridge = (window as any).__agentWeb
      bridge?.ttsStop?.()
    } catch {
      // ignore
    }
    // Also directly stop the audio element as a fallback
    try {
      const audio = (window as any).__ttsAudio as HTMLAudioElement | undefined
      if (audio) {
        audio.pause()
        audio.src = ''
      }
    } catch {
      // ignore
    }
  }

  private notifyStateChange(): void {
    this._onStateChange?.(this.state, this.queue.length)
  }

  /**
   * Subscribe to workspace store changes to auto-flush on switch.
   * Called once at module init.
   */
  async subscribeToWorkspaceChanges(): Promise<void> {
    try {
      await ensureStores()
      const useWorkspaceStore = _workspaceStore!.useWorkspaceStore
      let lastActiveId = useWorkspaceStore.getState().activeWorkspaceId
      useWorkspaceStore.subscribe((state: { activeWorkspaceId: string | null }) => {
        if (state.activeWorkspaceId !== lastActiveId) {
          lastActiveId = state.activeWorkspaceId
          this.flush()
        }
      })
    } catch {
      // Store not available yet (e.g. during SSR or tests)
    }
  }
}

// ── Export singleton ──────────────────────────────────────────────────

export const ttsQueue = new TTSAutoPlayQueue()

// Auto-subscribe to workspace changes on first import
ttsQueue.subscribeToWorkspaceChanges()

export type { QueueState as TTSQueueState }
