/**
 * Project Fingerprint Identification - Automatically detect project type and characteristics.
 *
 * Goals:
 * - 90% accuracy in project type detection
 * - Support 15+ project types
 * - Sub-100ms detection time with caching
 *
 * Architecture:
 * 1. FingerprintRules - Define detection patterns for each project type
 * 2. FingerprintScanner - Scan file structure and configuration files
 * 3. FingerprintCache - Cache detection results
 * 4. CapabilityDetector - Detect available tools and frameworks
 */

//=============================================================================
// Types
//=============================================================================

/** Detected project types */
export type ProjectType =
  | 'react'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'nextjs'
  | 'nuxt'
  | 'remix'
  | 'solid'
  | 'node'
  | 'deno'
  | 'bun'
  | 'python'
  | 'django'
  | 'fastapi'
  | 'flask'
  | 'rust'
  | 'go'
  | 'java'
  | 'gradle'
  | 'maven'
  | 'dotnet'
  | 'ruby'
  | 'rails'
  | 'php'
  | 'laravel'
  | 'data-science'
  | 'ml-project'
  | 'monorepo'
  | 'web-extension'
  | 'electron'
  | 'unknown'

/** Language detected in project */
export type ProjectLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'c'
  | 'cpp'
  | 'unknown'

/** Detected framework/library */
export type Framework =
  | 'react'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'solid'
  | 'next'
  | 'nuxt'
  | 'remix'
  | 'express'
  | 'fastify'
  | 'nest'
  | 'django'
  | 'fastapi'
  | 'flask'
  | 'spring'
  | 'laravel'
  | 'rails'
  | 'actix'
  | 'bevy'
  | 'unknown'

/** Testing framework */
export type TestingFramework =
  | 'jest'
  | 'vitest'
  | 'pytest'
  | 'unittest'
  | 'go-test'
  | 'cargo-test'
  | 'junit'
  | 'rspec'
  | 'unknown'

/** Build tool */
export type BuildTool =
  | 'webpack'
  | 'vite'
  | 'rollup'
  | 'esbuild'
  | 'turbopack'
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'bun'
  | 'poetry'
  | 'pip'
  | 'cargo'
  | 'go-build'
  | 'gradle'
  | 'maven'
  | 'dotnet'
  | 'unknown'

/** Complete project fingerprint */
export interface ProjectFingerprint {
  /** Primary project type */
  type: ProjectType
  /** Confidence score (0-1) */
  confidence: number
  /** Primary language(s) */
  languages: ProjectLanguage[]
  /** Detected frameworks */
  frameworks: Framework[]
  /** Testing framework */
  testing: TestingFramework
  /** Build tool */
  buildTool: BuildTool
  /** Package manager */
  packageManager: PackageManager
  /** Key configuration files found */
  configFiles: string[]
  /** Notable directories */
  directories: string[]
  /** Estimated project size (small/medium/large) */
  size: 'small' | 'medium' | 'large'
  /** Has TypeScript */
  hasTypeScript: boolean
  /** Recommended tools for this project */
  recommendedTools: string[]
}

/** Package manager type */
export type PackageManager =
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'bun'
  | 'poetry'
  | 'pip'
  | 'cargo'
  | 'go-modules'
  | 'unknown'

//=============================================================================
// Fingerprint Rules
//=============================================================================

interface FingerprintRule {
  type: ProjectType
  confidence: number
  /** Required files (all must be present) */
  requiredFiles?: string[]
  /** Indicator files (at least one must be present) */
  indicatorFiles?: string[]
  /** Package dependencies */
  packageDeps?: {
    file: string
    deps: string[]
  }[]
  /** Directory patterns */
  directories?: string[]
  /** File extensions to check */
  extensions?: string[]
  /** Content patterns to check */
  contentPatterns?: {
    file: string
    patterns: string[]
  }[]
}

const FINGERPRINT_RULES: FingerprintRule[] = [
  // React ecosystem
  {
    type: 'nextjs',
    confidence: 0.95,
    requiredFiles: ['package.json', 'next.config.js'],
    packageDeps: [{ file: 'package.json', deps: ['next'] }],
  },
  {
    type: 'remix',
    confidence: 0.95,
    requiredFiles: ['package.json', 'remix.config.js'],
    packageDeps: [{ file: 'package.json', deps: ['@remix-run/node'] }],
  },
  {
    type: 'react',
    confidence: 0.85,
    indicatorFiles: ['package.json'],
    packageDeps: [{ file: 'package.json', deps: ['react'] }],
    extensions: ['.jsx', '.tsx'],
  },
  // Vue ecosystem
  {
    type: 'nuxt',
    confidence: 0.95,
    requiredFiles: ['package.json', 'nuxt.config.ts'],
    packageDeps: [{ file: 'package.json', deps: ['nuxt'] }],
  },
  {
    type: 'vue',
    confidence: 0.85,
    indicatorFiles: ['package.json'],
    packageDeps: [{ file: 'package.json', deps: ['vue'] }],
    extensions: ['.vue'],
  },
  // Other frontend
  {
    type: 'angular',
    confidence: 0.95,
    requiredFiles: ['angular.json', 'package.json'],
    packageDeps: [{ file: 'package.json', deps: ['@angular/core'] }],
  },
  {
    type: 'svelte',
    confidence: 0.9,
    indicatorFiles: ['package.json', 'svelte.config.js'],
    packageDeps: [{ file: 'package.json', deps: ['svelte'] }],
    extensions: ['.svelte'],
  },
  {
    type: 'solid',
    confidence: 0.9,
    indicatorFiles: ['package.json'],
    packageDeps: [{ file: 'package.json', deps: ['solid-js'] }],
    extensions: ['.jsx', '.tsx'],
  },
  // Backend
  {
    type: 'node',
    confidence: 0.7,
    indicatorFiles: ['package.json'],
    extensions: ['.js'],
  },
  {
    type: 'deno',
    confidence: 0.95,
    requiredFiles: ['deno.json'],
  },
  {
    type: 'bun',
    confidence: 0.9,
    requiredFiles: ['package.json', 'bun.lockb'],
    packageDeps: [{ file: 'package.json', deps: ['bun'] }],
  },
  // Python ecosystem
  {
    type: 'django',
    confidence: 0.9,
    requiredFiles: ['manage.py', 'requirements.txt'],
    contentPatterns: [{ file: 'requirements.txt', patterns: ['django'] }],
  },
  {
    type: 'fastapi',
    confidence: 0.9,
    indicatorFiles: ['requirements.txt', 'pyproject.toml'],
    contentPatterns: [{ file: 'requirements.txt', patterns: ['fastapi'] }],
  },
  {
    type: 'flask',
    confidence: 0.85,
    indicatorFiles: ['requirements.txt', 'app.py'],
    contentPatterns: [{ file: 'requirements.txt', patterns: ['flask'] }],
  },
  {
    type: 'python',
    confidence: 0.7,
    indicatorFiles: ['requirements.txt', 'setup.py', 'pyproject.toml'],
    extensions: ['.py'],
  },
  {
    type: 'ml-project',
    confidence: 0.8,
    indicatorFiles: ['requirements.txt'],
    contentPatterns: [
      { file: 'requirements.txt', patterns: ['torch', 'tensorflow', 'keras', 'scikit-learn'] },
    ],
  },
  {
    type: 'data-science',
    confidence: 0.8,
    indicatorFiles: ['requirements.txt'],
    contentPatterns: [
      { file: 'requirements.txt', patterns: ['pandas', 'numpy', 'matplotlib', 'jupyter'] },
    ],
  },
  // Rust
  {
    type: 'rust',
    confidence: 0.95,
    requiredFiles: ['Cargo.toml'],
    extensions: ['.rs'],
  },
  // Go
  {
    type: 'go',
    confidence: 0.95,
    requiredFiles: ['go.mod'],
    extensions: ['.go'],
  },
  // Java
  {
    type: 'gradle',
    confidence: 0.9,
    requiredFiles: ['build.gradle', 'settings.gradle'],
    extensions: ['.java', '.kt'],
  },
  {
    type: 'maven',
    confidence: 0.9,
    requiredFiles: ['pom.xml'],
    extensions: ['.java', '.kt'],
  },
  {
    type: 'java',
    confidence: 0.7,
    extensions: ['.java', '.kt'],
  },
  // Ruby
  {
    type: 'rails',
    confidence: 0.9,
    requiredFiles: ['Gemfile', 'config/application.rb'],
    contentPatterns: [{ file: 'Gemfile', patterns: ['rails'] }],
  },
  {
    type: 'ruby',
    confidence: 0.7,
    requiredFiles: ['Gemfile'],
    extensions: ['.rb'],
  },
  // PHP
  {
    type: 'laravel',
    confidence: 0.9,
    requiredFiles: ['composer.json', 'artisan'],
    contentPatterns: [{ file: 'composer.json', patterns: ['laravel/framework'] }],
  },
  {
    type: 'php',
    confidence: 0.7,
    requiredFiles: ['composer.json'],
    extensions: ['.php'],
  },
  // Special project types
  {
    type: 'monorepo',
    confidence: 0.85,
    directories: ['packages', 'apps', 'apps/*', 'packages/*'],
    indicatorFiles: ['package.json'],
    contentPatterns: [{ file: 'package.json', patterns: ['workspaces', 'turbo', 'nx'] }],
  },
  {
    type: 'web-extension',
    confidence: 0.9,
    requiredFiles: ['manifest.json'],
  },
  {
    type: 'electron',
    confidence: 0.9,
    indicatorFiles: ['package.json'],
    contentPatterns: [{ file: 'package.json', patterns: ['electron'] }],
  },
]

//=============================================================================
// Fingerprint Cache
//=============================================================================

interface CacheEntry {
  fingerprint: ProjectFingerprint | null
  timestamp: number
  fileCount: number
}

class FingerprintCache {
  private cache = new Map<string, CacheEntry>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly MAX_ENTRIES = 50

  get(key: string): ProjectFingerprint | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check if cache is still valid
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return entry.fingerprint
  }

  set(key: string, fingerprint: ProjectFingerprint | null, fileCount: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_ENTRIES) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0]?.[0]
      if (oldestKey) this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      fingerprint,
      timestamp: Date.now(),
      fileCount,
    })
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }
}

//=============================================================================
// Fingerprint Scanner
//=============================================================================

export class FingerprintScanner {
  private cache: FingerprintCache

  constructor() {
    this.cache = new FingerprintCache()
  }

  /**
   * Scan a directory and identify the project
   */
  async scan(directoryHandle: FileSystemDirectoryHandle): Promise<ProjectFingerprint | null> {
    // Generate cache key from directory info
    const cacheKey = await this.getCacheKey(directoryHandle)
    if (cacheKey) {
      const cached = this.cache.get(cacheKey)
      if (cached) return cached
    }

    // Scan the directory
    const scanResult = await this.scanDirectory(directoryHandle)

    // Analyze and generate fingerprint
    const fingerprint = await this.analyze(scanResult)

    // Cache the result
    if (cacheKey) {
      this.cache.set(cacheKey, fingerprint, scanResult.fileCount)
    }

    return fingerprint
  }

  /**
   * Quick scan - just check for known indicator files
   */
  async quickScan(directoryHandle: FileSystemDirectoryHandle): Promise<ProjectType> {
    try {
      // Check for key indicator files
      const indicators = [
        { file: 'package.json', type: 'node' as ProjectType },
        { file: 'Cargo.toml', type: 'rust' as ProjectType },
        { file: 'go.mod', type: 'go' as ProjectType },
        { file: 'requirements.txt', type: 'python' as ProjectType },
        { file: 'pyproject.toml', type: 'python' as ProjectType },
        { file: 'pom.xml', type: 'maven' as ProjectType },
        { file: 'build.gradle', type: 'gradle' as ProjectType },
        { file: 'Gemfile', type: 'ruby' as ProjectType },
        { file: 'composer.json', type: 'php' as ProjectType },
        { file: 'deno.json', type: 'deno' as ProjectType },
      ]

      for (const indicator of indicators) {
        try {
          await directoryHandle.getFileHandle(indicator.file)
          return indicator.type
        } catch {
          // File doesn't exist, continue
        }
      }
    } catch {
      // Ignore errors
    }

    return 'unknown'
  }

  /**
   * Generate a cache key for the directory
   */
  private async getCacheKey(directoryHandle: FileSystemDirectoryHandle): Promise<string | null> {
    try {
      // Try to get a unique identifier from the directory
      // This is a simple implementation - in production you might use file modification time
      const key = `fingerprint:${directoryHandle.name}`
      return key
    } catch {
      return null
    }
  }

  /**
   * Scan directory structure
   */
  private async scanDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<{
    files: string[]
    directories: string[]
    fileCount: number
    extensionCounts: Record<string, number>
  }> {
    const files: string[] = []
    const directories: string[] = []
    const extensionCounts: Record<string, number> = {}
    let fileCount = 0

    try {
      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
          files.push(entry.name)
          fileCount++

          // Count extensions
          const ext = entry.name.split('.').pop()?.toLowerCase()
          if (ext) {
            extensionCounts[ext] = (extensionCounts[ext] || 0) + 1
          }
        } else if (entry.kind === 'directory') {
          directories.push(entry.name)
        }
      }
    } catch (error) {
      console.warn('[FingerprintScanner] Failed to scan directory:', error)
    }

    return { files, directories, fileCount, extensionCounts }
  }

  /**
   * Analyze scan results and generate fingerprint
   */
  private async analyze(scanResult: {
    files: string[]
    directories: string[]
    fileCount: number
    extensionCounts: Record<string, number>
  }): Promise<ProjectFingerprint | null> {
    // Score each rule
    const scoredRules: Array<{ rule: FingerprintRule; score: number }> = []

    for (const rule of FINGERPRINT_RULES) {
      const score = this.scoreRule(rule, scanResult)
      if (score > 0) {
        scoredRules.push({ rule, score })
      }
    }

    // Sort by score * confidence
    scoredRules.sort((a, b) => b.score * b.rule.confidence - a.score * a.rule.confidence)

    if (scoredRules.length === 0) {
      return this.createUnknownFingerprint(scanResult)
    }

    const bestMatch = scoredRules[0]
    return await this.createFingerprint(bestMatch.rule, bestMatch.score, scanResult)
  }

  /**
   * Score a fingerprint rule against scan results
   */
  private scoreRule(
    rule: FingerprintRule,
    scanResult: {
      files: string[]
      directories: string[]
      fileCount: number
      extensionCounts: Record<string, number>
    }
  ): number {
    let score = 0
    const { files, directories, extensionCounts } = scanResult

    // Check required files
    if (rule.requiredFiles) {
      const hasAll = rule.requiredFiles.every((f) => files.includes(f))
      if (!hasAll) return 0
      score += rule.requiredFiles.length * 2
    }

    // Check indicator files
    if (rule.indicatorFiles) {
      const hasOne = rule.indicatorFiles.some((f) => files.includes(f))
      if (hasOne) score += rule.indicatorFiles.length
    }

    // Check directories
    if (rule.directories) {
      for (const dir of rule.directories) {
        // Support wildcard patterns like "apps/*"
        const pattern = dir.replace('*', '')
        if (directories.some((d) => d === dir || d.startsWith(pattern))) {
          score += 1
        }
      }
    }

    // Check extensions
    if (rule.extensions) {
      for (const ext of rule.extensions) {
        const extWithoutDot = ext.replace('.', '')
        if (extensionCounts[extWithoutDot]) {
          score += Math.min(extensionCounts[extWithoutDot] / 10, 2) // Cap at 2 points
        }
      }
    }

    // Note: Content patterns and package deps would require file reading
    // For quick scan, we give partial credit
    if (rule.contentPatterns || rule.packageDeps) {
      score += 0.5
    }

    return score
  }

  /**
   * Create a fingerprint from a matched rule
   */
  private async createFingerprint(
    rule: FingerprintRule,
    score: number,
    scanResult: {
      files: string[]
      directories: string[]
      fileCount: number
      extensionCounts: Record<string, number>
    }
  ): Promise<ProjectFingerprint> {
    const languages = this.detectLanguages(scanResult.extensionCounts)
    const frameworks = this.detectFrameworks(rule.type)
    const testing = this.detectTestingFramework(scanResult.files)
    const buildTool = this.detectBuildTool(scanResult.files, rule.type)
    const packageManager = this.detectPackageManager(scanResult.files)
    const hasTypeScript =
      scanResult.extensionCounts['ts'] > 0 || scanResult.extensionCounts['tsx'] > 0

    // Determine project size
    let size: 'small' | 'medium' | 'large' = 'small'
    if (scanResult.fileCount > 100) size = 'large'
    else if (scanResult.fileCount > 30) size = 'medium'

    // Get recommended tools
    const recommendedTools = this.getRecommendedTools(rule.type, hasTypeScript)

    return {
      type: rule.type,
      confidence: Math.min(rule.confidence, score / 10),
      languages,
      frameworks,
      testing,
      buildTool,
      packageManager,
      configFiles: scanResult.files.filter((f) =>
        ['config.json', 'rc', 'tsconfig', '.json', '.toml', '.yaml', '.yml'].some((ext) =>
          f.includes(ext)
        )
      ),
      directories: scanResult.directories,
      size,
      hasTypeScript,
      recommendedTools,
    }
  }

  /**
   * Create fingerprint for unknown project
   */
  private createUnknownFingerprint(scanResult: {
    files: string[]
    directories: string[]
    fileCount: number
    extensionCounts: Record<string, number>
  }): ProjectFingerprint {
    const languages = this.detectLanguages(scanResult.extensionCounts)
    const hasTypeScript =
      scanResult.extensionCounts['ts'] > 0 || scanResult.extensionCounts['tsx'] > 0

    let size: 'small' | 'medium' | 'large' = 'small'
    if (scanResult.fileCount > 100) size = 'large'
    else if (scanResult.fileCount > 30) size = 'medium'

    return {
      type: 'unknown',
      confidence: 0,
      languages,
      frameworks: ['unknown'],
      testing: 'unknown',
      buildTool: 'unknown',
      packageManager: 'unknown',
      configFiles: [],
      directories: scanResult.directories,
      size,
      hasTypeScript,
      recommendedTools: ['ls', 'read'],
    }
  }

  /**
   * Detect primary languages from extension counts
   */
  private detectLanguages(extensionCounts: Record<string, number>): ProjectLanguage[] {
    const languages: ProjectLanguage[] = []

    const langMap: Record<string, ProjectLanguage> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      kt: 'java',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      c: 'c',
      cpp: 'cpp',
    }

    // Sort by count and take top 2
    const sorted = Object.entries(extensionCounts)
      .filter(([ext]) => langMap[ext])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)

    for (const [ext] of sorted) {
      const lang = langMap[ext]
      if (lang && !languages.includes(lang)) {
        languages.push(lang)
      }
    }

    return languages.length > 0 ? languages : ['unknown']
  }

  /**
   * Detect frameworks from project type
   */
  private detectFrameworks(projectType: ProjectType): Framework[] {
    const frameworkMap: Record<ProjectType, Framework> = {
      react: 'react',
      vue: 'vue',
      angular: 'angular',
      svelte: 'svelte',
      solid: 'solid',
      nextjs: 'next',
      nuxt: 'nuxt',
      remix: 'remix',
      node: 'unknown',
      deno: 'unknown',
      bun: 'unknown',
      python: 'unknown',
      django: 'django',
      fastapi: 'fastapi',
      flask: 'flask',
      rust: 'unknown',
      go: 'unknown',
      java: 'unknown',
      gradle: 'unknown',
      maven: 'unknown',
      dotnet: 'unknown',
      ruby: 'unknown',
      rails: 'rails',
      php: 'unknown',
      laravel: 'laravel',
      'data-science': 'unknown',
      'ml-project': 'unknown',
      monorepo: 'unknown',
      'web-extension': 'unknown',
      electron: 'unknown',
      unknown: 'unknown',
    }

    const fw = frameworkMap[projectType]
    return fw !== 'unknown' ? [fw] : ['unknown']
  }

  /**
   * Detect testing framework
   */
  private detectTestingFramework(files: string[]): TestingFramework {
    if (files.includes('vitest.config.ts')) return 'vitest'
    if (files.includes('jest.config.js') || files.includes('jest.config.ts')) return 'jest'
    if (files.includes('pytest.ini') || files.includes('pyproject.toml')) return 'pytest'
    if (files.includes('tests.py')) return 'unittest'
    return 'unknown'
  }

  /**
   * Detect build tool
   */
  private detectBuildTool(files: string[], projectType: ProjectType): BuildTool {
    if (files.includes('vite.config.ts') || files.includes('vite.config.js')) return 'vite'
    if (files.includes('webpack.config.js')) return 'webpack'
    if (files.includes('rollup.config.js')) return 'rollup'
    if (files.includes('esbuild.config.js')) return 'esbuild'
    if (files.includes('next.config.js')) return 'turbopack'
    if (files.includes('turbo.json')) return 'turbopack'

    // Language-specific defaults
    if (['rust', 'go', 'gradle', 'maven', 'dotnet'].includes(projectType)) {
      const toolMap: Record<string, BuildTool> = {
        rust: 'cargo',
        go: 'go-build',
        gradle: 'gradle',
        maven: 'maven',
        dotnet: 'dotnet',
      }
      return toolMap[projectType] || 'unknown'
    }

    return 'npm'
  }

  /**
   * Detect package manager
   */
  private detectPackageManager(files: string[]): PackageManager {
    if (files.includes('pnpm-lock.yaml')) return 'pnpm'
    if (files.includes('yarn.lock')) return 'yarn'
    if (files.includes('package-lock.json')) return 'npm'
    if (files.includes('bun.lockb')) return 'bun'
    if (files.includes('poetry.lock')) return 'poetry'
    if (files.includes('Pipfile')) return 'pip'
    if (files.includes('Cargo.lock')) return 'cargo'
    if (files.includes('go.sum')) return 'go-modules'
    return 'unknown'
  }

  /**
   * Get recommended tools for this project type
   */
  private getRecommendedTools(projectType: ProjectType, _hasTypeScript: boolean): string[] {
    const base = ['ls', 'read']

    const typeTools: Record<string, string[]> = {
      react: ['edit'],
      vue: ['edit'],
      python: ['execute'],
      'data-science': ['execute', 'analyze_data'],
      rust: ['edit'],
      go: ['edit'],
      node: ['edit'],
    }

    return [...new Set([...base, ...(typeTools[projectType] || [])])]
  }
}

//=============================================================================
// Singleton
//=============================================================================

let instance: FingerprintScanner | null = null

export function getFingerprintScanner(): FingerprintScanner {
  if (!instance) {
    instance = new FingerprintScanner()
  }
  return instance
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Get a description of the project type for the user
 */
export function getProjectTypeDescription(projectType: ProjectType): string {
  const descriptions: Record<ProjectType, string> = {
    react: 'React application',
    vue: 'Vue.js application',
    angular: 'Angular application',
    svelte: 'Svelte application',
    nextjs: 'Next.js React framework',
    nuxt: 'Nuxt.js Vue framework',
    remix: 'Remix React framework',
    solid: 'SolidJS application',
    node: 'Node.js project',
    deno: 'Deno project',
    bun: 'Bun project',
    python: 'Python project',
    django: 'Django web framework',
    fastapi: 'FastAPI web framework',
    flask: 'Flask web framework',
    rust: 'Rust project',
    go: 'Go project',
    java: 'Java project',
    gradle: 'Gradle Java/Kotlin project',
    maven: 'Maven Java project',
    dotnet: '.NET project',
    ruby: 'Ruby project',
    rails: 'Ruby on Rails project',
    php: 'PHP project',
    laravel: 'Laravel PHP framework',
    'data-science': 'Data science project',
    'ml-project': 'Machine learning project',
    monorepo: 'Monorepo (multiple packages)',
    'web-extension': 'Browser extension',
    electron: 'Electron desktop app',
    unknown: 'Unknown project type',
  }

  return descriptions[projectType] || 'Unknown project type'
}

/**
 * Format fingerprint for system prompt injection
 */
export function formatFingerprintForPrompt(fingerprint: ProjectFingerprint | null): string {
  if (!fingerprint || fingerprint.type === 'unknown') {
    return ''
  }

  let output = `\n## Project Context\n\n`
  output += `Detected project type: **${getProjectTypeDescription(fingerprint.type)}**\n`

  if (fingerprint.languages.length > 0 && fingerprint.languages[0] !== 'unknown') {
    output += `Primary language(s): ${fingerprint.languages.join(', ')}\n`
  }

  if (fingerprint.frameworks[0] !== 'unknown') {
    output += `Framework(s): ${fingerprint.frameworks.join(', ')}\n`
  }

  if (fingerprint.hasTypeScript) {
    output += `✓ This project uses TypeScript\n`
  }

  if (fingerprint.recommendedTools.length > 0) {
    output += `\nRecommended tools for this project:\n`
    for (const tool of fingerprint.recommendedTools) {
      output += `- \`${tool}\`\n`
    }
  }

  return output
}
