/**
 * Skill Resources - 资源文件处理模块
 *
 * Handles scanning, storing, and formatting of skill resource files
 * from references/, scripts/, and assets/ directories.
 */

import type { SkillResource, ResourceType } from './skill-types'
import { RESOURCE_LIMITS } from './skill-types'

// ============================================================================
// Resource Type Detection
// ============================================================================

/** Get resource type from directory name */
export function getResourceType(dirName: string): ResourceType {
  if (dirName === 'references') return 'reference'
  if (dirName === 'scripts') return 'script'
  return 'asset'
}

/** Get MIME type from filename */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const mimeTypes: Record<string, string> = {
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    text: 'text/plain',
    py: 'text/x-python',
    python: 'text/x-python',
    js: 'text/javascript',
    javascript: 'text/javascript',
    ts: 'text/typescript',
    typescript: 'text/typescript',
    sh: 'text/x-shellscript',
    bash: 'text/x-shellscript',
    json: 'application/json',
    yaml: 'text/x-yaml',
    yml: 'text/x-yaml',
    xml: 'text/xml',
    html: 'text/html',
    css: 'text/css',
    scss: 'text/x-scss',
    less: 'text/x-less',
  }
  return mimeTypes[ext] || 'text/plain'
}

// ============================================================================
// Resource Formatting
// ============================================================================

/** Format resource list for read_skill output */
export function formatResourceList(resources: SkillResource[]): string {
  if (resources.length === 0) return ''

  // Group by resource type
  const byType = new Map<ResourceType, SkillResource[]>()
  for (const r of resources) {
    if (!byType.has(r.resourceType)) {
      byType.set(r.resourceType, [])
    }
    byType.get(r.resourceType)!.push(r)
  }

  let output = '\n\nAvailable Resources:\n'
  for (const [type, items] of byType.entries()) {
    output += `\n#### ${type}\n`
    for (const item of items) {
      output += `- ${item.resourcePath} (${item.size} bytes)\n`
    }
  }
  output += '\nUse read_skill_resource to load any resource.'

  return output
}

// ============================================================================
// Resource Size Formatting
// ============================================================================

/** Format file size in human-readable format */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================================
// Resource Validation
// ============================================================================

/** Check if resource file size is within limits */
export function isResourceSizeValid(size: number): boolean {
  return size <= RESOURCE_LIMITS.MAX_FILE_SIZE
}

/** Check if resource count is within limits */
export function isResourceCountValid(count: number): boolean {
  return count <= RESOURCE_LIMITS.MAX_RESOURCES_PER_SKILL
}

/** Check if total size is within limits */
export function isTotalSizeValid(totalSize: number): boolean {
  return totalSize <= RESOURCE_LIMITS.MAX_TOTAL_SIZE
}

/** Get resource validation error message */
export function getResourceValidationError(
  type: 'size' | 'count' | 'total',
  actual: number,
  limit: number
): string {
  const formattedLimit = formatSize(limit)
  const formattedActual = formatSize(actual)

  switch (type) {
    case 'size':
      return `Resource file too large: ${formattedActual} (max: ${formattedLimit})`
    case 'count':
      return `Too many resource files: ${actual} (max: ${limit})`
    case 'total':
      return `Total resources too large: ${formattedActual} (max: ${formattedLimit})`
  }
}

// ============================================================================
// Resource ID Generation
// ============================================================================

/** Generate resource ID from skill ID and resource path */
export function generateResourceId(skillId: string, resourcePath: string): string {
  return `${skillId}:${resourcePath}`
}

/** Parse resource ID into components */
export function parseResourceId(id: string): { skillId: string; resourcePath: string } | null {
  const colonIndex = id.indexOf(':')
  if (colonIndex <= 0) return null

  return {
    skillId: id.slice(0, colonIndex),
    resourcePath: id.slice(colonIndex + 1),
  }
}
