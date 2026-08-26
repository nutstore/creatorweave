/**
 * Skill Storage - SQLite persistence for skills.
 *
 * Re-exporting SQLite version for unified storage.
 */

export {
  getAllSkills,
  getAllSkillMetadata,
  getSkillById,
  saveSkill,
  deleteSkill,
  toggleSkill,
  getEnabledSkills,
  getSkillsByCategory,
  // Resource methods
  getSkillResources,
  getSkillResource,
  getResourceById,
  saveSkillResource,
  deleteSkillResource,
  deleteSkillResources,
  getSkillResourceCount,
  getSkillResourceTotalSize,
  getSkillByName,
  getAllEnabledSkillNames,
  purgeProjectSkillsFromStorage,
} from './skill-storage.sqlite'
