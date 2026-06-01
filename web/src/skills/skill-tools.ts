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
import {
  listSkillResourcesFromOPFS,
  readSkillResourceFromOPFS,
  readSkillMdFromOPFS,
} from './skills-platform-adapter'

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
 * Returns full skill content including instruction, examples, and resource list.
 *
 * For builtin skills: resource list is scanned from OPFS directory.
 * For project/user skills: resource list comes from SQLite storage.
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

  // Get associated resources — read directly from OPFS for builtin skills
  const isBuiltin = skill.source === 'builtin'
  let resources: Array<{ resourcePath: string; resourceType: string; size: number; id?: string; skillId?: string; content?: string; contentType?: string; createdAt?: number }> = []

  // For builtin skills: read SKILL.md directly from OPFS to get latest content
  // (SQLite only stores metadata for fast lookup; instruction/examples/templates come from files)
  let liveInstruction = skill.instruction
  let liveExamples = skill.examples
  let liveTemplates = skill.templates

  if (isBuiltin) {
    // Builtin skills: scan OPFS directory for resource files
    resources = await listSkillResourcesFromOPFS(skill.name)

    // Read and parse SKILL.md directly from OPFS (always up-to-date)
    const skillMdContent = await readSkillMdFromOPFS(skill.name)
    if (skillMdContent) {
      const { parseSkillMd } = await import('./skill-parser')
      const parsed = parseSkillMd(skillMdContent, 'builtin')
      if (parsed.skill) {
        liveInstruction = parsed.skill.instruction
        liveExamples = parsed.skill.examples
        liveTemplates = parsed.skill.templates
      }
    }
  } else {
    // Project/user skills: use SQLite storage
    resources = await manager.getSkillResources(skill.id)
  }

  // Format output using live content
  let output = `# ${skill.name}\n\n**Version:** ${skill.version}\n**Author:** ${skill.author || 'Unknown'}\n**Category:** ${skill.category}\n**Tags:** ${skill.tags.join(', ') || 'None'}\n\n---\n\n${liveInstruction}\n`

  if (liveExamples) {
    try {
      const examples = JSON.parse(liveExamples)
      if (Array.isArray(examples) && examples.length > 0) {
        output += `\n## Examples\n\n`
        examples.forEach((ex: unknown, i: number) => {
          output += `### Example ${i + 1}\n\`\`\`\n${JSON.stringify(ex, null, 2)}\n\`\`\`\n\n`
        })
      }
    } catch {
      // If examples is not valid JSON, include as-is
      output += `\n## Examples\n\n${liveExamples}\n`
    }
  }

  if (liveTemplates) {
    try {
      const templates = JSON.parse(liveTemplates)
      if (Array.isArray(templates) && templates.length > 0) {
        output += `\n## Templates\n\n`
        templates.forEach((tmpl: unknown, i: number) => {
          output += `### Template ${i + 1}\n\`\`\`\n${JSON.stringify(tmpl, null, 2)}\n\`\`\`\n\n`
        })
      }
    } catch {
      // If templates is not valid JSON, include as-is
      output += `\n## Templates\n\n${liveTemplates}\n`
    }
  }

  // Append resource list
  if (resources.length > 0) {
    output += formatResourceList(resources as any)
  }

  // Append /mnt_skills path hint for Python execution
  if (isBuiltin) {
    output += `\n\n**Python execution path:** \`/mnt_skills/builtin/${skill.name.replace(/\s+/g, '-').toLowerCase()}/\``
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
 * Returns the content of a specific resource file.
 *
 * For builtin skills: reads directly from OPFS (no SQLite involved).
 * For project/user skills: reads from SQLite storage.
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

  // For builtin skills: read directly from OPFS
  if (skill.source === 'builtin') {
    const resource = await readSkillResourceFromOPFS(skill.name, resource_path)

    if (!resource) {
      const available = await listSkillResourcesFromOPFS(skill.name)
      const availablePaths = available.map((r) => `  - ${r.resourcePath}`).join('\n')
      return toolErrorJson(
        'read_skill_resource',
        'resource_not_found',
        `Resource '${resource_path}' not found in skill '${skill_name}'.\n\nAvailable resources in this skill:\n${availablePaths || '  (none)'}`
      )
    }

    const typeLabel = resource.resourceType.charAt(0).toUpperCase() + resource.resourceType.slice(1)
    const output = `# ${skill.id}/${resource.resourcePath}\n\n**Type:** ${typeLabel}\n**Size:** ${resource.size} bytes\n\n---\n\n${resource.content}`

    return toolOkJson('read_skill_resource', output)
  }

  // For project/user skills: use SQLite storage
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
  const output = `# ${resource.skillId}/${resource.resourcePath}\n\n**Type:** ${typeLabel}\n**Content-Type:** ${resource.contentType}\n**Size:** ${resource.size} bytes\n\n---\n\n${resource.content}`

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
