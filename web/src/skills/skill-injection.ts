/**
 * Skill Injection - Builds the skills system prompt block
 *
 * This module generates the XML block that lists available skills
 * and provides usage instructions for on-demand loading.
 */

import type { SkillMetadata, SkillMatchContext } from './skill-types'

//=============================================================================
// Types
//=============================================================================

/**
 * Session skill recommendation state
 * This should be stored per-conversation (in Agent instance)
 */
export interface SessionSkillState {
  /** Accumulated recommended skill IDs (lowercase) */
  recommendedSkills: Set<string>
}

/**
 * Result from skill matching
 */
export interface SkillMatchResult {
  skillId: string
  skillName: string
  score: number
  matchFactors: {
    keywordScore: number
    tagScore: number
    categoryScore: number
  }
}

//=============================================================================
// Session State Management (to be used by Agent)
//=============================================================================

/**
 * Create a new session skill state
 */
export function createSessionSkillState(): SessionSkillState {
  return {
    recommendedSkills: new Set<string>(),
  }
}

/**
 * Update recommendations based on matches
 * Adds new recommendations without removing existing ones (accumulative)
 */
export function updateRecommendations(state: SessionSkillState, matches: SkillMatchResult[]): void {
  for (const match of matches) {
    state.recommendedSkills.add(match.skillName.toLowerCase())
  }
}

/**
 * Get recommended skill names as a formatted string
 */
export function getRecommendedSkillsString(state: SessionSkillState): string {
  if (state.recommendedSkills.size === 0) return ''
  return `Recommended skills: ${Array.from(state.recommendedSkills).join(', ')}`
}

/**
 * Clear session state (for new conversation)
 */
export function clearSessionState(state: SessionSkillState): void {
  state.recommendedSkills.clear()
}

/**
 * Check if a skill is recommended
 */
export function isSkillRecommended(state: SessionSkillState, skillName: string): boolean {
  return state.recommendedSkills.has(skillName.toLowerCase())
}

//=============================================================================
// Available Skills Block Generation
//=============================================================================

/**
 * Build the <skills_system> XML block for system prompt
 * This replaces the old buildSkillsPrompt with metadata-only injection
 */
export function buildAvailableSkillsBlock(
  allSkills: SkillMetadata[],
  _context: SkillMatchContext,
  _updateRecommendations?: (matches: SkillMatchResult[]) => void
): string {
  // Filter enabled skills
  const enabledSkills = allSkills.filter((s) => s.enabled)

  if (enabledSkills.length === 0) {
    return ''
  }

  // Group by category for better organization
  const byCategory = new Map<string, SkillMetadata[]>()
  for (const skill of enabledSkills) {
    if (!byCategory.has(skill.category)) {
      byCategory.set(skill.category, [])
    }
    byCategory.get(skill.category)!.push(skill)
  }

  // Generate skills list
  let skillsList = ''
  for (const [category, skills] of byCategory.entries()) {
    skillsList += `\n#### ${category}\n\n`
    for (const skill of skills) {
      skillsList += formatSkillMetadata(skill)
    }
  }

  // Generate recommendations (placeholder - actual matching happens elsewhere)
  const recommendedString = ''

  return `<skills_system priority="1">

## Available Skills

<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Use the read_skill tool to load the full skill content
- The skill content will provide detailed instructions on how to complete the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context

${recommendedString}
</usage>

<available_skills>

${skillsList}

</available_skills>

</skills_system>`
}

/**
 * Format a single skill's metadata for the available skills list
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

/**
 * Build available skills block with recommendations
 * Use this when you have session state and match results
 */
export function buildAvailableSkillsBlockWithRecommendations(
  allSkills: SkillMetadata[],
  sessionState: SessionSkillState,
  matches: SkillMatchResult[]
): string {
  // Update recommendations
  for (const match of matches) {
    sessionState.recommendedSkills.add(match.skillName.toLowerCase())
  }

  // Get recommended string
  const recommendedString = getRecommendedSkillsString(sessionState)

  // Filter enabled skills
  const enabledSkills = allSkills.filter((s) => s.enabled)

  if (enabledSkills.length === 0) {
    return ''
  }

  // Group by category
  const byCategory = new Map<string, SkillMetadata[]>()
  for (const skill of enabledSkills) {
    if (!byCategory.has(skill.category)) {
      byCategory.set(skill.category, [])
    }
    byCategory.get(skill.category)!.push(skill)
  }

  // Generate skills list
  let skillsList = ''
  for (const [category, skills] of byCategory.entries()) {
    skillsList += `\n#### ${category}\n\n`
    for (const skill of skills) {
      skillsList += formatSkillMetadata(skill)
    }
  }

  return `<skills_system priority="1">

## Available Skills

<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Use the read_skill tool to load the full skill content
- The skill content will provide detailed instructions on how to complete the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context

${recommendedString}
</usage>

<available_skills>

${skillsList}

</available_skills>

</skills_system>`
}

//=============================================================================
// Simple Matcher (for recommendation generation)
//=============================================================================

/**
 * Simple skill matcher for generating recommendations
 * This is a lightweight matcher that doesn't load full skill content
 */
export function matchSkillsForRecommendation(
  skills: SkillMetadata[],
  context: SkillMatchContext
): SkillMatchResult[] {
  const results: SkillMatchResult[] = []
  const userMessageLower = context.userMessage.toLowerCase()

  for (const skill of skills) {
    if (!skill.enabled) continue

    let keywordScore = 0
    let tagScore = 0
    const categoryScore = 0

    // Keyword matching
    for (const keyword of skill.triggers.keywords) {
      if (userMessageLower.includes(keyword.toLowerCase())) {
        keywordScore += 0.3
      }
    }

    // Tag matching
    if (context.recentTopics) {
      for (const topic of context.recentTopics) {
        if (skill.tags.some((tag) => tag.toLowerCase() === topic.toLowerCase())) {
          tagScore += 0.2
        }
      }
    }

    // File extension matching
    if (context.activeFileExtensions && skill.triggers.fileExtensions) {
      for (const ext of context.activeFileExtensions) {
        if (skill.triggers.fileExtensions.includes(ext)) {
          keywordScore += 0.2
        }
      }
    }

    // Calculate total score
    const totalScore = keywordScore + tagScore + categoryScore

    // Only include if there's some relevance
    if (totalScore > 0.1) {
      results.push({
        skillId: skill.id,
        skillName: skill.name,
        score: Math.min(totalScore, 1),
        matchFactors: {
          keywordScore: Math.min(keywordScore, 1),
          tagScore: Math.min(tagScore, 1),
          categoryScore: Math.min(categoryScore, 1),
        },
      })
    }
  }

  // Sort by score and return top matches
  return results.sort((a, b) => b.score - a.score)
}
