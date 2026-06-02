/**
 * @creatorweave/skills-system - Materialize
 *
 * Syncs builtin skills from bundled assets to the local filesystem.
 * Only writes files that have changed (added or updated per the diff).
 */

import type {
  PlatformAdapter,
  BuiltinSkillsManifest,
  BuiltinSkillManifest,
  MaterializeResult,
  SkillDiff,
} from './types'
import { computeDiff } from './diff'

/**
 * Ensure builtin skills are materialized on the local filesystem.
 *
 * Steps:
 * 1. Read local manifest & bundled manifest
 * 2. Compute diff
 * 3. Write added/updated skill files
 * 4. Persist updated local manifest
 *
 * @param adapter - Platform-specific filesystem adapter
 * @returns Materialize result with stats
 */
export async function ensureMaterialized(
  adapter: PlatformAdapter
): Promise<MaterializeResult> {
  const startTime = performance.now()

  const localManifest = await adapter.readLocalManifest()
  const bundledManifest = adapter.getBundledManifest()

  // Always compute diff — individual skill versions determine what needs updating.
  // No appVersion short-circuit: skill-level versioning is the source of truth.
  const diff = computeDiff(localManifest, bundledManifest)
  const toWrite = [...diff.added, ...diff.updated]
  const errors: MaterializeResult['errors'] = []

  // Ensure base directory exists
  // NOTE: Paths are relative to the adapter root (already inside .skills/ for OPFS).
  await adapter.writeFile('builtin/.gitkeep', '')

  for (const skill of toWrite) {
    try {
      await materializeSkill(adapter, skill)
    } catch (err) {
      errors.push({
        skill: skill.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Persist updated manifest
  await adapter.writeLocalManifest(bundledManifest)

  return {
    total: bundledManifest.skills.length,
    written: toWrite.length,
    skipped: diff.unchanged.length,
    errors,
    durationMs: performance.now() - startTime,
  }
}

/**
 * Write all files for a single skill to the local filesystem.
 * Supports both text files and binary files (via readBundledBinaryFile).
 */
async function materializeSkill(
  adapter: PlatformAdapter,
  skill: BuiltinSkillManifest
): Promise<void> {
  // NOTE: skillDir is relative to adapter root (already inside .skills/ for OPFS).
  const skillDir = `builtin/${skill.name}`

  for (const file of skill.files) {
    // Check if this file is a binary asset
    if (adapter.readBundledBinaryFile && adapter.isBundledBinaryFile?.(skill.name, file.path)) {
      const content = await adapter.readBundledBinaryFile(skill.name, file.path)
      await adapter.writeFile(`${skillDir}/${file.path}`, content)
    } else {
      const content = await adapter.readBundledFile(skill.name, file.path)
      await adapter.writeFile(`${skillDir}/${file.path}`, content)
    }
  }
}
