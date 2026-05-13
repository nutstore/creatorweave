/**
 * Skill Tools - read_skill and read_skill_resource tools
 *
 * These tools allow the LLM to load skill content and resources on-demand
 * instead of injecting all skills into the system prompt.
 */

import type { ToolDefinition, ToolExecutor, ToolContext, ToolPromptDoc } from '@/agent/tools/tool-types'
import { toolOkJson, toolErrorJson } from '@/agent/tools/tool-envelope'
import { formatResourceList } from './skill-resources'
import { getSkillManager } from './skill-manager'

//=============================================================================
// read_skill Tool
//=============================================================================

/**
 * Static tool definition for read_skill
 */
export const readSkillDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_skill',
    description:
      "Load the full content of a skill by its name. Use this when you need detailed instructions for a task that matches a skill's description. Only load skills listed in <available_skills>.",
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'The name of the skill to load (e.g., "code-review", "debugging")',
        },
      },
      required: ['skill_name'],
    },
  },
}

/**
 * Executor for read_skill tool
 * Returns full skill content including instruction, examples, and resource list
 */
export const readSkillExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  const { skill_name } = args as { skill_name: string }
  const manager = getSkillManager()
  await manager.initialize()

  // Case-insensitive lookup
  const skillName = skill_name.toLowerCase().trim()
  const skill = manager.getSkillByName(skillName)

  if (!skill) {
    const availableSkills = manager.getEnabledSkillNames()
    return toolErrorJson('read_skill', 'skill_not_found', `Skill '${skill_name}' not found. Available skills: ${availableSkills.join(', ')}`)
  }

  // Get associated resources
  const resources = await manager.getSkillResources(skill.id)

  // Format output
  let output = `# ${skill.name}

**Version:** ${skill.version}
**Author:** ${skill.author || 'Unknown'}
**Category:** ${skill.category}
**Tags:** ${skill.tags.join(', ') || 'None'}

---

${skill.instruction}
`

  if (skill.examples) {
    try {
      const examples = JSON.parse(skill.examples)
      if (Array.isArray(examples) && examples.length > 0) {
        output += `\n## Examples\n\n`
        examples.forEach((ex: unknown, i: number) => {
          output += `### Example ${i + 1}\n\`\`\`\n${JSON.stringify(ex, null, 2)}\n\`\`\`\n\n`
        })
      }
    } catch {
      // If examples is not valid JSON, include as-is
      output += `\n## Examples\n\n${skill.examples}\n`
    }
  }

  if (skill.templates) {
    try {
      const templates = JSON.parse(skill.templates)
      if (Array.isArray(templates) && templates.length > 0) {
        output += `\n## Templates\n\n`
        templates.forEach((tmpl: unknown, i: number) => {
          output += `### Template ${i + 1}\n\`\`\`\n${JSON.stringify(tmpl, null, 2)}\n\`\`\`\n\n`
        })
      }
    } catch {
      // If templates is not valid JSON, include as-is
      output += `\n## Templates\n\n${skill.templates}\n`
    }
  }

  // Append resource list
  if (resources.length > 0) {
    output += formatResourceList(resources)
  }

  output += `\n---\n*Skill: ${skill.name}*`

  return toolOkJson('read_skill', output)
}

//=============================================================================
// read_skill_resource Tool
//=============================================================================

/**
 * Static tool definition for read_skill_resource
 * The skill_name and resource_path are validated at runtime
 */
export const readSkillResourceDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_skill_resource',
    description:
      'Read a specific resource file from a skill (reference, script, or asset).\n\nAvailable resources are listed when you call read_skill.',
    parameters: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'The name of the skill that owns this resource',
        },
        resource_path: {
          type: 'string',
          description:
            'The path to the resource (e.g., "references/api-docs.md", "scripts/analyze.py")',
        },
      },
      required: ['skill_name', 'resource_path'],
    },
  },
}

/**
 * Executor for read_skill_resource tool
 * Returns the content of a specific resource file
 */
export const readSkillResourceExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  const { skill_name, resource_path } = args as { skill_name: string; resource_path: string }
  const manager = getSkillManager()
  await manager.initialize()

  // Case-insensitive skill lookup
  const skillName = skill_name.toLowerCase().trim()
  const skill = manager.getSkillByName(skillName)

  if (!skill) {
    return toolErrorJson('read_skill_resource', 'skill_not_found', `Skill '${skill_name}' not found. Please check the skill name and try again.`)
  }

  // Get the resource
  const available = await manager.getSkillResources(skill.id)
  const resource = available.find((r) => r.resourcePath === resource_path)

  if (!resource) {
    const availablePaths = available.map((r) => `  - ${r.resourcePath}`).join('\n')
    return toolErrorJson(
      'read_skill_resource',
      'resource_not_found',
      `Resource '${resource_path}' not found in skill '${skill_name}'.\n\nAvailable resources in this skill:\n${availablePaths || '  (none)'}`
    )
  }

  // Format output with content type information
  const typeLabel = resource.resourceType.charAt(0).toUpperCase() + resource.resourceType.slice(1)
  const output = `# ${resource.skillId}/${resource.resourcePath}

**Type:** ${typeLabel}
**Content-Type:** ${resource.contentType}
**Size:** ${resource.size} bytes

---

${resource.content}`

  return toolOkJson('read_skill_resource', output)
}

export const skillPromptDoc: ToolPromptDoc = {
  category: 'skills',
  section: '### Skill Tools',
  lines: [
    '- `read_skill(skill_name)` - Load the full content of a skill by its name. Only load skills listed in <available_skills>.',
    '- `read_skill_resource(skill_name, resource_path)` - Read a specific resource file from a skill (reference, script, or asset)',
  ],
}
