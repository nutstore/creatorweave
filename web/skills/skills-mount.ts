/**
 * Skills Mount Coordinator
 *
 * Coordinates mounting the global .skills directory into Pyodide as /mnt_skills.
 *
 * This module is called from the Python bridge/worker initialization
 * to ensure builtin skill files are accessible at /mnt_skills/builtin/...
 *
 * OPFS layout:
 *   opfs-root/.skills/builtin/<skill>/...
 *
 * Pyodide mount:
 *   /mnt_skills/ ↔ opfs-root/.skills/
 */

/** Mount point for skills in Pyodide */
export const SKILLS_MOUNT_POINT = '/mnt_skills'

/**
 * Get the OPFS directory handle for .skills root.
 * Creates it if it doesn't exist.
 */
export async function getSkillsDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory()
  return opfsRoot.getDirectoryHandle('.skills', { create: true })
}

/**
 * Health check: verify that .skills/builtin exists and has content.
 */
export async function isSkillsDirHealthy(): Promise<boolean> {
  try {
    const skillsRoot = await getSkillsDirectoryHandle()
    const builtinDir = await skillsRoot.getDirectoryHandle('builtin')
    let count = 0
    for await (const _ of builtinDir.values()) {
      count++
      if (count > 0) break // At least one entry is enough
    }
    return count > 0
  } catch {
    return false
  }
}
