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
import { Upload, FolderOpen, CheckCircle, AlertCircle, FileText, Folder, AlertTriangle, FileArchive } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import {
  copyDirectoryRecursive,
  containsSkillMd,
  readFileTree,
  previewSkillZip,
  writeZipSkillToDir,
  type FileEntry,
  type ZipSkillPreview,
} from '@/skills/skill-folder-utils'

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

/** Unified pending-skill state — either a folder handle or a zip preview. */
interface PendingSkill {
  dirName: string
  fileTree: FileEntry[]
  fileCount: number
  isZip: boolean
  isBundle: boolean
  bundleSkills?: Array<{ dirName: string; fileCount: number }>
  dirHandle?: FileSystemDirectoryHandle
  zipPreview?: ZipSkillPreview
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
  const [pending, setPending] = useState<PendingSkill | null>(null)
  const [pendingOverwrite, setPendingOverwrite] = useState(false)

  // ── Helpers ──────────────────────────────────────────────────────────
  // copyDirectoryRecursive, containsSkillMd, readFileTree are imported
  // from @/skills/skill-folder-utils (shared with UserSkillDropZone).

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

  /** Stage 1a: validate folder & prepare confirmation preview */
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
    const overwrite = await checkExistingSkill(targetRoot.handle, dirHandle.name)

    setPending({
      dirName: dirHandle.name,
      fileTree: entries,
      fileCount: count,
      isZip: false,
      isBundle: false,
      dirHandle,
    })
    setPendingOverwrite(overwrite)
    setStatus('confirm')
  }

  /** Stage 1b: validate zip & prepare confirmation preview */
  async function handleZip(zipFile: File) {
    const targetRootName = selectedRoot || roots[0]?.name
    const targetRoot = roots.find((r) => r.name === targetRootName)
    if (!targetRoot) {
      setStatus('error')
      setErrorMsg(t('skillUpload.noRoot') || 'No project root available')
      return
    }

    try {
      const preview = await previewSkillZip(zipFile)

      if (preview.isBundle && preview.skills) {
        const skills = preview.skills
        const overwriteChecks = await Promise.all(
          skills.map((s) => checkExistingSkill(targetRoot.handle, s.dirName)),
        )
        const overwrite = overwriteChecks.some(Boolean)

        setPending({
          dirName: `${skills.length} skills`,
          fileTree: [],
          fileCount: skills.reduce((sum, s) => sum + s.fileCount, 0),
          isZip: true,
          isBundle: true,
          bundleSkills: skills.map((s) => ({ dirName: s.dirName, fileCount: s.fileCount })),
          zipPreview: preview,
        })
        setPendingOverwrite(overwrite)
      } else if (preview.skill) {
        const skill = preview.skill
        const overwrite = await checkExistingSkill(targetRoot.handle, skill.dirName)
        setPending({
          dirName: skill.dirName,
          fileTree: skill.entries,
          fileCount: skill.fileCount,
          isZip: true,
          isBundle: false,
          zipPreview: preview,
        })
        setPendingOverwrite(overwrite)
      }

      setStatus('confirm')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read ZIP archive')
    }
  }

  /** Stage 2: confirmed — execute the actual write */
  async function handleConfirmUpload() {
    if (!pending) return

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
      let totalCount = 0

      if (pending.isZip && pending.zipPreview) {
        // ── ZIP import path ──
        const preview = pending.zipPreview
        if (preview.isBundle && preview.skills) {
          // Bundle mode — write each skill
          for (const s of preview.skills) {
            try {
              await skillsDir.removeEntry(s.dirName, { recursive: true })
            } catch { /* doesn't exist, fine */ }
            const skillDir = await skillsDir.getDirectoryHandle(s.dirName, { create: true })
            totalCount += await writeZipSkillToDir(preview.raw, skillDir, s.commonRoot)
          }
        } else if (preview.skill) {
          const s = preview.skill
          try {
            await skillsDir.removeEntry(s.dirName, { recursive: true })
          } catch { /* doesn't exist, fine */ }
          const skillDir = await skillsDir.getDirectoryHandle(s.dirName, { create: true })
          totalCount = await writeZipSkillToDir(preview.raw, skillDir, s.commonRoot)
        }
      } else if (pending.dirHandle) {
        // ── Folder import path ──
        const folderName = pending.dirHandle.name
        try {
          await skillsDir.removeEntry(folderName, { recursive: true })
        } catch { /* doesn't exist, fine */ }
        const skillDir = await skillsDir.getDirectoryHandle(folderName, { create: true })
        totalCount = await copyDirectoryRecursive(pending.dirHandle, skillDir)
      }

      setStatus('success')
      setSuccessMsg(
        pending.isBundle
          ? (t('skillUpload.bundleSuccess') || 'Imported {count} file(s) across {n} skills')
              .replace('{count}', String(totalCount))
              .replace('{n}', String(pending.bundleSkills?.length ?? 0))
          : (t('skillUpload.success') || 'Uploaded {count} file(s) to .skills/{name}/')
              .replace('{count}', String(totalCount))
              .replace('{name}', pending.dirName),
      )
      setPending(null)
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
    setPending(null)
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

      // Collect DataTransfer synchronously (items become invalid after first await)
      const items = e.dataTransfer.items
      const files = Array.from(e.dataTransfer.files) // sync snapshot

      const supportsDirHandle =
        items.length > 0 && typeof items[0].getAsFileSystemHandle === 'function'

      const handlePromises: Promise<FileSystemHandle | null>[] = []
      if (supportsDirHandle) {
        for (let i = 0; i < items.length; i++) {
          const p = items[i].getAsFileSystemHandle?.()
          if (p) handlePromises.push(p)
        }
      }

      // First pass: check for directory handles
      if (supportsDirHandle) {
        for (const promise of handlePromises) {
          const handle = await promise
          if (handle?.kind === 'directory') {
            await handleUpload(handle as FileSystemDirectoryHandle)
            return
          }
        }
      }

      // Second pass: check for .zip files
      if (files.length > 0) {
        const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip'))
        if (zipFile) {
          await handleZip(zipFile)
          return
        }
      }

      // Nothing recognized
      if (items.length > 0 && !supportsDirHandle) {
        setStatus('error')
        setErrorMsg(
          t('skillUpload.browserNotSupported') ||
            'Your browser does not support folder drag-and-drop. Please use the browse button.',
        )
      } else {
        setStatus('error')
        setErrorMsg(
          t('skillUpload.dropFolderOrZipOnly') ||
            'Please drop a skill folder or a .zip file',
        )
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRoot, roots]
  )

  // ── Folder picker fallback ────────────────────────────────────────────

  const handlePickFolder = useCallback(async () => {
    // Try directory picker first (Chrome 86+). If user cancels, abort silently.
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      await handleUpload(dirHandle)
      return
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      // Directory picker failed (e.g. Firefox) — fall through to file picker
    }

    // Fallback: file picker for .zip
    try {
      const fileHandle = await (window as unknown as {
        showOpenFilePicker?: (opts: {
          types: Array<{ description: string; accept: Record<string, string[]> }>
          multiple: boolean
        }) => Promise<FileSystemFileHandle[]>
      }).showOpenFilePicker!({
        types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        multiple: false,
      })
      const file = await fileHandle[0].getFile()
      await handleZip(file)
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      console.error('[ProjectSkillDropZone] Picker error:', err)
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to pick file')
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
      {status === 'confirm' && pending ? (
        <div className="space-y-3">
          {/* Target path */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              {t('skillUpload.confirmTarget') || 'Upload Target'}
            </p>
            <p className="font-mono text-sm text-neutral-800 dark:text-neutral-200">
              {pending.isBundle ? (
                <>{targetRootName}/.skills/ <span className="font-semibold text-blue-600 dark:text-blue-400">({pending.dirName})</span>/</>
              ) : (
                <>{targetRootName}/.skills/<span className="font-semibold text-blue-600 dark:text-blue-400">{pending.dirName}</span>/</>
              )}
            </p>
          </div>

          {/* Overwrite warning */}
          {pendingOverwrite && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {pending.isBundle
                  ? (t('skillUpload.overwriteWarningBundle') || 'One or more skill folders already exist. They will be replaced.')
                  : (t('skillUpload.overwriteWarning') || 'A skill folder named "{name}" already exists. It will be replaced.')
                      .replace('{name}', pending.dirName)}
              </p>
            </div>
          )}

          {/* ZIP source indicator */}
          {pending.isZip && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <FileArchive className="h-3.5 w-3.5" />
              {t('skillUpload.zipSource') || 'Importing from ZIP archive'}
            </div>
          )}

          {/* Bundle skill list */}
          {pending.isBundle && pending.bundleSkills ? (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
                <FileArchive className="h-4 w-4 text-neutral-500" />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {pending.bundleSkills.length} {t('skillUpload.skills') || 'skills'}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  ({pending.fileCount} {t('skillUpload.files') || 'files'})
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto p-3 space-y-1">
                {pending.bundleSkills.map((s) => (
                  <div key={s.dirName} className="flex items-center gap-1.5 text-sm">
                    <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                    <span className="text-neutral-700 dark:text-neutral-300">{s.dirName}</span>
                    <span className="text-xs text-neutral-400">({s.fileCount})</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* File tree preview (single skill — folder or zip) */
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
                {pending.isZip ? (
                  <FileArchive className="h-4 w-4 text-neutral-500" />
                ) : (
                  <FolderOpen className="h-4 w-4 text-neutral-500" />
                )}
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {pending.dirName}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  ({pending.fileCount} {t('skillUpload.files') || 'files'})
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto p-3">
                {renderFileTree(pending.fileTree)}
              </div>
            </div>
          )}
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
