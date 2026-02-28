/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Streaming EventBus - 避免循环依赖的事件总线
 *
 * 用于 conversation.store → remote.store 的流式事件传递
 * conversation.store 发送事件，remote.store 监听并广播给 Remote 端
 */

type StreamingEventType =
  | 'thinking:start'
  | 'thinking:delta'
  | 'thinking:complete'
  | 'tool:start'
  | 'tool:delta'
  | 'tool:complete'
  | 'content:start'
  | 'content:delta'
  | 'content:complete'
  | 'status:change'
  | 'complete'
  | 'error'

type EventCallback = (data: any) => void

class StreamingEventBus {
  private listeners = new Map<StreamingEventType, Set<EventCallback>>()

  /** 订阅事件 */
  on(event: StreamingEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)

    // 返回取消订阅函数
    return () => this.off(event, callback)
  }

  /** 取消订阅 */
  off(event: StreamingEventType, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback)
  }

  /** 发送事件 */
  emit(event: StreamingEventType, data?: any): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data)
      } catch (error) {
        console.error(`[StreamingBus] Error in ${event} handler:`, error)
      }
    })
  }

  /** 清理所有监听器 */
  clear(): void {
    this.listeners.clear()
  }

  /** 获取当前监听器数量（用于调试） */
  getListenerCount(event: StreamingEventType): number {
    return this.listeners.get(event)?.size ?? 0
  }
}

// 单例导出
export const streamingBus = new StreamingEventBus()

// 便捷函数
export const emitThinkingStart = () => streamingBus.emit('thinking:start')
export const emitThinkingDelta = (delta: string) => streamingBus.emit('thinking:delta', delta)
export const emitThinkingComplete = (reasoning: string) =>
  streamingBus.emit('thinking:complete', reasoning)
export const emitToolStart = (toolCall: { name: string; args: string; id: string }) =>
  streamingBus.emit('tool:start', toolCall)
export const emitToolDelta = (delta: string) => streamingBus.emit('tool:delta', delta)
export const emitToolComplete = () => streamingBus.emit('tool:complete')
export const emitStatusChange = (status: string) => streamingBus.emit('status:change', status)
export const emitComplete = () => streamingBus.emit('complete')
export const emitError = (error: string) => streamingBus.emit('error', error)
