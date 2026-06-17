/**
 * @creatorweave/skills-system - Types
 *
 * Core type definitions for the skills system.
 * Platform-agnostic: no OPFS / Pyodide / React dependencies.
 */

// ============================================================================
// Skill Package Types (builtin-packages manifest)
// ============================================================================

/** A single file entry in the manifest */
export interface ManifestFileEntry {
  /** Relative path within the skill directory, e.g. "scripts/analyze.py" */
  path: string
  /** SHA-256 hex digest of the file content */
  hash: string
  /** File size in bytes */
  size: number
}

/** Manifest for a single builtin skill package */
export interface BuiltinSkillManifest {
  /** Skill identifier, e.g. "socratic-brainstorm" */
  name: string
  /** Semantic version, e.g. "1.0.0" */
  version: string
  /** Human-readable description */
  description: string
  /** File entries included in this skill */
  files: ManifestFileEntry[]
  /** ISO timestamp of when this manifest was generated */
  generatedAt: string
}

/** Top-level manifest: all builtin skills shipped with the current app version */
export interface BuiltinSkillsManifest {
  /** Manifest schema version */
  schemaVersion: 1
  /** Application version that shipped these skills */
  appVersion: string
  /** List of builtin skill manifests */
  skills: BuiltinSkillManifest[]
  /** ISO timestamp */
  generatedAt: string
}

// ============================================================================
// Sync Types
// ============================================================================

/** Result of comparing local vs bundled manifest */
export interface SkillDiff {
  /** Skills that need to be added (not present locally) */
  added: BuiltinSkillManifest[]
  /** Skills that need to be updated (version changed) */
  updated: BuiltinSkillManifest[]
  /** Skills that are unchanged */
  unchanged: BuiltinSkillManifest[]
}

/** Result of a materialize (sync) operation */
export interface MaterializeResult {
  /** Total skills processed */
  total: number
  /** Number of skills actually written */
  written: number
  /** Number of skills skipped (unchanged) */
  skipped: number
  /** Number of stale directories pruned (no longer bundled) */
  pruned: number
  /** Per-skill errors */
  errors: Array<{ skill: string; error: string }>
  /** Time taken in ms */
  durationMs: number
}

// ============================================================================
// Mount Protocol Types
// ============================================================================

/** Configuration for mounting skills into a runtime (e.g. Pyodide) */
export interface SkillsMountConfig {
  /** Mount point path, e.g. "/mnt_skills" */
  mountPoint: string
  /** Whether the mount should be read-only */
  readOnly: boolean
}

/** Result of a mount operation */
export interface SkillsMountResult {
  success: boolean
  mountPoint: string
  /** Error message if mount failed */
  error?: string
}

// ============================================================================
// Resource Access Types
// ============================================================================

/** Virtual path to a skill resource, resolvable in any runtime */
export interface SkillResourcePath {
  /** Skill name */
  skillName: string
  /** Relative resource path, e.g. "scripts/analyze.py" */
  resourcePath: string
  /** Absolute path in the mounted filesystem */
  absolutePath: string
}

// ============================================================================
// Platform Abstraction (to be implemented by consumers)
// ============================================================================

/**
 * Platform adapter — the only thing this package needs from the outside world.
 * Web implements it with OPFS; tests can provide a mock.
 */
export interface PlatformAdapter {
  /** Read a text file from the skills directory */
  readFile(path: string): Promise<string>
  /** Write a text/binary file to the skills directory */
  writeFile(path: string, content: string | ArrayBuffer): Promise<void>
  /** Check if a file/directory exists */
  exists(path: string): Promise<boolean>
  /** List entries in a directory */
  readdir(path: string): Promise<string[]>
  /** Remove a file or directory recursively */
  remove(path: string): Promise<void>
  /** Get the current local manifest (if any) */
  readLocalManifest(): Promise<BuiltinSkillsManifest | null>
  /** Persist the local manifest after sync */
  writeLocalManifest(manifest: BuiltinSkillsManifest): Promise<void>
  /** Get the bundled manifest shipped with the current app version */
  getBundledManifest(): BuiltinSkillsManifest
  /** Read a bundled skill file content */
  readBundledFile(skillName: string, filePath: string): Promise<string>
  /** Read a bundled binary file as ArrayBuffer (optional, for binary assets like .docx) */
  readBundledBinaryFile?(skillName: string, filePath: string): Promise<ArrayBuffer>
  /** Check if a bundled file is binary (optional) */
  isBundledBinaryFile?(skillName: string, filePath: string): boolean
  /** Get the current app version */
  getAppVersion(): string
}
