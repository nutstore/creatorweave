/**
 * Search Worker - full-text search in a separate thread.
 *
 * Traverses and reads files entirely inside worker (native FS / OPFS handles).
 */

import micromatch from 'micromatch'

interface PendingFileOverlay {
  content?: string
  deleted?: boolean
}

interface SearchMessage {
  type: 'SEARCH'
  payload: {
    directoryHandle: FileSystemDirectoryHandle
    path?: string
    query: string
    regex?: boolean
    caseSensitive?: boolean
    wholeWord?: boolean
    glob?: string
    maxResults?: number
    contextLines?: number
    deadlineMs?: number
    maxFileSize?: number
    includeIgnored?: boolean
    excludeDirs?: string[]
    pendingOverlays?: Record<string, PendingFileOverlay>
  }
}

type WorkerMessage = SearchMessage | { type: 'ABORT' }

interface SearchHit {
  path: string
  line: number
  column: number
  match: string
  preview: string
}

interface SearchResultPayload {
  results: SearchHit[]
  totalMatches: number
  scannedFiles: number
  skippedFiles: number
  truncated: boolean
  deadlineExceeded: boolean
}

interface SearchErrorPayload {
  message: string
  code?: 'path_not_found' | 'search_worker_error' | 'file_too_large'
  requestedPath?: string
  resolvedRootName?: string
}

type WorkerResponse =
  | { type: 'SEARCH_RESULT'; payload: SearchResultPayload }
  | { type: 'ERROR'; payload: SearchErrorPayload }

const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  '.turbo',
  '.pnpm-store',
])

let abortController = new AbortController()
let searchGeneration = 0

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  try {
    switch (message.type) {
      case 'SEARCH':
        await handleSearch(message.payload)
        break
      case 'ABORT':
        abortController.abort()
        break
      default:
        sendError({ message: `Unknown message type: ${(message as any).type}` })
    }
  } catch (error) {
    sendError({
      code: 'search_worker_error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function handleSearch(payload: SearchMessage['payload']): Promise<void> {
  // Abort any in-flight search and bump the generation counter so that
  // the stale handler's `finally` block won't clobber the new state.
  abortController.abort()
  const generation = ++searchGeneration
  abortController = new AbortController()
  const signal = abortController.signal

  // Only send if this is still the active generation.
  const sendResultIfActive = (payload: SearchResultPayload): void => {
    if (searchGeneration === generation) sendResult(payload)
  }
  const sendErrorIfActive = (payload: SearchErrorPayload): void => {
    if (searchGeneration === generation) sendError(payload)
  }

  try {
    const {
      directoryHandle,
      path,
      query,
      regex = false,
      caseSensitive = false,
      wholeWord = false,
      glob,
      maxResults = 200,
      contextLines = 0,
      deadlineMs = 25000,
      maxFileSize = 1024 * 1024,
      includeIgnored = false,
      excludeDirs = [],
      pendingOverlays,
    } = payload

    if (!query || !query.trim()) {
      sendResultIfActive({
        results: [],
        totalMatches: 0,
        scannedFiles: 0,
        skippedFiles: 0,
        truncated: false,
        deadlineExceeded: false,
      })
      return
    }

    const start = Date.now()
    const deadlineAt = start + Math.max(1000, deadlineMs)
    const normalizedPath = normalizeSubPath(path)
    let root = directoryHandle
    let searchSingleFile: string | null = null

    if (normalizedPath) {
      try {
        root = await resolveSubdir(directoryHandle, normalizedPath)
      } catch (error) {
        if (isNotFoundError(error)) {
          sendErrorIfActive({
            code: 'path_not_found',
            message: `Search path "${normalizedPath}" not found under current root "${directoryHandle.name}".`,
            requestedPath: normalizedPath,
            resolvedRootName: directoryHandle.name,
          })
          return
        }
        if (isTypeMismatchError(error)) {
          // Path is a file, not a directory - search in that file directly
          searchSingleFile = normalizedPath
        } else {
          throw error
        }
      }
    }

    const matcher = buildMatcher(query, { regex, caseSensitive, wholeWord })
    const hits: SearchHit[] = []
    let scannedFiles = 0
    let skippedFiles = 0
    let deadlineExceeded = false
    let truncated = false

    // If searching a single file, handle it separately
    if (searchSingleFile) {
      scannedFiles = 1
      // Check for overlay first
      const overlay = pendingOverlays?.[searchSingleFile]
      if (overlay?.deleted) {
        sendResultIfActive({
          results: [],
          totalMatches: 0,
          scannedFiles,
          skippedFiles: 0,
          truncated: false,
          deadlineExceeded: false,
        })
        return
      }

      let text: string
      if (overlay?.content !== undefined) {
        text = overlay.content
      } else {
        // Try to read the file from disk
        try {
          const fileHandle = await resolveSubfile(directoryHandle, searchSingleFile)
          const file = await fileHandle.getFile()
          if (file.size > Math.max(1, maxFileSize)) {
            sendErrorIfActive({
              code: 'file_too_large',
              message: `File "${searchSingleFile}" exceeds maximum size of ${maxFileSize} bytes.`,
            })
            return
          }
          text = await file.text()
        } catch (err) {
          sendErrorIfActive({
            code: 'path_not_found',
            message: `Could not read file "${searchSingleFile}".`,
            requestedPath: searchSingleFile,
          })
          return
        }
      }

      if (isProbablyBinary(text)) {
        sendResultIfActive({
          results: [],
          totalMatches: 0,
          scannedFiles,
          skippedFiles: 1,
          truncated: false,
          deadlineExceeded: false,
        })
        return
      }

      const fileHits = findMatchesInText(searchSingleFile, text, matcher, contextLines)
      hits.push(...fileHits)
      if (hits.length >= maxResults) {
        truncated = true
      }

      sendResultIfActive({
        results: hits,
        totalMatches: hits.length,
        scannedFiles,
        skippedFiles,
        truncated,
        deadlineExceeded,
      })
      return
    }

    // Build a set of disk-seen paths to identify new files (pending create, not on disk)
    const diskSeenPaths = new Set<string>()
    // Collect overlay paths that are within the search sub-path
    const relevantOverlayPaths: string[] = []

    const dirStack: Array<{ dir: FileSystemDirectoryHandle; relPath: string }> = [{ dir: root, relPath: '' }]

    if (pendingOverlays && Object.keys(pendingOverlays).length > 0) {
      for (const overlayPath of Object.keys(pendingOverlays)) {
        if (normalizedPath && !overlayPath.startsWith(normalizedPath + '/') && overlayPath !== normalizedPath) {
          continue
        }
        if (glob && !micromatch.isMatch(overlayPath, glob, { dot: true })) continue
        relevantOverlayPaths.push(overlayPath)
      }
    }

    while (dirStack.length > 0) {
      if (signal.aborted) break
      if (Date.now() > deadlineAt) {
        deadlineExceeded = true
        break
      }

      const current = dirStack.pop()!
      let entries: FileSystemHandle[] = []
      try {
        for await (const entry of current.dir.values()) {
          entries.push(entry)
        }
      } catch (error) {
        if (isNotFoundError(error)) {
          skippedFiles++
          continue
        }
        throw error
      }
      for (const entry of entries) {
        if (signal.aborted) break
        if (Date.now() > deadlineAt) {
          deadlineExceeded = true
          break
        }

        const rel = current.relPath ? `${current.relPath}/${entry.name}` : entry.name

        if (entry.kind === 'directory') {
          if (shouldSkipDir(entry.name, includeIgnored, excludeDirs)) continue
          dirStack.push({ dir: entry as FileSystemDirectoryHandle, relPath: rel })
          continue
        }

        if (glob && !micromatch.isMatch(rel, glob, { dot: true })) continue

        // Mark this path as seen on disk
        diskSeenPaths.add(rel)

        // Check pending overlay for this file
        const overlay = pendingOverlays?.[rel]
        if (overlay?.deleted) {
          // File is pending deletion — skip it entirely
          skippedFiles++
          continue
        }

        scannedFiles++

        let text: string
        if (overlay?.content !== undefined) {
          // Use overlay content instead of disk content
          text = overlay.content
        } else {
          // Read from disk
          let file: File
          try {
            file = await (entry as FileSystemFileHandle).getFile()
          } catch (error) {
            if (isNotFoundError(error)) {
              skippedFiles++
              continue
            }
            throw error
          }
          if (file.size > Math.max(1, maxFileSize)) {
            skippedFiles++
            continue
          }
          try {
            text = await file.text()
          } catch {
            skippedFiles++
            continue
          }
          if (isProbablyBinary(text)) {
            skippedFiles++
            continue
          }
        }

        const fileHits = findMatchesInText(rel, text, matcher, contextLines)
        for (const hit of fileHits) {
          hits.push(hit)
          if (hits.length >= Math.max(1, maxResults)) {
            truncated = true
            break
          }
        }
        if (truncated) break
      }
      if (truncated || deadlineExceeded) break

      if (scannedFiles % 25 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    // Phase 2: Search pending overlays for NEW files (not on disk).
    // These are files created in OPFS but not yet synced to disk.
    if (!truncated && !deadlineExceeded && relevantOverlayPaths.length > 0) {
      for (const overlayPath of relevantOverlayPaths) {
        if (signal.aborted) break
        if (Date.now() > deadlineAt) {
          deadlineExceeded = true
          break
        }
        // Skip files already scanned from disk (or skipped as deleted)
        if (diskSeenPaths.has(overlayPath)) continue

        const overlay = pendingOverlays![overlayPath]
        // Skip deleted files or overlays without content
        if (overlay?.deleted || overlay?.content === undefined) continue

        scannedFiles++
        const text = overlay.content
        if (isProbablyBinary(text)) {
          skippedFiles++
          continue
        }
        // Check maxFileSize for overlay content
        const byteSize = new TextEncoder().encode(text).length
        if (byteSize > Math.max(1, maxFileSize)) {
          skippedFiles++
          continue
        }

        const fileHits = findMatchesInText(overlayPath, text, matcher, contextLines)
        for (const hit of fileHits) {
          hits.push(hit)
          if (hits.length >= Math.max(1, maxResults)) {
            truncated = true
            break
          }
        }
        if (truncated) break
      }
    }

    sendResultIfActive({
      results: hits,
      totalMatches: hits.length,
      scannedFiles,
      skippedFiles,
      truncated,
      deadlineExceeded,
    })
  } catch (error) {
    sendErrorIfActive({
      code: 'search_worker_error',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    // Nothing to do — generation-based dedup handles staleness.
  }
}

function normalizeSubPath(subPath?: string): string {
  if (!subPath) return ''
  const clean = subPath.trim().replace(/^\.?\//, '').replace(/\/+$/, '')
  if (!clean) return ''
  return clean
}

async function resolveSubdir(root: FileSystemDirectoryHandle, cleanPath: string): Promise<FileSystemDirectoryHandle> {
  if (!cleanPath) return root
  const clean = cleanPath
  const parts = clean.split('/').filter(Boolean)
  let current = root
  for (const part of parts) {
    if (part === '..') throw new Error('path cannot include ".."')
    current = await current.getDirectoryHandle(part)
  }
  return current
}

async function resolveSubfile(root: FileSystemDirectoryHandle, cleanPath: string): Promise<FileSystemFileHandle> {
  const parts = cleanPath.split('/').filter(Boolean)
  if (parts.length === 0) throw new DOMException('File path is empty', 'NotFoundError')
  const fileName = parts.pop()!
  if (fileName === '..') throw new Error('path cannot include ".."')

  let current = root
  for (const part of parts) {
    if (part === '..') throw new Error('path cannot include ".."')
    current = await current.getDirectoryHandle(part)
  }

  return await current.getFileHandle(fileName)
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotFoundError' || error.name === 'NotFound')
  )
}

function isTypeMismatchError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TypeMismatchError'
}

function shouldSkipDir(name: string, includeIgnored: boolean, excludeDirs: string[]): boolean {
  if (includeIgnored) return false
  return DEFAULT_EXCLUDED_DIRS.has(name) || excludeDirs.includes(name)
}

function buildMatcher(
  query: string,
  options: { regex: boolean; caseSensitive: boolean; wholeWord: boolean }
): RegExp {
  const flags = options.caseSensitive ? 'g' : 'gi'
  if (options.regex) {
    const source = options.wholeWord ? `\\b(?:${query})\\b` : query
    return new RegExp(source, flags)
  }
  const escaped = escapeRegExp(query)
  const source = options.wholeWord ? `\\b${escaped}\\b` : escaped
  return new RegExp(source, flags)
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isProbablyBinary(text: string): boolean {
  if (!text) return false
  const sample = text.slice(0, 1024)
  return sample.includes('\u0000')
}

function findMatchesInText(
  path: string,
  content: string,
  regex: RegExp,
  contextLines: number
): SearchHit[] {
  const lines = content.split('\n')
  const result: SearchHit[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(line)) !== null) {
      const preview = buildPreview(lines, i, contextLines)
      result.push({
        path,
        line: i + 1,
        column: (match.index ?? 0) + 1,
        match: match[0],
        preview,
      })
      if (match.index === regex.lastIndex) {
        regex.lastIndex++
      }
    }
  }

  return result
}

function buildPreview(lines: string[], lineIndex: number, contextLines: number): string {
  if (contextLines <= 0) return lines[lineIndex] || ''
  const start = Math.max(0, lineIndex - contextLines)
  const end = Math.min(lines.length, lineIndex + contextLines + 1)
  return lines.slice(start, end).join('\n')
}

function sendResult(payload: SearchResultPayload): void {
  const response: WorkerResponse = { type: 'SEARCH_RESULT', payload }
  self.postMessage(response)
}

function sendError(payload: SearchErrorPayload): void {
  const response: WorkerResponse = { type: 'ERROR', payload }
  self.postMessage(response)
}

export type {}
