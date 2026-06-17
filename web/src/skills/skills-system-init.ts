/**
 * Skills System Initialization
 *
 * Entry point for initializing the skills system in the web app.
 * Called during app startup, after SQLite and OPFS are ready.
 *
 * Flow:
 * 1. Initialize builtin packages registry (register all bundled files)
 * 2. Materialize builtin skills to OPFS (incremental sync)
 * 3. Report results
 */

import { ensureMaterialized } from '@creatorweave/skills-system'
import { opfsSkillsAdapter } from './skills-platform-adapter'
import { initializeRegistry } from './builtin-packages-registry'
import { isSkillsDirHealthy } from './skills-mount'

export interface SkillsSystemInitResult {
  /** Registry initialized */
  registryOk: boolean
  /** Materialization result */
  materialize: {
    total: number
    written: number
    skipped: number
    pruned: number
    errors: Array<{ skill: string; error: string }>
    durationMs: number
  } | null
  /** Health check after init */
  healthy: boolean
}

/**
 * Initialize the skills system.
 *
 * Call this once during app startup, after OPFS is available.
 */
export async function initializeSkillsSystem(): Promise<SkillsSystemInitResult> {
  const result: SkillsSystemInitResult = {
    registryOk: false,
    materialize: null,
    healthy: false,
  }

  // Step 1: Build the manifest from bundled files.
  // initializeRegistry() internally updates the shared BUILTIN_SKILLS_PACKAGE
  // so that opfsSkillsAdapter.getBundledManifest() returns the real data.
  try {
    const manifest = await initializeRegistry()
    result.registryOk = true
    console.log('[Skills System] Registry initialized:', manifest.skills.length, 'skills')
  } catch (error) {
    console.error('[Skills System] Registry init failed:', error)
    return result
  }

  // Step 2: Materialize builtin skills to OPFS
  try {
    const materializeResult = await ensureMaterialized(opfsSkillsAdapter)
    result.materialize = {
      total: materializeResult.total,
      written: materializeResult.written,
      skipped: materializeResult.skipped,
      pruned: materializeResult.pruned,
      errors: materializeResult.errors,
      durationMs: materializeResult.durationMs,
    }
    console.log(
      `[Skills System] Materialized: ${materializeResult.written} written, ` +
        `${materializeResult.skipped} skipped, ` +
        `${materializeResult.pruned} pruned, ` +
        `${materializeResult.errors.length} errors, ` +
        `${materializeResult.durationMs.toFixed(0)}ms`
    )
  } catch (error) {
    console.error('[Skills System] Materialize failed:', error)
  }

  // Step 3: Health check
  result.healthy = await isSkillsDirHealthy()
  if (!result.healthy) {
    console.warn('[Skills System] Health check failed — /mnt_skills may not work')
  }

  // NOTE: Slash command registration for skills is now handled centrally by
  // SkillManager.syncSlashCommands(), which covers builtin + user + project
  // skills in one pass. Previously this file registered only builtin skills.

  return result
}
