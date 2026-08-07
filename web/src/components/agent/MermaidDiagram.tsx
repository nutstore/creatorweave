/**
 * MermaidDiagram — renders a Mermaid diagram from source text.
 *
 * Lazy-loads the `mermaid` library (~3MB) on first use so it never
 * lands in the main bundle.
 *
 * State machine:
 *
 *   streaming=true                       streaming=false
 *   ┌─────────┐                          ┌─────────┐
 *   │ loading │─────────────────────────►│ loading │
 *   └─────────┘   ←── stream restart     └─────────┘
 *                                          │ parse + render
 *                                          ▼
 *                                      ┌──────────┐
 *                                      │ rendered │ (keeps prior SVG during re-render)
 *                                      └──────────┘
 *                                          │ parse fail OR throw (only after stream ends)
 *                                          ▼
 *                                      ┌──────────┐
 *                                      │ errored  │ (banner strictly inside root <div>)
 *                                      └──────────┘
 *
 * Invariants:
 *   1. While `streaming === true`, the state is locked to `loading`.
 *      Mid-stream partial input is treated as "not ready", never "broken".
 *   2. Errors NEVER bubble out: no console.error, no throw, no escape
 *      of the component root. They appear only as the contained banner.
 *   3. Re-renders of an already-rendered chart keep showing the prior
 *      SVG until the new attempt completes (no flash of spinner on
 *      small edits).
 *
 * Zoom: click the diagram to open a Lightbox for full-size viewing.
 */

import { memo, useEffect, useRef, useState, useId, useCallback } from 'react'
import { Loader2, AlertTriangle, ZoomIn, ZoomOut, Scan, RotateCcw } from 'lucide-react'
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  useTransformComponent,
} from 'react-zoom-pan-pinch'
import { useTheme } from '@/store/theme.store'
import { Lightbox } from './Lightbox'

interface MermaidDiagramProps {
  chart: string
  /**
   * True while the parent is still streaming this chart's source text.
   * Defaults to false. While true the component stays in `loading`
   * and never enters `errored`, so mid-stream partial input never
   * surfaces a misleading "syntax error" banner.
   */
  streaming?: boolean
}

type RenderState =
  | { kind: 'loading' }
  | { kind: 'rendered'; svg: string }
  | { kind: 'errored'; message: string }

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
 * Parse the intrinsic width (px) from a mermaid SVG's viewBox.
 * Returns null if the viewBox can't be read (fallback: 0 = container-relative).
 */
export function mermaidViewBoxWidth(svg: string): number | null {
  const match = /viewBox=\"0\s+0\s+([\d.]+)\s+([\d.]+)\"/.exec(svg)
  return match ? Number(match[1]) : null
}

/**
 * Detect mermaid's built-in "error diagram".
 *
 * When parsing fails, mermaid does NOT throw — it renders an inline SVG
 * whose text reads "Syntax error in text mermaid version 11.16.0".
 * Checking only for `res.svg` presence in the render chain would treat
 * that as a successful render and surface the raw error diagram in the
 * chat. This helper lets us route those to our contained error state
 * (banner + source) instead.
 */
export function isMermaidErrorSvg(svg: string): boolean {
  return svg.includes('Syntax error in text') || /class=\"error-(text|icon)\"/.test(svg)
}

/**
 * ZoomableSvg — renders a mermaid SVG with professional zoom/pan/pinch
 * controls, powered by react-zoom-pan-pinch.
 *
 * The library applies a CSS transform (scale + translate) to the content
 * element — the SVG keeps its intrinsic viewBox size, and zooming/panning
 * is handled entirely by the library (wheel, pinch, touchpad, drag, double
 * click). No width-attribute surgery, no CSS dependency cycles.
 *
 * Initial scale fits the diagram WIDTH to the viewport (tall/narrow charts
 * are enlarged to fill the width and panned/zoomed for detail; wide charts
 * are scaled down to fit).
 */
function ZoomableSvg({ svg }: { svg: string }) {
  const intrinsicWidth = mermaidViewBoxWidth(svg) ?? 0

  const vbHeight = () => {
    const m = /viewBox=\"0\s+0\s+([\d.]+)\s+([\d.]+)\"/.exec(svg)
    return m ? Number(m[2]) : null
  }

  // Initial scale: fit the diagram width to the available viewport width.
  // Tall charts → scale > 1 (enlarged); wide charts → scale < 1 (fitted).
  const initialScale = (() => {
    if (intrinsicWidth <= 0) return 1
    const availWidth = window.innerWidth * 0.9 // 90vw (Lightbox container)
    if (availWidth <= 0) return 1
    return availWidth / intrinsicWidth
  })()

  // Fit the ENTIRE diagram into the viewport (both axes).
  const fitScale = useCallback(() => {
    if (intrinsicWidth <= 0) return 1
    const availWidth = window.innerWidth * 0.9
    const availHeight = window.innerHeight * 0.9
    const intrinsicHeight = vbHeight() ?? intrinsicWidth
    return Math.min(availWidth / intrinsicWidth, availHeight / intrinsicHeight)
  }, [svg, intrinsicWidth])

  return (
    <div className="relative h-[85vh] w-full">
      <TransformWrapper
        initialScale={initialScale}
        minScale={0.05}
        maxScale={20}
        centerOnInit
        limitToBounds={false}
        wheel={{ step: 0.08 }}
        doubleClick={{ mode: 'zoomIn', step: 0.5 }}
        pinch={{ step: 5 }}
      >
        {/** Controls — rendered via the library's context hook. */}
        <ZoomControls fitScale={fitScale} />

        <TransformComponent
          wrapperStyle={{
            width: '100%',
            height: '100%',
          }}
          contentStyle={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
          {/**
           * Original SVG at its intrinsic viewBox size. `width="100%"` on the
           * root svg is overridden so the library's CSS transform scales the
           * true diagram dimensions (initialScale is computed from this width).
           */}
          <div
            className="bg-white p-4"
            style={{ width: intrinsicWidth > 0 ? `${intrinsicWidth}px` : undefined }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}

/**
 * Floating zoom controls (bottom-right), reading zoom actions from the
 * react-zoom-pan-pinch context. Layout (like common image viewers):
 *
 *   [ − ]  [ 124% ]  [ + ]  |  [⛶ 适应窗口]  [↺ 重置]
 *
 * The percentage shows the LIVE scale. We use `useTransformComponent`
 * (not `useTransformContext`) because the former subscribes to library
 * `onChange` and re-renders when scale changes — the context value is a
 * mutable class instance whose `state` mutation does NOT trigger a render.
 *
 * Icons: Scan (four-corner frame) = fit-to-view; RotateCcw = reset.
 * Action buttons with ambiguous icons carry a text label for clarity.
 */
function ZoomControls({ fitScale }: { fitScale: () => number }) {
  const { zoomIn, zoomOut, resetTransform, setTransform } = useControls()
  const percent = useTransformComponent(({ state }) => Math.round(state.scale * 100))

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
      <button
        type="button"
        onClick={() => zoomOut(0.25)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        title="缩小"
        aria-label="缩小"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => resetTransform(200)}
        className="min-w-[48px] rounded-full px-2 py-1 text-center text-xs font-medium tabular-nums text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        title="恢复初始视图"
      >
        {percent}%
      </button>
      <button
        type="button"
        onClick={() => zoomIn(0.25)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        title="放大"
        aria-label="放大"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <div className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
      <button
        type="button"
        onClick={() => setTransform(0, 0, fitScale(), 200)}
        className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        title="适应窗口（缩放至完整可见）"
      >
        <Scan className="h-4 w-4" />
        <span className="hidden sm:inline">适应窗口</span>
      </button>
      <button
        type="button"
        onClick={() => resetTransform(200)}
        className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        title="重置视图"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="hidden sm:inline">重置</span>
      </button>
    </div>
  )
}

/**
 * MermaidDiagramImpl — the actual rendering logic, separated so the
 * memo boundary compares the `chart` string rather than props identity.
 */
const MermaidDiagramImpl = memo(function MermaidDiagramImpl({
  chart,
  streaming = false,
}: MermaidDiagramProps) {
  const { isDark } = useTheme()
  const [state, setState] = useState<RenderState>({ kind: 'loading' })
  const [zoomOpen, setZoomOpen] = useState(false)
  // Unique id prefix per instance — mermaid needs a unique render target id.
  const rawId = useId()
  // useId returns something like ":r0:" which is invalid in CSS/HTML id
  // selectors. Sanitize to a safe id.
  const idPrefix = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const renderSeqRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const seq = ++renderSeqRef.current

    // Parent says "still streaming": lock to loading, do NOT attempt
    // to render. Trying to parse/render partial input would only ever
    // produce failures mid-stream.
    if (streaming) {
      setState({ kind: 'loading' })
      return () => {
        cancelled = true
      }
    }

    // Stream is finalized (or this is a non-stream context). Run a
    // real render. We deliberately do NOT reset to `loading` here —
    // if we already have an SVG, keep showing it until the new
    // attempt completes, avoiding a flash of spinner on small edits.
    loadMermaid()
      .then((mermaid) => {
        if (cancelled) return
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          // Do NOT render mermaid's built-in "Syntax error in text"
          // error diagram. When parsing fails, mermaid would otherwise
          // resolve successfully with that error SVG; this flag makes it
          // throw instead, so our catch below surfaces a contained,
          // friendly error state (banner + source) rather than dumping
          // the error diagram into the message body.
          suppressErrorRendering: true,
        })
        const renderId = `${idPrefix}-${seq}`
        // Render directly: with suppressErrorRendering: true, invalid
        // syntax rejects instead of returning the "Syntax error" error
        // diagram (see mermaidAPI.render). No pre-parse needed.
        return mermaid.render(renderId, chart).then((res: { svg: string }) => {
          // Belt-and-suspenders: if some failure mode still emits the
          // error diagram without rejecting, catch it here too.
          if (isMermaidErrorSvg(res.svg)) {
            throw new Error('Invalid mermaid syntax')
          }
          return res
        })
      })
      .then((res: { svg: string } | undefined) => {
        if (cancelled) return
        if (res?.svg) {
          setState({ kind: 'rendered', svg: res.svg })
        } else {
          setState({ kind: 'errored', message: 'Empty render result' })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Errors are CONTAINED: no console.error, no throw, no escape.
        // The banner below is the only surface the user sees.
        const message = err instanceof Error ? err.message : String(err)
        setState({ kind: 'errored', message })
      })

    return () => {
      cancelled = true
    }
  }, [chart, streaming, isDark, idPrefix])

  // ── Loading ─────────────────────────────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <div
        className="my-2 flex items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 py-12 dark:border-neutral-700 dark:bg-bg-tertiary"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        <span className="ml-2 text-xs text-neutral-400">
          {streaming ? 'Preparing diagram…' : 'Rendering diagram…'}
        </span>
      </div>
    )
  }

  // ── Errored — banner strictly inside this root <div> ───────────────
  if (state.kind === 'errored') {
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

  // ── Rendered ────────────────────────────────────────────────────────
  // (TS narrowing: after the two returns above, state.kind === 'rendered')
  return (
    <>
      <div className="my-2 overflow-x-auto rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div
          className="cursor-zoom-in [&>svg]:mx-auto [&>svg]:max-w-full"
          // mermaid.render returns sanitized SVG (securityLevel: 'strict' uses DOMPurify internally).
          // We render it via dangerouslySetInnerHTML because the SVG string
          // is already a complete element.
          dangerouslySetInnerHTML={{ __html: state.svg }}
          onClick={() => setZoomOpen(true)}
        />
      </div>
      {zoomOpen && (
        <Lightbox
          onClose={() => setZoomOpen(false)}
          contentClassName="max-h-[90vh] max-w-[90vw] min-w-0 rounded-md bg-white shadow-2xl"
          imgClassName="bg-white"
        >
          {/**
           * Render the SVG into the current DOM (not via an <img> data URI).
           * Loading an SVG that contains <foreignObject> (mermaid node labels)
           * through an <img> enters the browser's "image/static" mode, which
           * does NOT render <foreignObject> — causing broken/blank diagrams on
           * some content. Injecting the same SVG element renders reliably.
           */}
          <ZoomableSvg svg={state.svg} />
        </Lightbox>
      )}
    </>
  )
})

export const MermaidDiagram = MermaidDiagramImpl
