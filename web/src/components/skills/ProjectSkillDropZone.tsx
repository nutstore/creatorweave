/**
 * ProjectSkillDropZone - Upload a skill folder to the project's .skills/ directory.
 *
 * Supports:
 * - Drag-and-drop a folder from the OS file manager
 * - Fallback: click to select folder via native picker
 * - Multi-root: shows a root selector when multiple roots exist
 * - Validates that the folder contains a SKILL.md file
 * - Shows a confirmation preview before writing files
 */

import { useState, useCallback, useRef } from 'react'
import { Upload, FolderOpen, CheckCircle, AlertCircle, FileText, Folder, AlertTriangle } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

interface DropZoneRoot {
  name: string
  handle: FileSystemDirectoryHandle
}

interface ProjectSkillDropZoneProps {
  roots: DropZoneRoot[]
  onUploaded: () => void
  onClose: () => void
}

type UploadStatus = 'idle' | 'dragover' | 'confirm' | 'uploading' | 'success' | 'error'

/** A lightweight file tree entry for preview */
interface FileEntry {
  name: string
  kind: 'file' | 'directory'
  children?: FileEntry[]
}

export function ProjectSkillDropZone({ roots, onUploaded, onClose }: ProjectSkillDropZoneProps) {
  const t = useT()
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [selectedRoot, setSelectedRoot] = useState<string>(
    roots.length === 1 ? roots[0].name : ''
  )
  const dropRef = useRef<HTMLDivElement>(null)

  // Confirmation preview state
  const [pendingDirHandle, setPendingDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [pendingFileTree, setPendingFileTree] = useState<FileEntry[]>([])
  const [pendingFileCount, setPendingFileCount] = useState(0)
  const [pendingOverwrite, setPendingOverwrite] = useState(false)

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Recursively copy all entries from one directory handle to another */
  async function copyDirectoryRecursive(
    src: FileSystemDirectoryHandle,
    dest: FileSystemDirectoryHandle
  ): Promise<number> {
    let fileCount = 0
    for await (const entry of src.values()) {
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile()
        const destFile = await dest.getFileHandle(entry.name, { create: true })
        const writable = await destFile.createWritable()
        await writable.write(file)
        await writable.close()
        fileCount++
      } else if (entry.kind === 'directory') {
        const subDir = await dest.getDirectoryHandle(entry.name, { create: true })
        fileCount += await copyDirectoryRecursive(entry as FileSystemDirectoryHandle, subDir)
      }
    }
    return fileCount
  }

  /** Check if a directory contains SKILL.md (case-insensitive) */
  async function containsSkillMd(dir: FileSystemDirectoryHandle): Promise<boolean> {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase() === 'skill.md') {
        return true
      }
    }
    return false
  }

  /** Read directory tree for preview (limited depth to avoid performance issues) */
  async function readFileTree(
    dir: FileSystemDirectoryHandle,
    maxDepth: number = 2
  ): Promise<{ entries: FileEntry[]; count: number }> {
    let count = 0
    const entries: FileEntry[] = []
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        entries.push({ name: entry.name, kind: 'file' })
        count++
      } else if (entry.kind === 'directory' && maxDepth > 0) {
        const sub = await readFileTree(entry as FileSystemDirectoryHandle, maxDepth - 1)
        entries.push({ name: entry.name, kind: 'directory', children: sub.entries })
        count += sub.count
      } else if (entry.kind === 'directory') {
        // At max depth, just note the directory without expanding
        entries.push({ name: entry.name, kind: 'directory' })
      }
    }
    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return { entries, count }
  }

  /** Check if a skill folder already exists in the target .skills/ directory */
  async function checkExistingSkill(
    rootHandle: FileSystemDirectoryHandle,
    folderName: string
  ): Promise<boolean> {
    try {
      const skillsDir = await rootHandle.getDirectoryHandle('.skills')
      await skillsDir.getDirectoryHandle(folderName)
      return true // exists
    } catch {
      return false // doesn't exist
    }
  }

  /** Get the folder name from a directory handle */
  function getFolderName(handle: FileSystemDirectoryHandle): string {
    return handle.name
  }

  /** Stage 1: validate & prepare confirmation preview */
  async function handleUpload(dirHandle: FileSystemDirectoryHandle) {
    // Validate SKILL.md exists
    const hasSkillMd = await containsSkillMd(dirHandle)
    if (!hasSkillMd) {
      setStatus('error')
      setErrorMsg(t('skillUpload.noSkillMd') || 'Folder must contain a SKILL.md file')
      return
    }

    // Determine target root
    const targetRootName = selectedRoot || roots[0]?.name
    const targetRoot = roots.find((r) => r.name === targetRootName)
    if (!targetRoot) {
      setStatus('error')
      setErrorMsg(t('skillUpload.noRoot') || 'No project root available')
      return
    }

    // Read file tree for preview
    const { entries, count } = await readFileTree(dirHandle)

    // Check if already exists (will overwrite)
    const overwrite = await checkExistingSkill(targetRoot.handle, getFolderName(dirHandle))

    setPendingDirHandle(dirHandle)
    setPendingFileTree(entries)
    setPendingFileCount(count)
    setPendingOverwrite(overwrite)
    setStatus('confirm')
  }

  /** Stage 2: confirmed — execute the actual write */
  async function handleConfirmUpload() {
    if (!pendingDirHandle) return

    const targetRootName = selectedRoot || roots[0]?.name
    const targetRoot = roots.find((r) => r.name === targetRootName)
    if (!targetRoot) {
      setStatus('error')
      setErrorMsg(t('skillUpload.noRoot') || 'No project root available')
      return
    }

    // Verify write permission on target root
    try {
      const perm = await targetRoot.handle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') {
        const req = await targetRoot.handle.requestPermission({ mode: 'readwrite' })
        if (req !== 'granted') {
          setStatus('error')
          setErrorMsg(t('skillUpload.writePermissionRequired') || 'Write permission is required to upload skills')
          return
        }
      }
    } catch {
      // queryPermission may not be supported in all browsers; proceed optimistically
    }

    setStatus('uploading')
    setErrorMsg(null)

    try {
      // Ensure .skills/ directory exists
      const skillsDir = await targetRoot.handle.getDirectoryHandle('.skills', { create: true })
      const folderName = getFolderName(pendingDirHandle)

      // Remove existing skill directory to avoid stale file accumulation
      try {
        await skillsDir.removeEntry(folderName, { recursive: true })
      } catch {
        // Directory doesn't exist yet, which is fine
      }

      // Create fresh skill subdirectory
      const skillDir = await skillsDir.getDirectoryHandle(folderName, { create: true })
      // Copy files recursively
      const count = await copyDirectoryRecursive(pendingDirHandle, skillDir)

      setStatus('success')
      setSuccessMsg(
        (t('skillUpload.success') || 'Uploaded {count} file(s) to .skills/{name}/')
          .replace('{count}', String(count))
          .replace('{name}', folderName)
      )
      setPendingDirHandle(null)
      onUploaded()
    } catch (err) {
      console.error('[ProjectSkillDropZone] Upload failed:', err)
      setStatus('error')
      setErrorMsg(
        err instanceof Error ? err.message : (t('skillUpload.failed') || 'Upload failed')
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
    // Only reset if leaving the drop zone itself
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setStatus('idle')
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setStatus('idle')

      // Try getAsFileSystemHandle for directory support (Chrome 86+)
      const items = e.dataTransfer.items
      let foundDir = false
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        // getAsFileSystemHandle returns FileSystemHandle (file or directory)
        const handle = await item.getAsFileSystemHandle?.()
        if (handle?.kind === 'directory') {
          foundDir = true
          await handleUpload(handle as FileSystemDirectoryHandle)
          return
        }
      }

      // Fallback: no directory found
      if (!foundDir) {
        // Check if browser supports getAsFileSystemHandle at all
        if (items.length > 0 && typeof items[0].getAsFileSystemHandle !== 'function') {
          setStatus('error')
          setErrorMsg(t('skillUpload.browserNotSupported') || 'Your browser does not support folder drag-and-drop. Please use the browse button instead.')
        } else {
          setStatus('error')
          setErrorMsg(t('skillUpload.dropFolderOnly') || 'Please drop a folder, not individual files')
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRoot, roots]
  )

  // ── Folder picker fallback ────────────────────────────────────────────

  const handlePickFolder = useCallback(async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      await handleUpload(dirHandle)
    } catch (err) {
      // User cancelled the picker — ignore
      if ((err as DOMException)?.name === 'AbortError') return
      console.error('[ProjectSkillDropZone] Picker error:', err)
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to pick folder')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, roots])

  // ── Render helpers ────────────────────────────────────────────────────

  const isMultiRoot = roots.length > 1
  const targetRootName = selectedRoot || roots[0]?.name || ''

  /** Render file tree entries recursively */
  function renderFileTree(entries: FileEntry[], depth: number = 0): React.ReactNode {
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
              : 'text-neutral-600 dark:text-neutral-400'
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
      {/* Root selector for multi-root — always visible when multiple roots */}
      {isMultiRoot && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {t('skillUpload.targetRoot') || 'Target Root'}
          </label>
          <div className="flex gap-2">
            {roots.map((root) => (
              <button
                key={root.name}
                type="button"
                onClick={() => setSelectedRoot(root.name)}
                disabled={status === 'uploading'}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  selectedRoot === root.name
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600',
                  status === 'uploading' && 'pointer-events-none opacity-50'
                )}
              >
                <FolderOpen className="h-4 w-4" />
                {root.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Confirmation preview ── */}
      {status === 'confirm' && pendingDirHandle ? (
        <div className="space-y-3">
          {/* Target path */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              {t('skillUpload.confirmTarget') || 'Upload Target'}
            </p>
            <p className="font-mono text-sm text-neutral-800 dark:text-neutral-200">
              {targetRootName}/.skills/<span className="font-semibold text-blue-600 dark:text-blue-400">{pendingDirHandle.name}</span>/
            </p>
          </div>

          {/* Overwrite warning */}
          {pendingOverwrite && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {(t('skillUpload.overwriteWarning') || 'A skill folder named "{name}" already exists. It will be replaced.')
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
            'border-blue-300 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20'
          )}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-500" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('skillUpload.uploading') || 'Uploading...'}
          </p>
        </div>
      ) : status === 'success' ? (
        /* ── Success ── */
        <div
          className={cn(
            'flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed',
            'border-green-500 bg-green-50/50 dark:border-green-400 dark:bg-green-950/20'
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
            'border-red-500 bg-red-50/50 dark:border-red-400 dark:bg-red-950/20'
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
              : 'border-neutral-300 bg-neutral-50/50 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:border-neutral-500'
          )}
        >
          <Upload
            className={cn(
              'h-8 w-8 transition-colors',
              status === 'dragover'
                ? 'text-blue-500'
                : 'text-neutral-400 dark:text-neutral-500'
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
              ? (t('skillUpload.confirmOverwrite') || 'Replace & Upload')
              : (t('skillUpload.confirmUpload') || 'Upload')}
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
            {t('skillUpload.uploading') || 'Uploading...'}
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
