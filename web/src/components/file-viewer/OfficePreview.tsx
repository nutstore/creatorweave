/**
 * OfficePreview - Preview office files (xlsx, xls, pptx, ppt, doc) via eo2suite public service.
 *
 * Flow:
 * 1. Upload file blob to eo2suite → get file key
 * 2. Create JWT token via eo2suite API
 * 3. Get editor URL from openDocument API
 * 4. Open editor URL in new tab for preview
 */

import { useState, useEffect, useCallback } from 'react'
import { FileText, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { useT } from '@/i18n'

// ── eo2suite API helpers (exported for reuse) ─────────────────────────────

const EO2_UPLOAD_URL = 'https://web.eo2suite.cn/api/file/upload'
const EO2_CREATE_TOKEN_URL = 'https://web.eo2suite.cn/api/trpc/editor.createToken?batch=1'

export async function uploadToEo2Suite(blob: Blob, fileName: string): Promise<string> {
  const url = `${EO2_UPLOAD_URL}?name=${encodeURIComponent(fileName)}`
  const res = await fetch(url, { method: 'PUT', body: blob })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const data = await res.json()
  return data.key as string
}

export async function getEo2EditorUrl(blob: Blob, fileName: string): Promise<string> {
  const key = await uploadToEo2Suite(blob, fileName)
  const res = await fetch(EO2_CREATE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ '0': { key } }),
  })
  if (!res.ok) throw new Error(`Create token failed: ${res.status}`)
  const data = await res.json()
  const result = data?.[0]?.result?.data
  if (!result?.token || !result?.api) throw new Error('Invalid token response')
  const editorRes = await fetch(result.api, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${result.token}` },
  })
  if (!editorRes.ok) throw new Error(`Open document failed: ${editorRes.status}`)
  const editorData = await editorRes.json()
  if (!editorData?.url) throw new Error('No editor URL in response')
  return editorData.url as string
}

// ── Types ───────────────────────────────────────────────────────────────────

interface OfficePreviewProps {
  blob: Blob
  fileName: string
  fileSize: number
}

type PreviewState =
  | { status: 'uploading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }

// ── Component ───────────────────────────────────────────────────────────────

export function OfficePreview({ blob, fileName, fileSize }: OfficePreviewProps) {
  const t = useT()
  const [state, setState] = useState<PreviewState>({ status: 'uploading' })

  const loadPreview = useCallback(async () => {
    setState({ status: 'uploading' })
    try {
      const url = await getEo2EditorUrl(blob, fileName)
      setState({ status: 'ready', url })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [blob, fileName])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  // ── Render ───────────────────────────────────────────────────────────────

  // Loading state
  if (state.status === 'uploading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
        <p className="text-xs text-neutral-500">{t('officePreview.uploading', { defaultValue: '正在上传文件...' })}</p>
        <p className="text-[10px] text-neutral-400">
          {fileName} ({formatBytes(fileSize)})
        </p>
      </div>
    )
  }

  // Error state
  if (state.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-xs text-red-500">{state.message}</p>
        <p className="text-[10px] text-neutral-400">
          {fileName} ({formatBytes(fileSize)})
        </p>
        <button
          type="button"
          onClick={loadPreview}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <RefreshCw className="h-3 w-3" />
          {t('officePreview.retry', { defaultValue: '重试' })}
        </button>
      </div>
    )
  }

  // Ready - open in new tab (COEP require-corp blocks iframe embedding)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <FileText className="h-10 w-10 text-neutral-300" />
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {fileName}
      </p>
      <p className="text-[10px] text-neutral-400">
        {formatBytes(fileSize)}
      </p>
      <button
        type="button"
        onClick={() => window.open(state.url, '_blank', 'noopener')}
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-teal-700"
      >
        <ExternalLink className="h-4 w-4" />
        {t('officePreview.openInNewTab')}
      </button>
    </div>
  )
}

// ── Office file extensions ──────────────────────────────────────────────────

/** Extensions handled by eo2suite (files not supported locally). xlsx is handled by format-registry. */
export const OFFICE_EXTS = new Set(['xls', 'pptx', 'ppt', 'doc', 'docx'])
