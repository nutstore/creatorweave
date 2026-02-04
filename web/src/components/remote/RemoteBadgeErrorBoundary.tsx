/**
 * RemoteBadge Error Boundary
 *
 * 捕获 RemoteBadge 组件及其子组件的错误，防止整个应用崩溃
 * 按照 Michael Nygard 的故障模式分析建议实现
 *
 * 错误处理策略：
 * 1. 记录错误详情到控制台
 * 2. 显示友好的降级 UI
 * 3. 提供"重试"选项
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * 默认的错误回退 UI
 */
function DefaultFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 dark:border-red-800 dark:bg-red-950">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      <span className="text-xs text-red-700 dark:text-red-400">
        {error?.message || 'Remote control unavailable'}
      </span>
      <button
        onClick={onRetry}
        className="ml-2 rounded px-2 py-0.5 text-xs text-red-700 hover:bg-red-200 dark:text-red-400 dark:hover:bg-red-900"
      >
        Retry
      </button>
    </div>
  )
}

export class RemoteBadgeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 记录错误详情
    console.error('[RemoteBadgeErrorBoundary] Caught error:', error)
    console.error('[RemoteBadgeErrorBoundary] Error info:', errorInfo)

    // 保存错误信息到 state
    this.setState({
      error,
      errorInfo,
    })

    // 调用自定义错误处理器（如果提供）
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    // 重置错误状态，尝试重新渲染
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // 使用自定义 fallback 或默认 fallback
      if (this.props.fallback) {
        return this.props.fallback
      }

      return <DefaultFallback error={this.state.error} onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}

/**
 * HOC 包装器：为任何组件添加错误边界
 *
 * 使用示例：
 * ```tsx
 * const SafeRemoteBadge = withRemoteBadgeErrorBoundary(RemoteBadge)
 * ```
 */
export function withRemoteBadgeErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
): React.ComponentType<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <RemoteBadgeErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </RemoteBadgeErrorBoundary>
    )
  }
}
