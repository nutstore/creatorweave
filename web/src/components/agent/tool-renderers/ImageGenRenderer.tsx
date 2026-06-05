/**
 * Renderer for `generate_image` tool — image generation with inline preview.
 *
 * Summary: tool name + prompt snippet + status
 * Detail: generated image(s) displayed inline with download button
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { ImageIcon, Download, Loader2 } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'
import { readAssetBlob, downloadAssetBlob } from '../asset-utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Truncate prompt for summary display */
function truncatePrompt(prompt: string, maxLen = 60): string {
  if (prompt.length <= maxLen) return prompt
  return prompt.slice(0, maxLen).trim() + '…'
}

/** Extract result data from the tool envelope */
interface ImageGenResult {
  path: string
  mimeType: string
  description: string
  count: number
  paths: string[]
  message: string
}

function extractResult(ctx: ToolRenderCtx): ImageGenResult | null {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  if (!data) return null
  return {
    path: typeof data.path === 'string' ? data.path : '',
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'image/png',
    description: typeof data.description === 'string' ? data.description : '',
    count: typeof data.count === 'number' ? data.count : 1,
    paths: Array.isArray(data.paths) ? data.paths as string[] : [],
    message: typeof data.message === 'string' ? data.message : '',
  }
}

/** Strip "assets/" prefix from path to get the relative OPFS path */
function toRelativePath(p: string): string {
  if (p.startsWith('assets/')) return p.slice('assets/'.length)
  return p
}

function fileNameFromPath(p: string): string {
  return p.split('/').pop() || p
}

// ─── Inline Image Preview ───────────────────────────────────────────────────

function InlineImage({ assetPath, alt }: { assetPath: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const urlRef = useRef<string | null>(null)
  const relativePath = toRelativePath(assetPath)

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  // Load image from OPFS
  useEffect(() => {
    let cancelled = false
    readAssetBlob(relativePath).then((blob) => {
      if (blob && !cancelled) {
        const objectUrl = URL.createObjectURL(blob)
        urlRef.current = objectUrl
        setUrl(objectUrl)
      } else if (!cancelled) {
        setError(true)
      }
    })
    return () => { cancelled = true }
  }, [relativePath])

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
        <span>Image not found: {fileNameFromPath(assetPath)}</span>
      </div>
    )
  }

  if (!url) {
    return (
      <div className="flex aspect-video w-full max-w-[480px] items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="relative group/img overflow-hidden rounded-md bg-neutral-50 dark:bg-neutral-900 max-w-[480px]">
      <img
        src={url}
        alt={alt}
        className="w-full object-contain"
        loading="lazy"
      />
    </div>
  )
}

// ── generate_image renderer ──

registerRenderer({
  name: 'generate_image',
  icon: <ImageIcon className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const prompt = typeof ctx.args.prompt === 'string' ? ctx.args.prompt : ''
    const result = extractResult(ctx)

    if (ctx.isStreaming) {
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">generate_image</code>
          {prompt && (
            <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[200px] inline-block align-bottom">
              &quot;{truncatePrompt(prompt)}&quot;
            </span>
          )}
          <span className="text-xs text-blue-500">…</span>
        </>
      )
    }

    if (ctx.isExecuting) {
      return (
        <>
          <code className="font-medium text-neutral-700 dark:text-neutral-200">generate_image</code>
          {prompt && (
            <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[200px] inline-block align-bottom">
              &quot;{truncatePrompt(prompt)}&quot;
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            <span className="text-xs text-blue-500">generating</span>
          </span>
        </>
      )
    }

    if (ctx.isError) {
      const errMsg = (ctx.result?.error as Record<string, unknown>)?.message
      return (
        <>
          <code className="font-medium text-red-600 dark:text-red-400">generate_image</code>
          {prompt && (
            <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[160px] inline-block align-bottom">
              &quot;{truncatePrompt(prompt)}&quot;
            </span>
          )}
          <span className="ml-auto text-xs text-red-500 shrink-0 truncate max-w-[200px]">
            {typeof errMsg === 'string' ? errMsg : 'failed'}
          </span>
        </>
      )
    }

    // Success
    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">generate_image</code>
        {prompt && (
          <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[200px] inline-block align-bottom">
            &quot;{truncatePrompt(prompt)}&quot;
          </span>
        )}
        {result && (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">
            {result.count > 1 ? `${result.count} images` : '✓ image'}
          </span>
        )}
      </>
    )
  },
  Detail(ctx) {
    const prompt = typeof ctx.args.prompt === 'string' ? ctx.args.prompt : ''
    const aspectRatio = typeof ctx.args.aspect_ratio === 'string' ? ctx.args.aspect_ratio : ''
    const result = extractResult(ctx)

    if (ctx.isExecuting) {
      return (
        <div className="px-3 py-4 space-y-3">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {prompt}
            {aspectRatio && <span className="ml-2 text-neutral-400">({aspectRatio})</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating image…
          </div>
          {/* Skeleton placeholder */}
          <div className="aspect-video w-full max-w-[480px] animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
        </div>
      )
    }

    if (ctx.isError) {
      const errMsg = (ctx.result?.error as Record<string, unknown>)?.message
      return (
        <div className="px-3 py-2 space-y-2">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {prompt}
            {aspectRatio && <span className="ml-2 text-neutral-400">({aspectRatio})</span>}
          </div>
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {typeof errMsg === 'string' ? errMsg : 'Image generation failed'}
          </div>
        </div>
      )
    }

    if (!result || result.paths.length === 0) {
      return (
        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">
          No image output
        </div>
      )
    }

    const paths = result.paths.map(toRelativePath)

    return (
      <div className="px-3 py-2 space-y-3">
        {/* Prompt info */}
        <div className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
          {prompt}
          {aspectRatio && <span className="ml-2 text-neutral-400">({aspectRatio})</span>}
        </div>

        {/* Generated images */}
        <div className="space-y-2">
          {paths.map((p, i) => (
            <ImageWithActions
              key={p}
              assetPath={p}
              alt={result.description || prompt}
              index={i}
              total={paths.length}
            />
          ))}
        </div>

        {/* Markdown reference hint */}
        {result.message && (
          <div className="flex items-start justify-between gap-2">
            <code className="text-[10px] text-neutral-400 dark:text-neutral-500 break-all">
              ![{result.description || 'image'}]({result.path})
            </code>
            <CopyIconButton content={`![${result.description || 'image'}](${result.path})`} />
          </div>
        )}
      </div>
    )
  },
})

// ─── Image with actions (download) ──────────────────────────────────────────

function ImageWithActions({ assetPath, alt, index, total }: {
  assetPath: string
  alt: string
  index: number
  total: number
}) {
  const handleDownload = useCallback(() => {
    downloadAssetBlob(assetPath, fileNameFromPath(assetPath))
  }, [assetPath])

  const label = total > 1 ? `Image ${index + 1} of ${total}` : undefined

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[10px] text-neutral-400 dark:text-neutral-500">{label}</div>
      )}
      <div className="relative inline-block">
        <InlineImage assetPath={assetPath} alt={alt} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
          {fileNameFromPath(assetPath)}
        </span>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
