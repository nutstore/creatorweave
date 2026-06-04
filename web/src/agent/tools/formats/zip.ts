/**
 * Generic ZIP Format Handler
 *
 * Reads any .zip archive, extracts text-like entries as UTF-8,
 * and returns them concatenated. Binary entries are listed but not decoded.
 */

import type { FormatHandler, FormatReadResult } from '../format-registry'
import { unzipSync } from 'fflate'

/** File extensions considered text-like (lowercase, no dot) */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'xml', 'csv', 'tsv',
  'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'mjs',
  'cjs', 'py', 'rb', 'rs', 'go', 'java', 'c', 'cpp', 'h',
  'hpp', 'cs', 'php', 'swift', 'kt', 'scala', 'sh', 'bash',
  'zsh', 'fish', 'ps1', 'bat', 'cmd', 'yaml', 'yml', 'toml',
  'ini', 'cfg', 'conf', 'log', 'sql', 'graphql', 'vue',
  'svelte', 'astro', 'dockerfile', 'makefile', 'gitignore',
  'env', 'editorconfig', 'prettierrc', 'eslintrc',
])

function isTextEntry(filename: string): boolean {
  if (filename.endsWith('/')) return false

  const basename = filename.split('/').pop() ?? ''
  const ext = basename.includes('.') ? basename.split('.').pop()!.toLowerCase() : ''

  if (TEXT_EXTENSIONS.has(ext)) return true

  const textNames = new Set([
    'data', 'readme', 'license', 'changelog', 'authors', 'contributors',
    'makefile', 'dockerfile', 'vagrantfile', 'gemfile', 'rakefile',
    'procfile', 'bower', 'npm', 'package',
  ])
  return textNames.has(basename.toLowerCase())
}

export const zipHandler: FormatHandler = {
  extension: 'zip',
  label: 'ZIP Archive',
  binaryMode: true,

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    const unzipped = unzipSync(input)

    const entries: Array<{ name: string; size: number; isText: boolean }> = []
    const textParts: string[] = []

    // Sort: text first, then by name
    const entryNames = Object.keys(unzipped).sort((a, b) => {
      const aIsText = isTextEntry(a)
      const bIsText = isTextEntry(b)
      if (aIsText !== bIsText) return aIsText ? -1 : 1
      return a.localeCompare(b)
    })

    for (const name of entryNames) {
      const content = unzipped[name]
      if (name.endsWith('/')) continue

      const size = content.length
      const isText = isTextEntry(name)

      entries.push({ name, size, isText })

      if (isText) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(content)
        textParts.push(`=== ${name} ===\n${text}`)
      }
    }

    const textEntries = entries.filter(e => e.isText)
    const binaryEntries = entries.filter(e => !e.isText)

    const content = [
      `[ZIP Archive] ${path}`,
      `Total entries: ${Object.keys(unzipped).length} (${textEntries.length} text, ${binaryEntries.length} binary)`,
      '',
      ...entries.map(e =>
        e.isText
          ? `[text] ${e.name} (${e.size} bytes)`
          : `[binary] ${e.name} (${e.size} bytes)`
      ),
      '',
      '--- Extracted Text Content ---',
      '',
      ...textParts,
    ].join('\n')

    // Add hint for binary entries
    if (binaryEntries.length > 0) {
      const binNames = binaryEntries.map(e => e.name).join(', ')
      return {
        content: content + `\n\n💡 Binary files in archive: ${binNames}. Use Python to process them if needed.`,
        kind: 'zip',
        metadata: {
          totalEntries: Object.keys(unzipped).length,
          textEntries: textEntries.length,
          binaryEntries: binaryEntries.length,
        },
        entries,
      }
    }

    return {
      content,
      kind: 'zip',
      metadata: {
        totalEntries: Object.keys(unzipped).length,
        textEntries: textEntries.length,
        binaryEntries: binaryEntries.length,
      },
      entries,
    }
  },
}
