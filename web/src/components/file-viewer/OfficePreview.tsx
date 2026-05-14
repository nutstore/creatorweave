/**
 * OfficePreview - Preview office files (xlsx, xls, pptx, ppt, doc) via eo2suite public service.
 *
 * Flow:
 * 1. Upload file blob to eo2suite → get file key
 * 2. Create JWT token via eo2suite API
 * 3. Get editor URL from openDocument API
 * 4. Embed in iframe for preview
 */

import { useState, useEffect, useCallback } from 'react'
import { FileText, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { useT } from '@/i18n'

// ── eo2suite API endpoints ──────────────────────────────────────────────────

const EO2_UPLOAD_URL = 'https://web.eo2suite.cn/api/file/upload'
const EO2_CREATE_TOKEN_URL = 'https://web.eo2suite.cn/api/trpc/editor.createToken?batch=1'

// ── Types ───────────────────────────────────────────────────────────────────

interface OfficePreviewProps {
  blob: Blob
  fileName: string
  fileSize: number
}

type PreviewState =
  | { status: 'uploading' }
  | { status: 'creating-token' }
  | { status: 'loading-editor' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }

// ── API helpers ─────────────────────────────────────────────────────────────

async function uploadFile(blob: Blob, fileName: string): Promise<string> {
  const url = `${EO2_UPLOAD_URL}?name=${encodeURIComponent(fileName)}`
  const res = await fetch(url, {
    method: 'PUT',
    body: blob,
  })
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return data.key as string
}

async function createToken(key: string): Promise<{ token: string; api: string }> {
  const res = await fetch(EO2_CREATE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ '0': { key } }),
  })
  if (!res.ok) {
    throw new Error(`Create token failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const result = data?.[0]?.result?.data
  if (!result?.token || !result?.api) {
    throw new Error('Invalid token response')
  }
  return result as { token: string; api: string }
}

async function getEditorUrl(token: string, api: string): Promise<string> {
  const res = await fetch(api, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Open document failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  if (!data?.url) {
    throw new Error('No editor URL in response')
  }
  return data.url as string
}

// ── Component ───────────────────────────────────────────────────────────────

export function OfficePreview({ blob, fileName, fileSize }: OfficePreviewProps) {
  const t = useT()
  const [state, setState] = useState<PreviewState>({ status: 'uploading' })

  const loadPreview = useCallback(async () => {
    setState({ status: 'uploading' })
    try {
      // Step 1: Upload file
      const key = await uploadFile(blob, fileName)
      setState({ status: 'creating-token' })

      // Step 2: Create token
      const { token, api } = await createToken(key)
      setState({ status: 'loading-editor' })

      // Step 3: Get editor URL
      const url = await getEditorUrl(token, api)
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

  // ── Status labels ────────────────────────────────────────────────────────

  const statusLabel: Record<string, string> = {
    uploading: t('officePreview.uploading', { defaultValue: '正在上传文件...' }),
    'creating-token': t('officePreview.creatingToken', { defaultValue: '正在生成预览...' }),
    'loading-editor': t('officePreview.loadingEditor', { defaultValue: '正在加载编辑器...' }),
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Loading states
  if (state.status === 'uploading' || state.status === 'creating-token' || state.status === 'loading-editor') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
        <p className="text-xs text-neutral-500">{statusLabel[state.status]}</p>
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

/** Extensions handled by eo2suite (files not supported locally) */
export const OFFICE_EXTS = new Set(['xlsx', 'xls', 'pptx', 'ppt', 'doc', 'docx'])
