/* eslint-disable react-refresh/only-export-components */
/**
 * RemoteBadge Error Boundary
 *
 * Catches errors in RemoteBadge components and their children
 * to prevent the entire app from crashing
 * Based on Michael Nygard's fault tolerance patterns
 *
 * Error handling strategy:
 * 1. Log error details to console
 * 2. Show a friendly fallback UI
 * 3. Provide a "retry" option
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { useT } from '@/i18n'

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
 * Default error fallback UI
 */
function DefaultFallback({ error, onRetry, t }: { error: Error | null; onRetry: () => void; t: (key: string) => string }) {
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
        {t('errorBoundary.retry')}
      </button>
    </div>
  )
}

function DefaultFallbackWithI18n(props: { error: Error | null; onRetry: () => void }) {
  const t = useT()
  return <DefaultFallback {...props} t={t} />
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
    // Update state so next render shows fallback UI
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details
    console.error('[RemoteBadgeErrorBoundary] Caught error:', error)
    console.error('[RemoteBadgeErrorBoundary] Error info:', errorInfo)

    // Save error info to state
    this.setState({
      error,
      errorInfo,
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    // Reset error state and try re-rendering
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback or default fallback
      if (this.props.fallback) {
        return this.props.fallback
      }

      return <DefaultFallbackWithI18n error={this.state.error} onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}

/**
 * HOC wrapper: Add error boundary to any component
 *
 * Usage example:
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
