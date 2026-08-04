/**
 * MermaidDiagram — renders a Mermaid diagram from source text.
 *
 * Lazy-loads the `mermaid` library (~3MB) on first use so it never
 * lands in the main bundle. Re-renders when:
 *   - the source changes
 *   - the app theme switches (light/dark)
 *   - the component re-mounts (streaming finalizes)
 *
 * Error handling: invalid syntax falls back to showing the raw source
 * in a normal code block, so the user can still read the intent.
 *
 * Zoom: click the diagram to open it in a Lightbox for full-size viewing.
 */

import { memo, useEffect, useRef, useState, useId } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useTheme } from '@/store/theme.store'
import { Lightbox } from './Lightbox'

interface MermaidDiagramProps {
  chart: string
}

// We dynamically import mermaid to keep it out of the main chunk.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MermaidApi = any

let mermaidPromise: Promise<MermaidApi> | null = null
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default)
  }
  return mermaidPromise
}

/**
 * MermaidDiagramImpl — the actual rendering logic, separated so the
 * memo boundary compares the `chart` string rather than props identity.
 */
const MermaidDiagramImpl = memo(function MermaidDiagramImpl({ chart }: MermaidDiagramProps) {
  const { isDark } = useTheme()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  // Unique id prefix per instance — mermaid needs a unique render target id.
  const rawId = useId()
  // useId returns something like ":r0:" which is invalid in CSS/HTML id
  // selectors. Sanitize to a safe id.
  const idPrefix = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const renderSeqRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const seq = ++renderSeqRef.current
    setLoading(true)
    setError(null)

    loadMermaid()
      .then((mermaid) => {
        if (cancelled || seq !== renderSeqRef.current) return
        // (Re)initialize on every theme switch so the color palette matches.
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        })
        const renderId = `${idPrefix}-${seq}`
        return mermaid.render(renderId, chart)
      })
      .then((res: { svg: string } | undefined) => {
        if (cancelled || seq !== renderSeqRef.current) return
        if (res?.svg) {
          setSvg(res.svg)
          setLoading(false)
        } else {
          setError('Empty result')
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (cancelled || seq !== renderSeqRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [chart, isDark, idPrefix])

  // ── Error fallback: show source as a normal code block ────────────────
  if (error) {
    return (
      <div className="my-2 overflow-hidden rounded-md border border-amber-200 dark:border-amber-800/50">
        <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1 text-[11px] text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="font-medium">Mermaid syntax error — showing source</span>
        </div>
        <pre className="overflow-x-auto bg-neutral-50 p-3 dark:bg-bg-tertiary">
          <code className="text-[13px] leading-relaxed text-neutral-800 dark:text-white">
            {chart}
          </code>
        </pre>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading || !svg) {
    return (
      <div className="my-2 flex items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 py-12 dark:border-neutral-700 dark:bg-bg-tertiary">
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        <span className="ml-2 text-xs text-neutral-400">Rendering diagram…</span>
      </div>
    )
  }

  // ── Rendered SVG ──────────────────────────────────────────────────────
  return (
    <>
      <div className="my-2 overflow-x-auto rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div
          className="cursor-zoom-in [&>svg]:mx-auto [&>svg]:max-w-full"
          // mermaid.render returns sanitized SVG (securityLevel: 'strict' uses DOMPurify internally).
          // We render it via dangerouslySetInnerHTML because the SVG string
          // is already a complete element.
          dangerouslySetInnerHTML={{ __html: svg }}
          onClick={(e) => {
            // Clone the SVG into a standalone data URL for the lightbox.
            const svgEl = e.currentTarget.querySelector('svg')
            if (svgEl) {
              setZoomSrc(
                `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                  new XMLSerializer().serializeToString(svgEl)
                )}`
              )
            }
          }}
        />
      </div>
      {zoomSrc && <Lightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </>
  )
})

export const MermaidDiagram = MermaidDiagramImpl
