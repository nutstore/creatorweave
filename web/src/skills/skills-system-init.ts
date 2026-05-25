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
      errors: materializeResult.errors,
      durationMs: materializeResult.durationMs,
    }
    console.log(
      `[Skills System] Materialized: ${materializeResult.written} written, ` +
        `${materializeResult.skipped} skipped, ` +
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

  // Step 4: Register builtin skills as slash commands.
  // Skill name comes directly from SKILL.md's name field (e.g. "cw:brainstorm").
  try {
    const { registerSlashCommands } = await import('@/skills/slash-command-registry')
    const manifest = opfsSkillsAdapter.getBundledManifest()
    registerSlashCommands(
      manifest.skills.map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.description,
        source: 'skill' as const,
      }))
    )
    console.log('[Skills System] Registered', manifest.skills.length, 'slash commands')
  } catch (error) {
    console.warn('[Skills System] Slash command registration failed:', error)
  }

  return result
}
