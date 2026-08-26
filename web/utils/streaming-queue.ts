/**
 * Streaming Queue - Batch process streaming updates using RAF to avoid UI lag
 * from frequent store updates.
 *
 * Core concepts:
 * 1. Decouple network streaming (high frequency) from visual updates (60fps)
 * 2. Accumulate deltas in a buffer, update in RAF callback batches
 * 3. Update state once per frame instead of once per delta
 *
 * Reference: Upstash - Smooth Text Streaming
 * https://upstash.com/blog/smooth-streaming
 */

type UpdateCallback = (key: string, accumulated: string) => void

export class StreamingQueue {
  private buffer = new Map<string, string>()
  private rafId: number | null = null
  private callback: UpdateCallback
  private isScheduled = false
  private destroyed = false

  constructor(callback: UpdateCallback) {
    this.callback = callback
  }

  /**
   * Add delta to buffer
   * Does not update immediately, waits for next RAF callback
   * Silently ignores adds after destroy() is called
   */
  add(key: string, delta: string): void {
    if (this.destroyed) return

    const current = this.buffer.get(key) || ''
    this.buffer.set(key, current + delta)

    // Only schedule RAF once
    if (!this.isScheduled) {
      this.isScheduled = true
      this.rafId = requestAnimationFrame(() => {
        this.flush()
      })
    }
  }

  /**
   * Flush buffer and pass accumulated content to callback
   * Scheduled by RAF, synchronized with browser refresh rate
   */
  private flush(): void {
    this.isScheduled = false

    if (this.destroyed || this.buffer.size === 0) {
      return
    }

    // Process all accumulated content in batch
    for (const [key, value] of this.buffer) {
      this.callback(key, value)
    }

    this.buffer.clear()
  }

  /**
   * Immediately flush buffer (used when stream ends to ensure all content is updated)
   */
  flushNow(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.isScheduled = false
    this.flush()
  }

  /**
   * Cleanup resources
   * Prevents any further callbacks or updates
   */
  destroy(): void {
    this.destroyed = true
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.buffer.clear()
    this.isScheduled = false
  }
}
