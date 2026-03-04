/**
 * search_text tool - Search text across project files.
 *
 * Consolidates previous search tools into one entrypoint:
 * - Supports literal and regex matching
 * - File pattern filtering
 * - Context lines around matches
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { traverseDirectory } from '@/services/traversal.service'
import { resolveFileHandle } from '@/services/fsAccess.service'
import micromatch from 'micromatch'

interface SearchTextResult {
  path: string
  line: number
  match: string
  contextBefore?: string[]
  contextAfter?: string[]
}

export const searchTextDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_text',
    description:
      'Search text across project files. Supports literal or regex mode, file pattern filtering, and optional context lines.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text or regex to search for.',
        },
        mode: {
          type: 'string',
          enum: ['literal', 'regex'],
          description: 'Search mode. Default: literal.',
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search in (default: project root).',
        },
        file_pattern: {
          type: 'string',
          description: 'Only search in files matching this glob pattern.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether search is case-sensitive. Default: false.',
          default: false,
        },
        context_lines: {
          type: 'number',
          description: 'Number of context lines before and after each match. Default: 2.',
          default: 2,
        },
        max_results: {
          type: 'number',
          description: 'Maximum matches to return. Default: 100.',
          default: 100,
        },
      },
      required: ['query'],
    },
  },
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const searchTextExecutor: ToolExecutor = async (args, context) => {
  const query = args.query as string
  const mode = (args.mode as 'literal' | 'regex' | undefined) || 'literal'
  const subPath = (args.path as string) || ''
  const filePattern = args.file_pattern as string | undefined
  const caseSensitive = (args.case_sensitive as boolean | undefined) || false
  const contextLines = (args.context_lines as number | undefined) || 2
  const maxResults = (args.max_results as number | undefined) || 100

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  if (!query?.trim()) {
    return JSON.stringify({ error: 'query is required' })
  }

  let regex: RegExp
  try {
    const source = mode === 'regex' ? query : escapeRegExp(query)
    const flags = caseSensitive ? 'g' : 'gi'
    regex = new RegExp(source, flags)
  } catch (error) {
    return JSON.stringify({
      error: `Invalid search pattern: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  const skipExts = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'ico',
    'svg',
    'woff',
    'woff2',
    'ttf',
    'eot',
    'wasm',
    'zip',
    'gz',
    'tar',
    'pdf',
    'mp3',
    'mp4',
    'webm',
    'webp',
  ])

  try {
    let searchHandle = context.directoryHandle
    if (subPath) {
      const parts = subPath.split('/').filter(Boolean)
      for (const part of parts) {
        searchHandle = await searchHandle.getDirectoryHandle(part)
      }
    }

    const results: SearchTextResult[] = []
    let totalMatches = 0

    for await (const entry of traverseDirectory(searchHandle)) {
      if (entry.type !== 'file' || totalMatches >= maxResults) continue

      if (
        filePattern &&
        !micromatch.isMatch(entry.path, filePattern) &&
        !micromatch.isMatch(entry.name, filePattern)
      ) {
        continue
      }

      const ext = entry.name.split('.').pop()?.toLowerCase()
      if (ext && skipExts.has(ext)) continue
      if (entry.size > 512 * 1024) continue

      try {
        const entryPath = subPath ? `${subPath}/${entry.path}` : entry.path
        const fileHandle = await resolveFileHandle(context.directoryHandle, entryPath)
        const file = await fileHandle.getFile()
        const content = await file.text()
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          if (totalMatches >= maxResults) break
          regex.lastIndex = 0
          if (!regex.test(lines[i])) continue

          const start = Math.max(0, i - contextLines)
          const end = Math.min(lines.length - 1, i + contextLines)
          const row: SearchTextResult = {
            path: entryPath,
            line: i + 1,
            match: lines[i].trim(),
          }
          if (start < i) row.contextBefore = lines.slice(start, i).map((l) => l.trim())
          if (end > i) row.contextAfter = lines.slice(i + 1, end + 1).map((l) => l.trim())

          results.push(row)
          totalMatches++
        }
      } catch {
        // Skip unreadable files
      }
    }

    return JSON.stringify({
      success: true,
      query,
      mode,
      path: subPath || 'project root',
      filePattern: filePattern || 'all files',
      summary: {
        totalMatches,
        truncated: totalMatches >= maxResults,
      },
      results,
      message:
        results.length === 0
          ? `No matches found for "${query}".`
          : `Found ${totalMatches} match(es)${totalMatches >= maxResults ? ` (limited to ${maxResults})` : ''}.`,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Text search failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

