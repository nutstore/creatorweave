/**
 * File Predictor - Predicts files user will need based on conversation context.
 *
 * Goals:
 * - Predict files before user explicitly requests them
 * - Reduce file access latency to <100ms
 * - Smart pattern matching for file references
 *
 * Architecture:
 * 1. FileReferenceExtractor - Extract file paths from messages
 * 2. RelatedFileResolver - Find related files (imports, components, etc.)
 * 3. PrefetchQueue - Prioritized prefetch queue
 * 4. PredictionScorer - Score predictions by relevance
 */

import type { FileSystemDirectoryHandle } from '@/opfs/types/file-system-types'

//=============================================================================
// Types
//=============================================================================

/** File prediction with confidence score */
export interface FilePrediction {
  /** Predicted file path */
  path: string
  /** Confidence score (0-1) */
  confidence: number
  /** Reason for prediction */
  reason: 'explicit-reference' | 'import-reference' | 'pattern-match' | 'related-file'
  /** Source context */
  context: string
}

/** Prediction context */
export interface PredictionContext {
  /** Current directory handle */
  directoryHandle?: FileSystemDirectoryHandle | null
  /** Recent user messages */
  recentMessages: string[]
  /** Recently accessed files */
  recentFiles: string[]
  /** Project type for better predictions */
  projectType?: string
  /** Current active file */
  activeFile?: string
}

/** File reference extracted from text */
interface FileReference {
  path: string
  startIndex: number
  endIndex: number
  type: 'explicit' | 'implicit' | 'pattern'
}

//=============================================================================
// File Reference Extractor
//=============================================================================

/**
 * Extract file references from text
 * Handles: paths, imports, component references, patterns
 */
class FileReferenceExtractor {
  // File path patterns
  private readonly PATH_PATTERNS = [
    // Quoted paths: "src/App.tsx", './components/Button'
    /["']([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)["']/g,
    // Markdown links: [text](path/to/file.ts)
    /\]\(([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\)/g,
    // Explicit file mentions: file App.tsx, the file config.json
    /file\s+([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/gi,
    // At-mentions: @src/components/Header
    /@([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/g,
  ]

  // Import statement patterns
  private readonly IMPORT_PATTERNS = [
    // ES6 imports: import ... from './path'
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?["']([^"']+)["']/g,
    // CommonJS: require('./path')
    /require\(["']([^"']+)["']\)/g,
    // TypeScript references: /// <reference path="..." />
    /\/\/\/\s*<reference\s+path=["']([^"']+)["']\s*\/>/g,
  ]

  // Component/class name patterns (for related file resolution)
  private readonly NAME_PATTERNS = [
    // Component references: <Button />, <Header />
    /<([A-Z][a-zA-Z0-9]*)\s*\/?>/g,
    // Class references: new AuthService(), UserContext
    /(?:new\s+)?([A-Z][a-zA-Z0-9]*)\b/g,
  ]

  /**
   * Extract all file references from text
   */
  extract(text: string): FileReference[] {
    const references: FileReference[] = []
    const seen = new Set<string>()

    // Extract path patterns
    for (const pattern of this.PATH_PATTERNS) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const path = match[1]
        // Normalize path
        const normalized = this.normalizePath(path)
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized)
          references.push({
            path: normalized,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            type: 'explicit',
          })
        }
      }
    }

    // Extract import patterns
    for (const pattern of this.IMPORT_PATTERNS) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const path = match[1]
        const normalized = this.normalizeImportPath(path)
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized)
          references.push({
            path: normalized,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            type: 'implicit',
          })
        }
      }
    }

    return references
  }

  /**
   * Extract component/class names for related file resolution
   */
  extractNames(text: string): string[] {
    const names: string[] = []
    const seen = new Set<string>()

    for (const pattern of this.NAME_PATTERNS) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]
        if (name.length > 2 && !seen.has(name)) {
          seen.add(name)
          names.push(name)
        }
      }
    }

    return names
  }

  /**
   * Normalize file path
   */
  private normalizePath(path: string): string | null {
    // Remove leading ./ if present
    let normalized = path.replace(/^\.\//, '')

    // Remove leading / if present (relative to project root)
    normalized = normalized.replace(/^\//, '')

    // Filter out invalid patterns
    if (normalized.includes('http:') || normalized.includes('https:')) {
      return null
    }

    if (normalized.length < 3) {
      return null
    }

    return normalized
  }

  /**
   * Normalize import path (handle relative paths)
   */
  private normalizeImportPath(path: string): string | null {
    // Handle node_modules imports - skip
    if (!path.startsWith('.') && !path.startsWith('/')) {
      return null
    }

    const normalized = path

    // Resolve relative segments
    const parts = normalized.split('/')
    const resolved: string[] = []

    for (const part of parts) {
      if (part === '..') {
        resolved.pop()
      } else if (part !== '.') {
        resolved.push(part)
      }
    }

    return resolved.join('/') || null
  }
}

//=============================================================================
// Related File Resolver
//=============================================================================

/**
 * Resolve related files based on context
 * Handles: component files, test files, config files
 */
class RelatedFileResolver {
  // Note: RELATED_PATTERNS reserved for future pattern-based file discovery
  // @ts-expect-error - reserved for future use
  private readonly RELATED_PATTERNS = {
    // TypeScript/React
    ts: ['.ts', '.tsx'],
    js: ['.js', '.jsx'],
    components: ['.tsx', '.jsx', '.vue', '.svelte'],
    // Styles
    styles: ['.css', '.scss', '.sass', '.less', '.styl'],
    // Tests
    tests: ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '_test.ts', '_test.tsx'],
    // Config
    configs: ['.config.ts', '.config.js', '.config.json', 'rc', '.json'],
  }

  /**
   * Find related files for a component/class name
   */

  /**
   * Find related files for a component/class name
   */
  async findRelatedFiles(
    name: string,
    projectType: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<string[]> {
    const related: string[] = []

    // Common project-specific patterns
    if (projectType === 'react' || projectType === 'typescript') {
      // Component files
      related.push(
        `src/components/${name}/${name}.tsx`,
        `src/components/${name}.tsx`,
        `src/components/${name}/index.tsx`,
        `src/${name}.tsx`,
        `${name}.tsx`
      )

      // Hook files
      if (name.startsWith('use')) {
        related.push(`src/hooks/${name}.ts`, `src/hooks/${name}.tsx`)
      }
    }

    if (projectType === 'vue') {
      related.push(`src/components/${name}.vue`, `src/${name}.vue`)
    }

    // Test files
    related.push(
      `src/${name}.test.ts`,
      `src/${name}.test.tsx`,
      `src/__tests__/${name}.test.ts`,
      `${name}.test.ts`
    )

    // Filter to existing files if directory handle provided
    if (directoryHandle) {
      const existing: string[] = []
      for (const path of related) {
        if (await this.fileExists(path, directoryHandle)) {
          existing.push(path)
        }
      }
      return existing
    }

    return related
  }

  /**
   * Find config files based on project type
   */
  getConfigFiles(projectType: string): string[] {
    const configs: string[] = []

    // Common configs
    configs.push('package.json', 'tsconfig.json', '.gitignore')

    // Project-specific
    switch (projectType) {
      case 'react':
      case 'typescript':
        configs.push('vite.config.ts', 'next.config.js', 'tsconfig.json')
        break
      case 'vue':
        configs.push('vue.config.js', 'vite.config.ts')
        break
      case 'python':
        configs.push('requirements.txt', 'setup.py', 'pyproject.toml')
        break
      case 'rust':
        configs.push('Cargo.toml', 'Cargo.lock')
        break
      case 'go':
        configs.push('go.mod', 'go.sum')
        break
    }

    return configs
  }

  /**
   * Check if file exists
   */
  private async fileExists(
    path: string,
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<boolean> {
    try {
      const parts = path.split('/')
      let current = directoryHandle

      for (let i = 0; i < parts.length - 1; i++) {
        if (!parts[i]) continue
        try {
          current = await current.getDirectoryHandle(parts[i])
        } catch {
          return false
        }
      }

      const fileName = parts[parts.length - 1]
      await current.getFileHandle(fileName)
      return true
    } catch {
      return false
    }
  }
}

//=============================================================================
// Prediction Scorer
//=============================================================================

/**
 * Score file predictions by relevance
 */
class PredictionScorer {
  /**
   * Score a prediction based on context
   */
  score(
    path: string,
    referenceType: 'explicit' | 'implicit' | 'pattern',
    context: PredictionContext
  ): number {
    let score = 0

    // Base score by reference type
    switch (referenceType) {
      case 'explicit':
        score += 0.8
        break
      case 'implicit':
        score += 0.5
        break
      case 'pattern':
        score += 0.3
        break
    }

    // Boost for recently accessed files (recency bias)
    if (context.recentFiles.includes(path)) {
      score += 0.2
    }

    // Boost for files in common directories
    if (this.isCommonDirectory(path)) {
      score += 0.1
    }

    // Boost for config files
    if (this.isConfigFile(path)) {
      score += 0.15
    }

    // Boost if related to active file
    if (context.activeFile && this.areRelated(path, context.activeFile)) {
      score += 0.2
    }

    return Math.min(score, 1.0)
  }

  /**
   * Check if path is in a common directory
   */
  private isCommonDirectory(path: string): boolean {
    const commonDirs = ['src', 'components', 'lib', 'utils', 'hooks', 'services', 'store']
    return commonDirs.some((dir) => path.startsWith(dir + '/'))
  }

  /**
   * Check if file is a config file
   */
  private isConfigFile(path: string): boolean {
    const name = path.split('/').pop() || ''
    return (
      name.includes('config') ||
      name.endsWith('.json') ||
      name.endsWith('.yaml') ||
      name.endsWith('.yml') ||
      name.startsWith('.') ||
      name === 'package.json' ||
      name === 'tsconfig.json'
    )
  }

  /**
   * Check if two files are related
   */
  private areRelated(path1: string, path2: string): boolean {
    const dir1 = path1.substring(0, path1.lastIndexOf('/')) || ''
    const dir2 = path2.substring(0, path2.lastIndexOf('/')) || ''

    // Same directory
    if (dir1 === dir2) return true

    // Test file vs source file
    if (path1.includes('.test.') || path1.includes('.spec.')) {
      const baseName = path2.replace(/\.(test|spec)\./, '.')
      return path1.replace(/\.(test|spec)\./, '.') === baseName
    }

    if (path2.includes('.test.') || path2.includes('.spec.')) {
      const baseName = path1.replace(/\.(test|spec)\./, '.')
      return path2.replace(/\.(test|spec)\./, '.') === baseName
    }

    return false
  }
}

//=============================================================================
// File Predictor
//=============================================================================

export class FilePredictor {
  private extractor: FileReferenceExtractor
  private resolver: RelatedFileResolver
  private scorer: PredictionScorer
  private predictionCache: Map<string, FilePrediction[]> = new Map()
  private cacheTimestamp: number = 0
  private readonly CACHE_TTL = 30000 // 30 seconds

  constructor() {
    this.extractor = new FileReferenceExtractor()
    this.resolver = new RelatedFileResolver()
    this.scorer = new PredictionScorer()
  }

  /**
   * Predict files based on conversation context
   */
  async predict(context: PredictionContext): Promise<FilePrediction[]> {
    const predictions: FilePrediction[] = []
    const seen = new Set<string>()

    // Process recent messages
    for (const message of context.recentMessages) {
      // Extract file references
      const references = this.extractor.extract(message)
      for (const ref of references) {
        if (!seen.has(ref.path)) {
          seen.add(ref.path)
          const score = this.scorer.score(ref.path, ref.type, context)
          predictions.push({
            path: ref.path,
            confidence: score,
            reason: ref.type === 'explicit' ? 'explicit-reference' : 'pattern-match',
            context: message.substring(ref.startIndex, ref.endIndex),
          })
        }
      }

      // Extract component names for related file resolution
      const names = this.extractor.extractNames(message)
      for (const name of names) {
        const relatedFiles = await this.resolver.findRelatedFiles(
          name,
          context.projectType || 'typescript',
          context.directoryHandle || undefined
        )
        for (const path of relatedFiles) {
          if (!seen.has(path)) {
            seen.add(path)
            const score = this.scorer.score(path, 'pattern', context)
            predictions.push({
              path,
              confidence: score * 0.7, // Lower confidence for related files
              reason: 'related-file',
              context: name,
            })
          }
        }
      }
    }

    // Add config files for new conversations
    if (context.recentFiles.length < 3) {
      const configFiles = this.resolver.getConfigFiles(context.projectType || 'typescript')
      for (const path of configFiles) {
        if (!seen.has(path)) {
          seen.add(path)
          predictions.push({
            path,
            confidence: 0.4,
            reason: 'pattern-match',
            context: 'project config',
          })
        }
      }
    }

    // Sort by confidence and limit results
    const sorted = predictions.sort((a, b) => b.confidence - a.confidence)
    return sorted.slice(0, 20) // Max 20 predictions
  }

  /**
   * Get prediction with caching
   */
  async predictWithCache(context: PredictionContext): Promise<FilePrediction[]> {
    const cacheKey = this.getCacheKey(context)
    const now = Date.now()

    // Check cache
    if (now - this.cacheTimestamp < this.CACHE_TTL && this.predictionCache.has(cacheKey)) {
      return this.predictionCache.get(cacheKey)!
    }

    // Generate predictions
    const predictions = await this.predict(context)

    // Update cache
    this.predictionCache.set(cacheKey, predictions)
    this.cacheTimestamp = now

    return predictions
  }

  /**
   * Clear prediction cache
   */
  clearCache(): void {
    this.predictionCache.clear()
    this.cacheTimestamp = 0
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: PredictionContext): string {
    // Use last message as primary key
    const lastMessage = context.recentMessages[context.recentMessages.length - 1] || ''
    return `${context.projectType}:${context.activeFile}:${lastMessage.slice(0, 50)}`
  }
}

//=============================================================================
// Singleton
//=============================================================================

let instance: FilePredictor | null = null

export function getFilePredictor(): FilePredictor {
  if (!instance) {
    instance = new FilePredictor()
  }
  return instance
}
