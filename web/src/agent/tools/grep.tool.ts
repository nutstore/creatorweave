/**
 * grep tool - Search file contents using regex patterns.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { traverseDirectory } from '@/services/traversal.service'
import { resolveFileHandle } from '@/services/fsAccess.service'
import micromatch from 'micromatch'

export const grepDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep',
    description:
      'Search for a regex pattern in file contents. Returns matching lines with file paths and line numbers. Useful for finding code references, function definitions, or specific strings.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description:
            'Regular expression pattern to search for (e.g. "function\\s+handleClick", "import.*React")',
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search in (default: project root)',
        },
        file_pattern: {
          type: 'string',
          description: 'Only search in files matching this glob pattern (e.g. "*.ts", "*.tsx")',
        },
      },
      required: ['pattern'],
    },
  },
}

export const grepExecutor: ToolExecutor = async (args, context) => {
  const pattern = args.pattern as string
  const subPath = (args.path as string) || ''
  const filePattern = args.file_pattern as string | undefined

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected.' })
  }

  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'gm')
  } catch (e) {
    return JSON.stringify({
      error: `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  try {
    let searchHandle = context.directoryHandle
    if (subPath) {
      const parts = subPath.split('/').filter(Boolean)
      for (const part of parts) {
        searchHandle = await searchHandle.getDirectoryHandle(part)
      }
    }

    const results: string[] = []
    const MAX_MATCHES = 100
    let totalMatches = 0

    for await (const entry of traverseDirectory(searchHandle)) {
      if (entry.type !== 'file') continue
      if (totalMatches >= MAX_MATCHES) break

      // Filter by file pattern if specified
      if (filePattern) {
        if (
          !micromatch.isMatch(entry.name, filePattern) &&
          !micromatch.isMatch(entry.path, filePattern)
        ) {
          continue
        }
      }

      // Skip binary-like files
      const ext = entry.name.split('.').pop()?.toLowerCase()
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
      if (ext && skipExts.has(ext)) continue

      // Skip large files (>500KB)
      if (entry.size > 512 * 1024) continue

      try {
        const entryPath = subPath ? `${subPath}/${entry.path}` : entry.path
        const fileHandle = await resolveFileHandle(context.directoryHandle!, entryPath)
        const file = await fileHandle.getFile()
        const content = await file.text()

        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0
          if (regex.test(lines[i])) {
            results.push(`${entryPath}:${i + 1}: ${lines[i].trim()}`)
            totalMatches++
            if (totalMatches >= MAX_MATCHES) break
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    if (results.length === 0) {
      return `No matches for pattern "${pattern}"${subPath ? ` in ${subPath}` : ''}`
    }

    const truncated = totalMatches >= MAX_MATCHES ? `\n... (limited to ${MAX_MATCHES} matches)` : ''
    return results.join('\n') + truncated
  } catch (error) {
    return JSON.stringify({
      error: `Grep failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
