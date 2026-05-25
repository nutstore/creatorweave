/**
 * @creatorweave/skills-system - Path Utilities
 *
 * Resolves skill resource paths for different runtimes.
 */

import type { SkillResourcePath, SkillsMountConfig } from './types'

/** Default mount configuration */
export const DEFAULT_MOUNT_CONFIG: SkillsMountConfig = {
  mountPoint: '/mnt_skills',
  readOnly: true,
}

/**
 * Resolve a skill resource to an absolute path in the mounted filesystem.
 *
 * @example
 * resolveResourcePath('/mnt_skills', 'socratic-brainstorm', 'scripts/generate.py')
 * // => '/mnt_skills/builtin/socratic-brainstorm/scripts/generate.py'
 */
export function resolveResourcePath(
  mountPoint: string,
  skillName: string,
  resourcePath: string
): SkillResourcePath {
  const absolutePath = `${mountPoint}/builtin/${skillName}/${resourcePath}`
  return {
    skillName,
    resourcePath,
    absolutePath,
  }
}

/**
 * Build a Python sys.path entry for importing skill scripts as modules.
 *
 * @example
 * buildPythonPath('/mnt_skills', 'socratic-brainstorm', 'scripts')
 * // => '/mnt_skills/builtin/socratic-brainstorm/scripts'
 */
export function buildPythonPath(
  mountPoint: string,
  skillName: string,
  subDir: string = 'scripts'
): string {
  return `${mountPoint}/builtin/${skillName}/${subDir}`
}
