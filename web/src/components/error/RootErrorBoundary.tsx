/**
 * RootErrorBoundary — top-level safety net.
 *
 * Exists separately from the generic <ErrorBoundary/> because:
 *   1. It must render *outside* of <App/>, where i18n provider may not be
 *      available yet (the error can happen before i18n mounts).
 *   2. It special-cases "chunk load failed" errors caused by remote deploys
 *      invalidating hashed JS assets (e.g. dynamic import('docx-preview')).
 *      In that case the only recovery is a hard reload.
 *
 * Mount it once in main.tsx around <App />.
 */

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const CHUNK_LOAD_PATTERNS = [
  'importing a module script failed',
  'error loading dynamically imported module',
  'failed to fetch dynamically imported module',
  'importmeta',
  'chunk',
  'loading chunk',
  'loading css chunk',
]

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false
  // Vite/Rollup dynamic import failures show up as TypeError with a message
  // matching one of the patterns above, sometimes in error.name too.
  const text = `${error.name || ''} ${error.message || ''}`.toLowerCase()
  return CHUNK_LOAD_PATTERNS.some((pattern) => text.includes(pattern))
}

export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('[RootErrorBoundary] Uncaught render error:', error, info)
  }

  private handleReload = () => {
    // Bypass service worker cache and force a fresh fetch.
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const error = this.state.error
    const chunkFailed = isChunkLoadError(error)

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#f8fafc',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: chunkFailed ? '#7c2d12' : '#3b0764',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
              aria-hidden
            >
              {chunkFailed ? '🔄' : '⚠️'}
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {chunkFailed ? '应用已更新' : '页面出错'}
            </h2>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5, color: '#cbd5e1' }}>
            {chunkFailed
              ? '检测到新版本的脚本资源，当前页面的部分模块已失效。请刷新页面以加载最新版本。'
              : '渲染过程中发生了未捕获的错误。尝试刷新页面；如果问题持续，请联系开发者。'}
          </p>

          {error && (
            <details style={{ marginBottom: 16 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#94a3b8',
                  userSelect: 'none',
                }}
              >
                错误详情
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  maxHeight: 160,
                  overflow: 'auto',
                  background: '#0f172a',
                  color: '#f1f5f9',
                  padding: 8,
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {error.name}: {error.message}
                {error.stack ? `\n\n${error.stack}` : ''}
              </pre>
            </details>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
