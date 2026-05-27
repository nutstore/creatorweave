/**
 * .nol Format Handler — Outline Notes (怡氧大纲笔记)
 *
 * .nol files are ZIP archives containing:
 *   - data: JSON with a node tree ({version, nodes, rootNodeIds})
 *   - media/: embedded images
 *
 * Node content is HTML internally and is passed through as-is.
 * No Markdown ↔ HTML conversion — zero information loss.
 */

import type { FormatHandler, FormatReadResult, FormatWriteContext } from '../../format-registry'
import { unzipSync, zipSync } from 'fflate'

// ---------------------------------------------------------------------------
// .nol data types
// ---------------------------------------------------------------------------

export interface NolNode {
  id: string
  content: string
  childrenIds: string[]
  expanded?: number
  completed?: number
  images?: Array<{
    type: string
    data: {
      v?: number
      type?: string
      relativePath?: string
      bundled?: boolean
      src?: string
    }
    width?: number
  }>
}

export interface NolData {
  version?: number
  nodes: Record<string, NolNode>
  rootNodeIds: string[]
  slide?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Format write error with progressive hint
// ---------------------------------------------------------------------------

export class FormatWriteError extends Error {
  hint: string

  constructor(message: string, hint: string) {
    super(message)
    this.name = 'FormatWriteError'
    this.hint = hint
  }
}

// ---------------------------------------------------------------------------
// Node tree rendering (read)
// ---------------------------------------------------------------------------

function renderNodeTree(
  nodeId: string,
  nodes: Record<string, NolNode>,
  depth: number,
): string[] {
  const node = nodes[nodeId]
  if (!node) return []

  const indent = '  '.repeat(depth)
  // Pass HTML content through as-is — no conversion
  const content = node.content || ''
  const lines: string[] = []

  if (depth === 0) {
    lines.push(content)
  } else {
    lines.push(`${indent}- ${content}`)
  }

  if (node.images && node.images.length > 0) {
    for (const img of node.images) {
      const relPath = img.data?.relativePath
      if (relPath) {
        const mediaPath = relPath.replace(/^\.\.\//, '')
        lines.push(`${indent}  ![](${mediaPath})`)
      }
    }
  }

  for (const childId of node.childrenIds || []) {
    lines.push(...renderNodeTree(childId, nodes, depth + 1))
  }

  return lines
}

// ---------------------------------------------------------------------------
// ID generation (write)
// ---------------------------------------------------------------------------

function generateNodeId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function parseOutlineToNolData(text: string): NolData {
  const nodes: Record<string, NolNode> = {}
  const rootNodeIds: string[] = []

  // Normalize indentation: tabs → 2 spaces, so both indent styles work
  const lines = text.split('\n').map(l => l.replace(/\t/g, '  '))
  const stack: Array<{ id: string; depth: number }> = []

  for (const rawLine of lines) {
    const imgMatch = rawLine.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (imgMatch && stack.length > 0) {
      const parentNodeId = stack[stack.length - 1].id
      const parentNode = nodes[parentNodeId]
      if (parentNode) {
        if (!parentNode.images) parentNode.images = []
        parentNode.images.push({
          type: 'parasiticMedium',
          data: { v: 1, type: 'image', src: imgMatch[2] },
        })
      }
      continue
    }

    const match = rawLine.match(/^( *)(- )?/)
    if (!match) continue

    const indentStr = match[1] || ''
    const isItem = !!match[2]
    const depth = isItem ? Math.floor(indentStr.length / 2) + 1 : (indentStr.length > 0 ? Math.floor(indentStr.length / 2) + 1 : 0)

    const content = isItem
      ? rawLine.slice(indentStr.length + 2).trim()
      : rawLine.trim()

    if (!content) continue

    const id = generateNodeId()

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }

    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null

    // Store content as-is (HTML pass-through, no conversion)
    nodes[id] = {
      id,
      content,
      childrenIds: [],
      expanded: 1,
      completed: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as NolNode

    if (parentId && nodes[parentId]) {
      nodes[parentId].childrenIds.push(id)
    } else {
      rootNodeIds.push(id)
    }

    stack.push({ id, depth })
  }

  return { version: 1, nodes, rootNodeIds }
}

// ---------------------------------------------------------------------------
// Shared format description (used in formatHint + FormatWriteError hints)
// ---------------------------------------------------------------------------

const NOL_HTML_TAGS =
  '<strong>bold</strong>, <em>italic</em>, <u>underline</u>, <del>strikethrough</del>, '
  + '<span style="color: #hex">colored</span>, <span style="background-color: rgba(...)">highlighted</span>, '
  + '<a href="..." data-ns-from-auto-link="false" rel="noreferrer noopener" target="_blank">link</a>'

const NOL_OUTLINE_EXAMPLE =
  'Title\n'
  + '  - <strong>bold</strong> and <em>italic</em>\n'
  + '  - <span style="color: #e74c3c">red text</span> and <span style="background-color: rgba(255,235,59,0.6)">highlight</span>\n'
  + '  - <a href="https://example.com" data-ns-from-auto-link="false" rel="noreferrer noopener" target="_blank">link</a>\n'
  + '    - Nested item\n'
  + '  ![](vfs://assets/image.png)'

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const nolHandler: FormatHandler = {
  extension: 'nol',
  label: 'Outline Notes',
  binaryMode: true,
  formatHint:
    'This is an Outline Notes file (.nol) — a ZIP archive containing an indented outline tree with optional embedded media. '
    + 'To write or edit, provide the same indented text format shown above. '
    + 'Root line is the title. Indented lines with "- " prefix are child nodes. '
    + 'Node content is raw HTML. Common tags: '
    + NOL_HTML_TAGS + '. '
    + 'Preserve all HTML tags and attributes exactly as shown. '
    + 'Images: use ![](vfs://assets/xxx.png) for new images, '
    + '![](media/xxx.jpg) to preserve existing images. '
    + 'Do NOT use JSON — only plain indented text.',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    const unzipped = unzipSync(input)

    for (const [name, content] of Object.entries(unzipped)) {
      if (name === 'data') {
        const raw = new TextDecoder('utf-8', { fatal: false }).decode(content)

        let parsed: NolData
        try {
          parsed = JSON.parse(raw)
        } catch {
          return { content: raw, kind: 'nol' }
        }

        if (parsed.nodes && parsed.rootNodeIds && typeof parsed.nodes === 'object') {
          const nodes = parsed.nodes as Record<string, NolNode>
          const rootIds = parsed.rootNodeIds as string[]

          const lines: string[] = []
          for (let i = 0; i < rootIds.length; i++) {
            if (i > 0) lines.push('')
            lines.push(...renderNodeTree(rootIds[i], nodes, 0))
          }
          return {
            content: lines.join('\n'),
            kind: 'nol',
            metadata: {
              totalEntries: Object.keys(unzipped).filter(n => !n.endsWith('/')).length,
            },
          }
        }

        return { content: raw, kind: 'nol' }
      }
    }

    return { content: '', kind: 'nol' }
  },

  async write(content: string, path: string, context: FormatWriteContext): Promise<ArrayBuffer> {
    const trimmed = content.trim()

    if (trimmed.startsWith('{')) {
      throw new FormatWriteError(
        'JSON input is not supported for .nol files.',
        'Use the same indented outline text format that read() outputs:\n\n'
        + NOL_OUTLINE_EXAMPLE + '\n\n'
        + 'Node content is raw HTML. Common tags: ' + NOL_HTML_TAGS + '\n'
        + 'Preserve all tags and attributes exactly as shown.\n'
        + 'Images: ![](vfs://assets/xxx.png) on a separate line after the node.'
      )
    }

    const lines = trimmed.split('\n')
    const nonEmpty = lines.filter(l => l.trim())
    if (nonEmpty.length === 0) {
      throw new FormatWriteError(
        'Content is empty.',
        'Provide an outline using indentation:\n\n'
        + NOL_OUTLINE_EXAMPLE
      )
    }

    const nolData = parseOutlineToNolData(content)

    if (!nolData.version) nolData.version = 1
    if (!nolData.slide) nolData.slide = { bg: '' }

    const zipEntries: Record<string, Uint8Array> = {}

    zipEntries['data'] = new TextEncoder().encode(JSON.stringify(nolData, null, 2))
    zipEntries['media/'] = new Uint8Array(0)

    for (const node of Object.values(nolData.nodes)) {
      if (!node.images) continue
      for (const img of node.images) {
        const src = img.data?.src
        if (!src) continue

        let imageData: Uint8Array | null = null
        let mediaFileName: string

        if (src.startsWith('vfs://assets/')) {
          const assetPath = src.slice('vfs://assets/'.length)
          if (context.readAsset) {
            imageData = await context.readAsset(assetPath)
          }
          mediaFileName = assetPath.split('/').pop() || `image_${generateNodeId().slice(0, 8)}.jpg`
        } else if (src.startsWith('media/')) {
          if (context.readOriginalFile) {
            const originalData = await context.readOriginalFile()
            if (originalData) {
              try {
                const originalZip = unzipSync(originalData)
                const existingImage = originalZip[src]
                if (existingImage) {
                  zipEntries[src] = existingImage
                }
              } catch { /* skip */ }
            }
          }
          img.data = { v: 1, type: 'image', relativePath: `../${src}`, bundled: true }
          if (!img.width) img.width = 300
          continue
        } else if (src.includes('/') && !src.startsWith('http')) {
          if (context.readWorkspaceFile) {
            imageData = await context.readWorkspaceFile(src)
          }
          mediaFileName = src.split('/').pop() || `image_${generateNodeId().slice(0, 8)}.jpg`
        } else {
          continue
        }

        if (imageData) {
          const uuid = crypto.randomUUID()
          // Detect image format from binary header to set correct extension
          const ext = (imageData[0] === 0x89 && imageData[1] === 0x50) ? '.png'
            : (imageData[0] === 0xFF && imageData[1] === 0xD8) ? '.jpg'
            : (imageData[0] === 0x47 && imageData[1] === 0x49) ? '.gif'
            : (imageData[0] === 0x52 && imageData[1] === 0x49) ? '.webp'
            : '.jpg'
          mediaFileName = `image-${uuid}${ext}`
          const mediaPath = `media/${mediaFileName}`
          zipEntries[mediaPath] = imageData
          img.data = { v: 1, type: 'image', relativePath: `../${mediaPath}`, bundled: true }
          if (!img.width) img.width = 300
        }
      }
    }

    zipEntries['data'] = new TextEncoder().encode(JSON.stringify(nolData, null, 2))

    const zipped = zipSync(zipEntries)
    return zipped.buffer as ArrayBuffer
  },
}
