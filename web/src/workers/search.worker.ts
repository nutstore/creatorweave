/**
 * Search Worker - full-text search in a separate thread.
 *
 * Traverses and reads files entirely inside worker (native FS / OPFS handles).
 */

import micromatch from 'micromatch'

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

type WorkerResponse =
  | { type: 'SEARCH_RESULT'; payload: SearchResultPayload }
  | { type: 'ERROR'; payload: { error: string } }

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
let isProcessing = false

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  try {
    switch (message.type) {
      case 'SEARCH':
        await handleSearch(message.payload)
        break
      case 'ABORT':
        abortController.abort()
        isProcessing = false
        break
      default:
        sendError({ error: `Unknown message type: ${(message as any).type}` })
    }
  } catch (error) {
    sendError({ error: String(error) })
  }
}

async function handleSearch(payload: SearchMessage['payload']): Promise<void> {
  if (isProcessing) {
    sendError({ error: 'Already processing a search' })
    return
  }

  isProcessing = true
  abortController = new AbortController()
  const signal = abortController.signal

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
    } = payload

    if (!query || !query.trim()) {
      sendResult({
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
    const root = await resolveSubdir(directoryHandle, path)
    const matcher = buildMatcher(query, { regex, caseSensitive, wholeWord })

    const stack: Array<{ dir: FileSystemDirectoryHandle; relPath: string }> = [{ dir: root, relPath: '' }]
    const hits: SearchHit[] = []
    let scannedFiles = 0
    let skippedFiles = 0
    let deadlineExceeded = false
    let truncated = false

    while (stack.length > 0) {
      if (signal.aborted) break
      if (Date.now() > deadlineAt) {
        deadlineExceeded = true
        break
      }

      const current = stack.pop()!
      for await (const entry of current.dir.values()) {
        if (signal.aborted) break
        if (Date.now() > deadlineAt) {
          deadlineExceeded = true
          break
        }

        const rel = current.relPath ? `${current.relPath}/${entry.name}` : entry.name

        if (entry.kind === 'directory') {
          if (shouldSkipDir(entry.name, includeIgnored, excludeDirs)) continue
          stack.push({ dir: entry as FileSystemDirectoryHandle, relPath: rel })
          continue
        }

        if (glob && !micromatch.isMatch(rel, glob)) continue

        scannedFiles++
        const file = await (entry as FileSystemFileHandle).getFile()
        if (file.size > Math.max(1, maxFileSize)) {
          skippedFiles++
          continue
        }

        let text = ''
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

    sendResult({
      results: hits,
      totalMatches: hits.length,
      scannedFiles,
      skippedFiles,
      truncated,
      deadlineExceeded,
    })
  } catch (error) {
    sendError({ error: error instanceof Error ? error.message : String(error) })
  } finally {
    isProcessing = false
  }
}

async function resolveSubdir(
  root: FileSystemDirectoryHandle,
  subPath?: string
): Promise<FileSystemDirectoryHandle> {
  if (!subPath) return root
  const clean = subPath.trim().replace(/^\.?\//, '').replace(/\/+$/, '')
  if (!clean) return root
  const parts = clean.split('/').filter(Boolean)
  let current = root
  for (const part of parts) {
    if (part === '..') throw new Error('path cannot include ".."')
    current = await current.getDirectoryHandle(part)
  }
  return current
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

function sendError(payload: { error: string }): void {
  const response: WorkerResponse = { type: 'ERROR', payload }
  self.postMessage(response)
}

export type {}
