/**
 * UserSkillDropZone - Import a skill folder into OPFS `.skills/user/`.
 *
 * This is the "My Skills" counterpart to ProjectSkillDropZone. The logic is
 * identical (drag-drop folder → validate SKILL.md → preview → confirm → copy),
 * but the destination is OPFS instead of native FS `.skills/`, and there is no
 * multi-root selector (user skills are global, not per-project).
 *
 * Shared helpers (copyDirectoryRecursive, containsSkillMd, readFileTree) live
 * in @/skills/skill-folder-utils.
 */

import { useState, useCallback, useRef } from 'react'
import { Upload, FolderOpen, CheckCircle, AlertCircle, FileText, Folder, AlertTriangle } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import {
  containsSkillMd,
  readFileTree,
  type FileEntry,
} from '@/skills/skill-folder-utils'
import { importUserSkillFolder, userSkillDirExists } from '@/skills/user-skills-scanner'

interface UserSkillDropZoneProps {
  onImported: () => void
  onClose: () => void
}

type UploadStatus = 'idle' | 'dragover' | 'confirm' | 'uploading' | 'success' | 'error'

export function UserSkillDropZone({ onImported, onClose }: UserSkillDropZoneProps) {
  const t = useT()
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Confirmation preview state
  const [pendingDirHandle, setPendingDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [pendingFileTree, setPendingFileTree] = useState<FileEntry[]>([])
  const [pendingFileCount, setPendingFileCount] = useState(0)
  const [pendingOverwrite, setPendingOverwrite] = useState(false)

  // ── Stage 1: validate & prepare confirmation preview ──────────────────

  async function handleUpload(dirHandle: FileSystemDirectoryHandle) {
    // Validate SKILL.md exists
    const hasSkillMd = await containsSkillMd(dirHandle)
    if (!hasSkillMd) {
      setStatus('error')
      setErrorMsg(t('skillUpload.noSkillMd') || 'Folder must contain a SKILL.md file')
      return
    }

    // Read file tree for preview
    const { entries, count } = await readFileTree(dirHandle)

    // Check if skill already exists in OPFS
    const overwrite = await userSkillDirExists(dirHandle.name).catch(() => false)

    setPendingDirHandle(dirHandle)
    setPendingFileTree(entries)
    setPendingFileCount(count)
    setPendingOverwrite(overwrite)
    setStatus('confirm')
  }

  // ── Stage 2: confirmed — execute the actual write ─────────────────────

  async function handleConfirmUpload() {
    if (!pendingDirHandle) return

    setStatus('uploading')
    setErrorMsg(null)

    try {
      const count = await importUserSkillFolder(pendingDirHandle)

      setStatus('success')
      setSuccessMsg(
        (t('skillUpload.success') || 'Uploaded {count} file(s) to .skills/{name}/')
          .replace('{count}', String(count))
          .replace('{name}', pendingDirHandle.name),
      )
      setPendingDirHandle(null)
      onImported()
    } catch (err) {
      console.error('[UserSkillDropZone] Import failed:', err)
      setStatus('error')
      setErrorMsg(
        err instanceof Error ? err.message : (t('skillUpload.failed') || 'Import failed'),
      )
    }
  }

  /** Cancel the confirmation and go back to idle */
  function handleCancelConfirm() {
    setPendingDirHandle(null)
    setPendingFileTree([])
    setPendingFileCount(0)
    setPendingOverwrite(false)
    setStatus('idle')
  }

  // ── Drag & Drop handlers ──────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setStatus('dragover')
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setStatus('idle')
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setStatus('idle')

      const items = e.dataTransfer.items
      let foundDir = false
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const handle = await item.getAsFileSystemHandle?.()
        if (handle?.kind === 'directory') {
          foundDir = true
          await handleUpload(handle as FileSystemDirectoryHandle)
          return
        }
      }

      if (!foundDir) {
        if (items.length > 0 && typeof items[0].getAsFileSystemHandle !== 'function') {
          setStatus('error')
          setErrorMsg(
            t('skillUpload.browserNotSupported') ||
              'Your browser does not support folder drag-and-drop.',
          )
        } else {
          setStatus('error')
          setErrorMsg(
            t('skillUpload.dropFolderOnly') || 'Please drop a folder, not individual files',
          )
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ── Folder picker fallback ────────────────────────────────────────────

  const handlePickFolder = useCallback(async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      await handleUpload(dirHandle)
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      console.error('[UserSkillDropZone] Picker error:', err)
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to pick folder')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render helpers ────────────────────────────────────────────────────

  function renderFileTree(entries: FileEntry[], depth = 0): React.ReactNode {
    return entries.map((entry) => (
      <div key={entry.name} style={{ paddingLeft: depth * 16 }}>
        <div className="flex items-center gap-1.5 py-0.5 text-sm">
          {entry.kind === 'directory' ? (
            <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
          )}
          <span className={cn(
            'truncate',
            entry.name.toLowerCase() === 'skill.md'
              ? 'font-medium text-blue-600 dark:text-blue-400'
              : 'text-neutral-600 dark:text-neutral-400',
          )}>
            {entry.name}
          </span>
        </div>
        {entry.children && renderFileTree(entry.children, depth + 1)}
      </div>
    ))
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-6">
      {/* ── Confirmation preview ── */}
      {status === 'confirm' && pendingDirHandle ? (
        <div className="space-y-3">
          {/* Target path */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              {t('skillUpload.confirmTarget') || 'Import Target'}
            </p>
            <p className="font-mono text-sm text-neutral-800 dark:text-neutral-200">
              .skills/user/<span className="font-semibold text-blue-600 dark:text-blue-400">{pendingDirHandle.name}</span>/
            </p>
          </div>

          {/* Overwrite warning */}
          {pendingOverwrite && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {(t('skillUpload.overwriteWarning') || 'A skill named "{name}" already exists. It will be replaced.')
                  .replace('{name}', pendingDirHandle.name)}
              </p>
            </div>
          )}

          {/* File tree preview */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
              <FolderOpen className="h-4 w-4 text-neutral-500" />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {pendingDirHandle.name}
              </span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                ({pendingFileCount} {t('skillUpload.files') || 'files'})
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto p-3">
              {renderFileTree(pendingFileTree)}
            </div>
          </div>
        </div>
      ) : status === 'uploading' ? (
        /* ── Uploading spinner ── */
        <div
          className={cn(
            'flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed',
            'border-blue-300 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20',
          )}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-500" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('skillUpload.uploading') || 'Importing...'}
          </p>
        </div>
      ) : status === 'success' ? (
        /* ── Success ── */
        <div
          className={cn(
            'flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed',
            'border-green-500 bg-green-50/50 dark:border-green-400 dark:bg-green-950/20',
          )}
        >
          <CheckCircle className="h-8 w-8 text-green-500" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            {successMsg}
          </p>
        </div>
      ) : status === 'error' ? (
        /* ── Error ── */
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handlePickFolder}
          className={cn(
            'flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed',
            'border-red-500 bg-red-50/50 dark:border-red-400 dark:bg-red-950/20',
          )}
        >
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {t('skillUpload.retryHint') || 'Click to try again'}
          </p>
        </div>
      ) : (
        /* ── Idle / dragover drop zone ── */
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handlePickFolder}
          className={cn(
            'flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors',
            status === 'dragover'
              ? 'border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20'
              : 'border-neutral-300 bg-neutral-50/50 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:border-neutral-500',
          )}
        >
          <Upload
            className={cn(
              'h-8 w-8 transition-colors',
              status === 'dragover'
                ? 'text-blue-500'
                : 'text-neutral-400 dark:text-neutral-500',
            )}
          />
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {status === 'dragover'
                ? (t('skillUpload.dropHere') || 'Drop skill folder here')
                : (t('skillUpload.dropOrClick') || 'Drop a skill folder here, or click to browse')}
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {t('skillUpload.requirement') || 'Folder must contain a SKILL.md file'}
            </p>
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      {status === 'confirm' ? (
        <div className="flex items-center justify-between">
          <BrandButton variant="outline" onClick={handleCancelConfirm}>
            {t('common.cancel') || 'Cancel'}
          </BrandButton>
          <BrandButton onClick={handleConfirmUpload}>
            <Upload className="mr-1.5 h-4 w-4" />
            {pendingOverwrite
              ? (t('skillUpload.confirmOverwrite') || 'Replace & Import')
              : (t('skillUpload.confirmUpload') || 'Import')}
          </BrandButton>
        </div>
      ) : status === 'success' ? (
        <div className="flex justify-end">
          <BrandButton onClick={onClose}>
            {t('common.close') || 'Close'}
          </BrandButton>
        </div>
      ) : status === 'uploading' ? (
        <div className="flex justify-end">
          <BrandButton variant="outline" disabled>
            {t('skillUpload.uploading') || 'Importing...'}
          </BrandButton>
        </div>
      ) : (
        <div className="flex justify-end">
          <BrandButton variant="outline" onClick={onClose}>
            {t('common.cancel') || 'Cancel'}
          </BrandButton>
        </div>
      )}
    </div>
  )
}
