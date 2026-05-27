/**
 * Builtin Skills Package Registry
 *
 * Registers all builtin skill packages and their files.
 * This is the build-time manifest + file content source.
 *
 * When adding a new builtin skill:
 * 1. Create a directory under web/src/skills/builtin-packages/<skill-name>/
 * 2. Add its SKILL.md and resources
 * 3. Import the files here and register them
 * 4. Update the manifest below
 */

import type { BuiltinSkillsManifest } from '@creatorweave/skills-system'

// ============================================================================
// Shared file map — the single source of truth for bundled skill file content.
// Populated by registerSkill() / registerFile() calls at module load time.
// Exported so that skills-platform-adapter can read from it without circular deps.
// ============================================================================

export const BUNDLED_SKILL_FILES: Record<string, string> = {}

// ============================================================================
// App Version (update on each release that changes builtin skills)
// ============================================================================

const APP_VERSION = __APP_VERSION__ // injected by Vite define plugin

// ============================================================================
// Skill File Registration
// ============================================================================

/**
 * Register a single file for a builtin skill.
 */
function registerFile(skillName: string, relativePath: string, content: string): void {
  BUNDLED_SKILL_FILES[`${skillName}/${relativePath}`] = content
}

/**
 * Register all files for a builtin skill at once.
 */
function registerSkill(
  skillName: string,
  files: Array<{ path: string; content: string }>
): void {
  for (const { path, content } of files) {
    registerFile(skillName, path, content)
  }
}

// ============================================================================
// cw:brainstorm — Socratic brainstorming mode
// ============================================================================

// Import skill files using Vite's ?raw query (inline as string at build time)
// Directory name (socratic-brainstorm) is just the filesystem location;
// the skill identity is set by registerSkill('cw:brainstorm', ...).
import brainstormSkillMd from './builtin-packages/socratic-brainstorm/SKILL.md?raw'

registerSkill('cw:brainstorm', [
  { path: 'SKILL.md', content: brainstormSkillMd },
])

// ============================================================================
// cw:nol-editor — Guide for .nol (Outline Notes) file operations
// ============================================================================

import nolEditorSkillMd from './builtin-packages/nol-editor/SKILL.md?raw'

registerSkill('cw:nol-editor', [
  { path: 'SKILL.md', content: nolEditorSkillMd },
])

// ============================================================================
// Manifest — the single source of truth for what's bundled
// ============================================================================

async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Build the manifest dynamically from registered files.
 * Called once at startup.
 */
export async function buildBundledManifest(): Promise<BuiltinSkillsManifest> {
  const skills: BuiltinSkillsManifest['skills'] = []

  // Group files by skill name
  const skillNames = new Set<string>()
  for (const key of Object.keys(BUNDLED_SKILL_FILES)) {
    const slashIdx = key.indexOf('/')
    if (slashIdx > 0) {
      skillNames.add(key.substring(0, slashIdx))
    }
  }

  for (const skillName of skillNames) {
    const prefix = `${skillName}/`
    const files: BuiltinSkillsManifest['skills'][0]['files'] = []

    for (const [key, content] of Object.entries(BUNDLED_SKILL_FILES)) {
      if (!key.startsWith(prefix)) continue
      const path = key.substring(prefix.length)
      files.push({
        path,
        hash: await computeHash(content),
        size: new TextEncoder().encode(content).length,
      })
    }

    // Extract metadata from SKILL.md frontmatter (simple parse)
    const skillMd = BUNDLED_SKILL_FILES[`${skillName}/SKILL.md`] || ''
    const versionMatch = skillMd.match(/version:\s*["']?([^"'\n]+)/)
    // description may be quoted or unquoted in YAML
    const descMatch =
      skillMd.match(/description:\s*["']([^"']+)["']/) ||
      skillMd.match(/description:\s*(.+)/)

    skills.push({
      name: skillName,
      version: versionMatch?.[1] || '1.0.0',
      description: descMatch?.[1]?.trim() || '',
      files,
      generatedAt: new Date().toISOString(),
    })
  }

  return {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    skills,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Lazy-initialized manifest — built once, cached.
 */
let cachedManifest: BuiltinSkillsManifest | null = null

/**
 * Get the bundled manifest (cached).
 */
export function getBundledManifestSync(): BuiltinSkillsManifest {
  if (!cachedManifest) {
    // Synchronous fallback — should call buildBundledManifest() during init
    throw new Error('Bundled manifest not yet built. Call buildBundledManifest() first.')
  }
  return cachedManifest
}

/**
 * Initialize the registry — call once at app startup.
 */
export async function initializeRegistry(): Promise<BuiltinSkillsManifest> {
  cachedManifest = await buildBundledManifest()

  // Update the shared mutable manifest object so that consumers
  // (skills-platform-adapter via getBundledManifest) see the real data.
  Object.assign(BUILTIN_SKILLS_PACKAGE, cachedManifest)

  console.log(
    `[Skills Registry] Initialized with ${cachedManifest.skills.length} builtin skills`
  )
  return cachedManifest
}

/**
 * The manifest object used by the adapter.
 * This is replaced by the actual built manifest after initializeRegistry().
 */
export const BUILTIN_SKILLS_PACKAGE: BuiltinSkillsManifest = {
  schemaVersion: 1,
  appVersion: '0.0.0',
  skills: [],
  generatedAt: '',
}
