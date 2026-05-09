import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamingQueue } from '../streaming-queue'

describe('StreamingQueue', () => {
  let rafCallbacks: FrameRequestCallback[]
  let nextRafId: number
  let cancelledRafIds: number[]

  beforeEach(() => {
    rafCallbacks = []
    nextRafId = 1
    cancelledRafIds = []

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafCallbacks.push(callback)
        return nextRafId++
      }),
    )

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        cancelledRafIds.push(id)
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('queues items and flushNow delivers accumulated content', () => {
    const callback = vi.fn()
    const queue = new StreamingQueue(callback)

    queue.add('message-1', 'Hel')
    queue.add('message-1', 'lo')
    queue.flushNow()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('message-1', 'Hello')
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(cancelledRafIds).toEqual([1])
  })

  it('batches multiple keys before a flush', () => {
    const callback = vi.fn()
    const queue = new StreamingQueue(callback)

    queue.add('first', 'A')
    queue.add('second', 'B')
    queue.add('first', 'C')

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    queue.flushNow()

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenNthCalledWith(1, 'first', 'AC')
    expect(callback).toHaveBeenNthCalledWith(2, 'second', 'B')
  })

  it('flushNow is a no-op when the queue is empty', () => {
    const callback = vi.fn()
    const queue = new StreamingQueue(callback)

    queue.flushNow()

    expect(callback).not.toHaveBeenCalled()
    expect(cancelAnimationFrame).not.toHaveBeenCalled()
  })

  it('flushes from the scheduled requestAnimationFrame callback', () => {
    const callback = vi.fn()
    const queue = new StreamingQueue(callback)

    queue.add('message-1', 'Hi')

    expect(callback).not.toHaveBeenCalled()
    expect(rafCallbacks).toHaveLength(1)

    rafCallbacks[0](16)

    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith('message-1', 'Hi')
  })

  it('destroy cancels pending work and ignores future adds', () => {
    const callback = vi.fn()
    const queue = new StreamingQueue(callback)

    queue.add('message-1', 'pending')
    queue.destroy()
    queue.add('message-1', 'ignored')
    queue.flushNow()

    expect(callback).not.toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  })
})
