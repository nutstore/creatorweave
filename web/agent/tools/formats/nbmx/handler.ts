/**
 * NBMX Format Handler — read-only nutstore brain map text extraction.
 *
 * NBMX files are ZIP archives containing a `content.json` file.
 * The JSON has a recursive tree structure representing a mind map:
 *
 * {
 *   "data": { "text": "Root topic", ... },
 *   "children": [
 *     { "data": { "text": "Child 1", ... }, "children": [...] },
 *     { "data": { "text": "Child 2", ... } }
 *   ],
 *   "template": "right",
 *   "theme": "rainbow",
 *   "version": "1.3.5"
 * }
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'
import { unzipSync } from 'fflate'

// ── Types ─────────────────────────────────────────────────────────────────

interface NbmxNode {
  data?: {
    text?: string
    [key: string]: unknown
  }
  children?: NbmxNode[]
}

interface NbmxContent {
  data?: { text?: string; [key: string]: unknown }
  children?: NbmxNode[]
  template?: string
  theme?: string
  version?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Recursively extract text from mind map nodes as indented outline */
function extractOutline(node: NbmxNode, indent: number): string[] {
  const lines: string[] = []
  const text = node.data?.text?.trim()
  if (!text) return lines

  const prefix = indent === 0 ? '' : '  '.repeat(indent) + '- '
  lines.push(prefix + text.replace(/\n/g, ' | '))

  if (node.children) {
    for (const child of node.children) {
      lines.push(...extractOutline(child, indent + 1))
    }
  }

  return lines
}

/** Count total nodes and max depth */
function countNodes(node: NbmxNode, depth: number): { count: number; maxDepth: number } {
  let count = 0
  let maxDepth = depth

  if (node.data?.text) count = 1

  if (node.children) {
    for (const child of node.children) {
      const sub = countNodes(child, depth + 1)
      count += sub.count
      maxDepth = Math.max(maxDepth, sub.maxDepth)
    }
  }

  return { count, maxDepth }
}

// ── Handler ───────────────────────────────────────────────────────────────

export const nbmxHandler: FormatHandler = {
  extension: 'nbmx',
  label: 'Nutstore Brain Map',
  binaryMode: true,
  formatHint:
    'This is a Nutstore Brain Map (.nbmx) file — a mind map stored as a ZIP with JSON content. '
    + 'read() returns the full mind map as an indented text outline. '
    + 'This is a read-only format.',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data

    // Step 1: Unzip
    let unzipped: Record<string, Uint8Array>
    try {
      unzipped = unzipSync(input)
    } catch {
      return {
        content: `[Brain Map] ${path}\nFailed to unzip. The file may be corrupted.`,
        kind: 'nbmx',
      }
    }

    // Step 2: Find content.json
    let contentJson: Uint8Array | undefined
    for (const [name, content] of Object.entries(unzipped)) {
      if (name === 'content.json' || name.endsWith('/content.json')) {
        contentJson = content
        break
      }
    }

    if (!contentJson) {
      const fileList = Object.keys(unzipped).join(', ')
      return {
        content: `[Brain Map] ${path}\nNo content.json found in archive. Files: ${fileList}`,
        kind: 'nbmx',
      }
    }

    // Step 3: Parse JSON
    let parsed: NbmxContent
    try {
      parsed = JSON.parse(new TextDecoder('utf-8').decode(contentJson))
    } catch (e) {
      return {
        content: `[Brain Map] ${path}\nFailed to parse content.json: ${e instanceof Error ? e.message : String(e)}`,
        kind: 'nbmx',
      }
    }

    // Step 4: Extract outline text
    const rootText = parsed.data?.text?.trim() || '(untitled)'
    const outlineLines = extractOutline(parsed, 0)
    const outline = outlineLines.join('\n')

    // Stats
    const stats = countNodes(parsed, 0)

    const content = [
      `[Brain Map] ${path}`,
      `Root: ${rootText}`,
      `Nodes: ${stats.count}`,
      `Depth: ${stats.maxDepth}`,
      parsed.template ? `Template: ${parsed.template}` : '',
      parsed.theme ? `Theme: ${parsed.theme}` : '',
      '',
      '--- Content ---',
      '',
      outline || '(empty mind map)',
      '',
      '💡 This is a Nutstore Brain Map (.nbmx). This is a read-only format — to edit, use the brain map editor.',
    ].filter(Boolean).join('\n')

    return {
      content,
      kind: 'nbmx',
      metadata: {
        nodeCount: stats.count,
        maxDepth: stats.maxDepth,
        template: parsed.template ?? null,
        theme: parsed.theme ?? null,
        version: parsed.version ?? null,
      },
    }
  },
}
