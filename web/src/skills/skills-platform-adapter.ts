/**
 * Skills Platform Adapter - OPFS Implementation
 *
 * Implements @creatorweave/skills-system's PlatformAdapter
 * using OPFS (Origin Private File System) as the backing store.
 *
 * Layout:
 *   opfs-root/.skills/
 *     builtin/
 *       <skill-name>/SKILL.md
 *       <skill-name>/scripts/...
 *       <skill-name>/references/...
 *       <skill-name>/assets/...
 *     manifest.json
 */

import type {
  PlatformAdapter,
  BuiltinSkillsManifest,
} from '@creatorweave/skills-system'
import { BUILTIN_SKILLS_PACKAGE, BUNDLED_SKILL_FILES } from './builtin-packages-registry'

const SKILLS_ROOT = '.skills'
const MANIFEST_PATH = `${SKILLS_ROOT}/manifest.json`

/**
 * Get or create the .skills directory handle in OPFS root.
 */
async function getSkillsRoot(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory()
  return opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
}

/**
 * Resolve a relative path (e.g. "builtin/socratic/scripts/x.py") to
 * a sequence of directory handles + final file handle.
 */
async function resolveFilePath(
  relativePath: string,
  create: boolean = false
): Promise<{ dir: FileSystemDirectoryHandle; fileName: string }> {
  const parts = relativePath.split('/')
  const fileName = parts.pop()!
  let dir = await getSkillsRoot()

  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create })
  }

  return { dir, fileName }
}

/**
 * OPFS-backed PlatformAdapter for the skills system.
 */
export const opfsSkillsAdapter: PlatformAdapter = {
  async readFile(path: string): Promise<string> {
    const { dir, fileName } = await resolveFilePath(path)
    const handle = await dir.getFileHandle(fileName)
    const file = await handle.getFile()
    return file.text()
  },

  async writeFile(path: string, content: string | ArrayBuffer): Promise<void> {
    const { dir, fileName } = await resolveFilePath(path, true)
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  },

  async exists(path: string): Promise<boolean> {
    try {
      const { dir, fileName } = await resolveFilePath(path)
      await dir.getFileHandle(fileName)
      return true
    } catch {
      return false
    }
  },

  async readdir(path: string): Promise<string[]> {
    try {
      const skillsRoot = await getSkillsRoot()
      let dir = skillsRoot
      for (const part of path.split('/')) {
        if (part) dir = await dir.getDirectoryHandle(part)
      }
      const entries: string[] = []
      for await (const [name] of dir.entries()) {
        entries.push(name)
      }
      return entries
    } catch {
      return []
    }
  },

  async remove(path: string): Promise<void> {
    const { dir, fileName } = await resolveFilePath(path)
    // Try file first, then directory
    try {
      await dir.removeEntry(fileName)
      return
    } catch {}
    try {
      await dir.removeEntry(fileName, { recursive: true })
    } catch {}
  },

  async readLocalManifest(): Promise<BuiltinSkillsManifest | null> {
    try {
      const text = await this.readFile(MANIFEST_PATH)
      return JSON.parse(text) as BuiltinSkillsManifest
    } catch {
      return null
    }
  },

  async writeLocalManifest(manifest: BuiltinSkillsManifest): Promise<void> {
    await this.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  },

  getBundledManifest(): BuiltinSkillsManifest {
    return BUILTIN_SKILLS_PACKAGE
  },

  async readBundledFile(skillName: string, filePath: string): Promise<string> {
    // Bundled files are imported as raw strings via Vite's ?raw query
    // The registry module handles the actual imports
    const key = `${skillName}/${filePath}`
    const bundled = BUNDLED_SKILL_FILES[key]
    if (bundled === undefined) {
      throw new Error(`Bundled file not found: ${key}`)
    }
    return bundled
  },

  getAppVersion(): string {
    return BUILTIN_SKILLS_PACKAGE.appVersion
  },
}
