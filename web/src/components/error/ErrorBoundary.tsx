/**
 * ErrorBoundary - Catches JavaScript errors anywhere in component tree
 * Logs errors and displays a fallback UI instead of crashing the entire app
 *
 * Based on React Error Boundaries:
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

import { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: { componentStack: string }) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Default fallback UI when an error occurs
 */
function DefaultFallback({ error, resetError }: { error: Error | null; resetError: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-red-900">渲染错误</h3>
        </div>

        <p className="mb-4 text-sm text-neutral-600">
          组件渲染时发生错误。这可能是临时问题，请尝试刷新页面。
        </p>

        {error && (
          <details className="mb-4">
            <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-700">
              错误详情
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-neutral-100 p-2 text-xs text-neutral-700">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <button
          type="button"
          onClick={resetError}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          <RefreshCw className="h-4 w-4" />
          重试
        </button>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)
  }

  handleResetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return <DefaultFallback error={this.state.error} resetError={this.handleResetError} />
    }

    return this.props.children
  }
}

/**
 * Streaming-specific Error Boundary with better UX for streaming errors
 */
interface StreamingErrorBoundaryProps {
  children: ReactNode
  conversationId?: string
  onRetry?: () => void
}

export function StreamingErrorBoundary({
  children,
  conversationId,
  onRetry,
}: StreamingErrorBoundaryProps) {
  const handleStreamingError = (error: Error) => {
    console.error('[StreamingErrorBoundary] Streaming error:', {
      conversationId,
      error: error.message,
    })

    // Could send to error tracking service here
  }

  return (
    <ErrorBoundary
      onError={handleStreamingError}
      fallback={
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
            <p className="text-sm text-neutral-600">流式输出出错</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
              >
                <RefreshCw className="h-3 w-3" />
                重试
              </button>
            )}
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
