/**
 * SEP-1306: Binary Mode Elicitation Handler
 *
 * Handles file upload elicitation from MCP servers.
 *
 * When an MCP tool response contains _meta.elicitation with mode='binary',
 * this handler:
 * 1. Tries to read the file from OPFS using the path from tool arguments
 * 2. Uploads the file to the server's upload endpoint
 * 3. Returns the file metadata to be passed back to the AI
 * 4. If file not found in OPFS, throws an error for the AI to correct the filename
 *
 * Usage:
 * ```ts
 * const handler = new ElicitationHandler()
 * if (await handler.hasElicitation(response)) {
 *   const metadata = await handler.handleBinaryElicitation(response, context)
 *   // Pass metadata back to AI as tool result
 * }
 * ```
 */

import type {
  BinaryElicitation,
  FileMetadata,
  UploadEndpoint,
  FileSchemaProperty,
  ElicitationSchema,
} from './mcp-types'

//=============================================================================
// Type Aliases (avoid JSX parsing issues in ts with jsx mode)
//=============================================================================

// Type alias for results containing binary elicitation
type BinaryElicitationResult = { _meta: { elicitation: BinaryElicitation } }

// Type alias for Promise return types (avoid angle brackets in return position)
type FileMetadataPromise = Promise<FileMetadata>

// Type alias for file field result
type FileFieldResult = { name: string; config: FileSchemaProperty } | null

//=============================================================================
// OPFS File Helper
//=============================================================================

/**
 * Helper to get file handle from directory handle by path.
 *
 * Returns a File object that has been converted to Blob to preserve
 * binary data correctly (avoiding OPFS string conversion issues).
 *
 * Copied from file-upload.tool.ts with binary data preservation.
 */
async function getFileHandleFromOPFS(
  directoryHandle: FileSystemDirectoryHandle,
  path: string
): Promise<File | null> {
  const parts = path.split('/').filter(Boolean)
  let current: FileSystemDirectoryHandle | FileSystemFileHandle = directoryHandle

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (i === parts.length - 1) {
      // Last part - should be a file
      try {
        const fileHandle = await (current as FileSystemDirectoryHandle).getFileHandle(part)
        const file = await fileHandle.getFile()

        // IMPORTANT: Convert to ArrayBuffer and back to File/Blob to preserve binary data
        // OPFS getFile() may return string content for text files, which corrupts binary files
        const arrayBuffer = await file.arrayBuffer()
        const blob = new Blob([arrayBuffer], { type: file.type || 'application/octet-stream' })

        // Create a new File object from the blob with correct name
        return new File([blob], file.name, { type: blob.type })
      } catch {
        return null
      }
    } else {
      // Directory
      try {
        current = await (current as FileSystemDirectoryHandle).getDirectoryHandle(part)
      } catch {
        return null
      }
    }
  }

  return null
}

//=============================================================================
// Elicitation Handler Class
//=============================================================================

export interface ElicitationContext {
  /** Tool arguments that AI passed (may contain file path) */
  toolArgs?: Record<string, unknown>
  /** Directory handle for OPFS access */
  directoryHandle?: FileSystemDirectoryHandle | null
}

export class ElicitationHandler {
  /**
   * Check if a tool response contains a binary elicitation request
   */
  hasBinaryElicitation(result: unknown): result is BinaryElicitationResult {
    if (!result || typeof result !== 'object') {
      return false
    }

    const r = result as any

    // FastMCP wraps result in an extra layer
    const actualResult = r.result || r

    // Check for _meta.elicitation with mode='binary'
    return actualResult?._meta?.elicitation?.mode === 'binary'
  }

  /**
   * Extract the binary elicitation data from a tool response
   */
  extractBinaryElicitation(result: unknown): BinaryElicitation | null {
    if (!this.hasBinaryElicitation(result)) {
      return null
    }

    const r = result as any
    const actualResult = r.result || r

    // Get elicitation from either wrapper or direct
    const elicitation = actualResult._meta?.elicitation || actualResult?._meta?.elicitation

    if (elicitation.mode !== 'binary') {
      return null
    }

    return elicitation as BinaryElicitation
  }

  /**
   * Handle a binary elicitation request
   *
   * Strategy:
   * 1. Try to read file from OPFS using path from tool arguments
   * 2. If file not found, throw error for LLM to correct the filename
   *
   * @param elicitation - The binary elicitation data
   * @param context - Elicitation context with tool args and directory handle
   * @param authToken - Optional auth token for the upload request
   * @returns File metadata to be passed back to the AI
   */
  async handleBinaryElicitation(
    elicitation: BinaryElicitation,
    context: ElicitationContext,
    authToken?: string
  ): FileMetadataPromise {
    // Find the file field in the schema
    const fileField = this.findFileField(elicitation.requestedSchema)

    if (!fileField) {
      throw new Error('No file field found in elicitation schema')
    }

    const uploadEndpoint = elicitation.uploadEndpoints[fileField.name]

    if (!uploadEndpoint) {
      throw new Error(`No upload endpoint found for field: ${fileField.name}`)
    }

    // Try to get file from OPFS using download_url from tool arguments
    if (context.toolArgs && context.directoryHandle) {
      const pathValue = this.extractFilePathFromArgs(context.toolArgs, fileField.name)

      if (pathValue) {
        const file = await getFileHandleFromOPFS(context.directoryHandle, pathValue)

        if (file) {
          // Upload file to server
          const metadata = await this.uploadFile(file, uploadEndpoint, authToken)
          return metadata
        } else {
          // File not found - throw error so LLM can correct the filename
          throw new Error(
            `文件不存在: ${pathValue}\n\n请确认文件名是否正确，当前工作目录中可用的文件可以通过 list_files 工具查看。`
          )
        }
      } else {
        throw new Error('无法从工具参数中提取文件路径')
      }
    } else {
      throw new Error('无法读取文件：缺少必要的上下文信息 (toolArgs 或 directoryHandle)')
    }
  }

  /**
   * Extract file path from tool arguments
   *
   * ChatGPT/MCP convention:
   * - File fields are object type with download_url and file_id properties
   * - AI passes: { fieldName: { download_url: "path/to/file", file_id: "..." } }
   *
   * Example:
   * - Schema: { spreadsheet_file: { type: "object", properties: { download_url: {...}, file_id: {...} } } }
   * - ToolArgs: { spreadsheet_file: { download_url: "data/sales.xlsx", file_id: "abc123" } }
   * - Result: "data/sales.xlsx" (extract from download_url)
   */
  private extractFilePathFromArgs(
    args: Record<string, unknown>,
    fileFieldName: string
  ): string | null {
    const fieldValue = args[fileFieldName]

    // File field is an object with download_url/file_id properties (ChatGPT/MCP convention)
    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
      const fileObj = fieldValue as Record<string, unknown>
      const downloadUrl = fileObj.download_url as string | undefined

      if (downloadUrl && downloadUrl.length > 0) {
        // If download_url is HTTP URL, file is on server
        if (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://')) {
          return null
        }
        return downloadUrl
      }
    }

    // Legacy: direct string value (for non-ChatGPT MCP servers)
    if (typeof fieldValue === 'string' && fieldValue.length > 0) {
      if (fieldValue.startsWith('http://') || fieldValue.startsWith('https://')) {
        return null
      }
      return fieldValue
    }

    return null
  }

  /**
   * Find a file-type property in the schema
   *
   * ChatGPT/MCP convention:
   * - File field is object type with nested properties containing download_url and file_id
   * - Example: { spreadsheet_file: { type: "object", properties: { download_url: {...}, file_id: {...} } } }
   */
  private findFileField(schema: ElicitationSchema): FileFieldResult {
    const properties = schema.properties || {}

    for (const [name, prop] of Object.entries(properties)) {
      if (prop && typeof prop === 'object') {
        const propObj = prop as any

        // Check if this is a file field:
        // 1. type='object' with download_url/file_id properties inside
        // 2. OR legacy type='file'
        const isObjectFileField =
          propObj.type === 'object' &&
          propObj.properties &&
          (propObj.properties.download_url || propObj.properties.file_id)

        const isLegacyFileField = propObj.type === 'file'

        if (isObjectFileField || isLegacyFileField) {
          return {
            name,
            config: prop as FileSchemaProperty,
          }
        }
      }
    }

    return null
  }

  /**
   * Upload file to the server's upload endpoint
   */
  private async uploadFile(
    file: File,
    endpoint: UploadEndpoint,
    authToken?: string
  ): FileMetadataPromise {
    const formData = new FormData()
    formData.append('file', file)

    const headers: Record<string, string> = {}
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }

    // Create abort controller with timeout (30 seconds)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method || 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()

      // Return metadata in SEP-1306 format
      return {
        name: data.name || file.name,
        size: data.size || file.size,
        mimeType: data.mimeType || file.type || 'application/octet-stream',
        uploadId: data.uploadId || endpoint.uploadId,
        // Additional fields for tool usage
        file_id: data.file_id,
        download_url: data.download_url,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('文件上传超时（30秒），请检查网络连接或稍后重试')
      }
      throw error
    }
  }

  /**
   * Convert file metadata to a user message format
   *
   * This can be appended to the conversation as a "user uploaded a file" message
   */
  metadataToUserMessage(metadata: FileMetadata, toolName?: string): string {
    const parts = [
      `📎 File uploaded: ${metadata.name}`,
      `Size: ${(metadata.size / 1024).toFixed(1)} KB`,
    ]

    if (toolName) {
      parts.push(`For tool: ${toolName}`)
    }

    parts.push(`\nFile metadata (for tool reference):`)
    parts.push(`\`\`\`json`)
    parts.push(JSON.stringify(metadata, null, 2))
    parts.push(`\`\`\``)

    return parts.join('\n')
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let handlerInstance: ElicitationHandler | null = null

export function getElicitationHandler(): ElicitationHandler {
  if (!handlerInstance) {
    handlerInstance = new ElicitationHandler()
  }
  return handlerInstance
}
