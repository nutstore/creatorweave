/**
 * OCR Tool — provides on-demand OCR (text recognition) for images.
 *
 * Reuses the same Tesseract.js service that powers the upload OCR pipeline.
 * The agent can call this tool on any image in the workspace or assets directory
 * to extract text content.
 *
 * Supports:
 * - Workspace relative paths (e.g. "path/to/image.png")
 * - VFS paths: vfs://workspace/..., vfs://assets/...
 * - Auto-detects image MIME types and rejects non-image files
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc, ToolContext } from './tool-types'
import { resolveVfsTarget } from './vfs-resolver'
import { performOcr, isOcrCompatibleImage } from '@/services/ocr.service'
import { toolOkJson, toolErrorJson } from './tool-envelope'

//=============================================================================
// OCR Tool Definition
//=============================================================================

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif',
])

function isImageFile(path: string, mimeType: string): boolean {
  // Check MIME type first
  if (isOcrCompatibleImage(mimeType)) return true
  // Fallback: check file extension
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext)
}

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  }
  return map[ext] ?? 'application/octet-stream'
}

export const ocrDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ocr',
    description:
      'Perform OCR (optical character recognition) on an image file to extract text content. ' +
      'Supports PNG, JPEG, WebP, BMP, and GIF images. Uses Tesseract.js with Chinese + English recognition. ' +
      'Works with workspace relative paths and vfs://assets/... paths.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Path to the image file. Supports workspace relative paths (e.g. "photos/scan.png"), ' +
            'vfs://workspace/... for workspace files, or vfs://assets/... for uploaded asset files.',
        },
      },
      required: ['path'],
    },
  },
}

//=============================================================================
// OCR Tool Executor
//=============================================================================

export const ocrExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> => {
  const path = args.path as string | undefined
  if (!path) {
    return toolErrorJson('ocr', 'invalid_arguments', 'path is required')
  }

  try {
    // Resolve the VFS target (workspace, assets, or agent)
    const target = await resolveVfsTarget(path, context, 'read')

    // Read the file as binary
    const result = await target.backend.readFile(target.path, { encoding: 'binary' })
    const binaryContent = result.content as ArrayBuffer | Uint8Array

    // Determine MIME type
    const mimeType = result.mimeType || inferMimeType(target.path)

    // Validate it's an image
    if (!isImageFile(target.path, mimeType)) {
      return toolErrorJson(
        'ocr',
        'not_an_image',
        `File is not a supported image format (${mimeType}). ` +
          'Supported formats: PNG, JPEG, WebP, BMP, GIF.',
        { details: { path: target.path, mimeType } },
      )
    }

    // Convert binary data to a File object (required by performOcr)
    const uint8 = binaryContent instanceof Uint8Array
      ? binaryContent
      : new Uint8Array(binaryContent)
    const fileName = target.path.split('/').pop() || 'image.png'
    const file = new File([uint8], fileName, { type: mimeType })

    // Perform OCR using the shared service
    const ocrResult = await performOcr(file)

    if (ocrResult.status === 'failed' || ocrResult.status === 'timeout') {
      return toolErrorJson(
        'ocr',
        'ocr_failed',
        `OCR failed: ${ocrResult.error || 'Unknown error'}`,
        {
          retryable: ocrResult.status === 'timeout',
          details: {
            path: target.path,
            status: ocrResult.status,
            duration: ocrResult.duration,
          },
        },
      )
    }

    // Return successful result
    return toolOkJson('ocr', {
      path: target.path,
      text: ocrResult.text,
      mimeType: ocrResult.mimeType,
      status: ocrResult.status,
      duration: ocrResult.duration,
      charCount: ocrResult.text.length,
      lineCount: ocrResult.text ? ocrResult.text.split('\n').length : 0,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)

    if (
      message.includes('File not found') ||
      message.includes('NotFoundError') ||
      message.includes('not found')
    ) {
      return toolErrorJson('ocr', 'file_not_found', `Image file not found: ${path}`)
    }

    return toolErrorJson(
      'ocr',
      'internal_error',
      `OCR failed: ${message}`,
      { retryable: true },
    )
  }
}

//=============================================================================
// Prompt Doc
//=============================================================================

export const ocrPromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  lines: [
    '- `ocr(path)` - Perform OCR on an image file to extract text. Supports workspace paths and `vfs://assets/...` for uploaded images.',
  ],
}
