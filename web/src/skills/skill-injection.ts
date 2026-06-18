/**
 * Skill Injection - Builds the skills system prompt block
 *
 * This module generates the XML block that lists available skills
 * and provides usage instructions for on-demand loading.
 *
 * Design: all enabled skills' metadata (including triggers) is injected into
 * the system prompt. The LLM decides which skill to activate based on the
 * description and triggers — there is no server-side recommendation/scoring.
 */

import type { SkillMetadata } from './skill-types'

//=============================================================================
// Available Skills Block Generation
//=============================================================================

/**
 * Build the <skills_system> XML block for system prompt.
 *
 * Injects metadata for all enabled skills. The LLM reads the descriptions and
 * triggers to decide which skill (if any) to load via `read_skill`.
 */
export function buildAvailableSkillsBlock(allSkills: SkillMetadata[]): string {
  // Filter enabled skills
  const enabledSkills = allSkills.filter((s) => s.enabled)

  if (enabledSkills.length === 0) {
    return ''
  }

  // Generate skills list (flat, no category headings that could be mistaken for skill names)
  let skillsList = ''
  for (const skill of enabledSkills) {
    skillsList += formatSkillMetadata(skill)
  }

  return `<skills_system priority="1">

## Available Skills

<usage>
Before handling a task, check if any skill below matches it. If one does, call read_skill to load its instructions and follow its approach — skill methods and scripts are pre-validated for this workspace and should be your first choice. Fall back to your own approach only if the skill cannot fully handle the task.

How to use skills:
- Use the read_skill tool with the <name> value to load the full skill content
- The skill content will provide detailed instructions, scripts, and workflows
- For skill scripts, use read_skill_resource to read and understand the script first. Built-in skills are auto-mounted at \`/mnt_skills/builtin/{skill-name}/\` (no sync needed); user skills are at \`/mnt_skills/user/{skill-dir}/\` (no sync needed); workspace skills are at \`/mnt/\${rootName}/.skills/\${skill-dir}/\`
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Do NOT pass category names to read_skill; only use the exact <name> value from a <skill> entry
</usage>

<available_skills>

${skillsList}

</available_skills>

</skills_system>`
}

/**
 * Format a single skill's metadata for the available skills list.
 *
 * Triggers (keywords/fileExtensions) are included so the LLM can use them as
 * activation hints alongside the description.
 */
function formatSkillMetadata(skill: SkillMetadata): string {
  const tags = skill.tags.join(',') || 'none'
  const keywords = skill.triggers.keywords.join(',') || 'none'
  const fileExtensions = skill.triggers.fileExtensions?.join(',') || ''

  return `<skill>
<name>${skill.name}</name>
<displayName>${skill.name}</displayName>
<description>${skill.description}</description>
<category>${skill.category}</category>
<tags>${tags}</tags>
<triggers>
  <keywords>${keywords}</keywords>
  ${fileExtensions ? `<fileExtensions>${fileExtensions}</fileExtensions>` : ''}
</triggers>
</skill>

`
}
