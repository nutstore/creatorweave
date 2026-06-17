/**
 * @creatorweave/skills-system - Materialize
 *
 * Syncs builtin skills from bundled assets to the local filesystem.
 * Only writes files that have changed (added or updated per the diff).
 */

import type {
  PlatformAdapter,
  BuiltinSkillManifest,
  BuiltinSkillsManifest,
  MaterializeResult,
} from './types'
import { computeDiff } from './diff'

/**
 * Ensure builtin skills are materialized on the local filesystem.
 *
 * Steps:
 * 1. Read local manifest & bundled manifest
 * 2. Compute diff
 * 3. Write added/updated skill files
 * 4. Prune stale skill directories no longer in the bundled manifest
 * 5. Persist updated local manifest
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

  // Prune stale builtin skill directories that are no longer bundled.
  // This handles renamed skills (e.g. `cw:word-editor` → `cw-word-editor`):
  // the old directory remains on disk after a rename. We compare the actual
  // `builtin/` entries against the bundled skill names and remove orphans.
  const pruned = await pruneStaleBuiltinDirs(adapter, bundledManifest)

  // Persist updated manifest
  await adapter.writeLocalManifest(bundledManifest)

  return {
    total: bundledManifest.skills.length,
    written: toWrite.length,
    skipped: diff.unchanged.length,
    pruned,
    errors,
    durationMs: performance.now() - startTime,
  }
}

/**
 * Remove builtin skill directories that no longer exist in the bundled manifest.
 *
 * Lists entries under `builtin/` and deletes any directory whose name is not
 * a current bundled skill name. Dotfiles (e.g. `.gitkeep`) are preserved.
 *
 * @returns Number of directories pruned.
 */
async function pruneStaleBuiltinDirs(
  adapter: PlatformAdapter,
  bundledManifest: BuiltinSkillsManifest
): Promise<number> {
  const validNames = new Set(bundledManifest.skills.map((s) => s.name))
  let entries: string[]
  try {
    entries = await adapter.readdir('builtin')
  } catch {
    return 0
  }

  let pruned = 0
  for (const entry of entries) {
    // Skip dotfiles (e.g. .gitkeep) and known valid skill dirs
    if (entry.startsWith('.')) continue
    if (validNames.has(entry)) continue

    // This entry is not in the bundled manifest — remove it.
    try {
      await adapter.remove(`builtin/${entry}`)
      pruned++
      console.log(`[Skills System] Pruned stale builtin dir: builtin/${entry}`)
    } catch (err) {
      // Non-fatal — log and continue
      console.warn(`[Skills System] Failed to prune builtin/${entry}:`, err)
    }
  }
  return pruned
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
