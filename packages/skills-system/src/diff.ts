/**
 * @creatorweave/skills-system - Diff
 *
 * Compares local (on-disk) manifest against the bundled manifest
 * to determine which skills need to be added, updated, or are unchanged.
 */

import type {
  BuiltinSkillsManifest,
  BuiltinSkillManifest,
  SkillDiff,
} from './types'

/**
 * Compute the diff between local and bundled manifests.
 *
 * - Added: present in bundled but not in local
 * - Updated: present in both, but version differs
 * - Unchanged: present in both with the same version
 */
export function computeDiff(
  local: BuiltinSkillsManifest | null,
  bundled: BuiltinSkillsManifest
): SkillDiff {
  const localMap = new Map<string, BuiltinSkillManifest>()
  if (local) {
    for (const skill of local.skills) {
      localMap.set(skill.name, skill)
    }
  }

  const added: BuiltinSkillManifest[] = []
  const updated: BuiltinSkillManifest[] = []
  const unchanged: BuiltinSkillManifest[] = []

  for (const bundledSkill of bundled.skills) {
    const localSkill = localMap.get(bundledSkill.name)
    if (!localSkill) {
      added.push(bundledSkill)
    } else if (localSkill.version !== bundledSkill.version) {
      updated.push(bundledSkill)
    } else {
      unchanged.push(bundledSkill)
    }
  }

  return { added, updated, unchanged }
}
