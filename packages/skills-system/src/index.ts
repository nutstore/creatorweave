/**
 * @creatorweave/skills-system
 *
 * Platform-agnostic skills management:
 * - Manifest definition & diffing
 * - Incremental sync (materialize)
 * - Path resolution for runtime mount
 *
 * This package has ZERO platform dependencies.
 * Consumers provide a PlatformAdapter for OPFS / test env / etc.
 */

// Types
export type {
  ManifestFileEntry,
  BuiltinSkillManifest,
  BuiltinSkillsManifest,
  SkillDiff,
  MaterializeResult,
  SkillsMountConfig,
  SkillsMountResult,
  SkillResourcePath,
  PlatformAdapter,
} from './types'

// Diff
export { computeDiff } from './diff'

// Materialize
export { ensureMaterialized } from './materialize'

// Path utilities
export {
  DEFAULT_MOUNT_CONFIG,
  resolveResourcePath,
  buildPythonPath,
} from './paths'
