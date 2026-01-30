/**
 * Skill Matcher - matches skills to conversation context.
 *
 * Scoring algorithm:
 * - Keyword match: 50% weight
 * - Tag match: 20% weight
 * - Category inference: 30% weight
 *
 * Returns skills sorted by score, above a threshold.
 */

import type { Skill, SkillMatch, SkillMatchContext } from './skill-types'

/** Minimum score threshold to include a skill */
const MATCH_THRESHOLD = 0.15

/** Maximum number of skills to inject */
const MAX_INJECTED_SKILLS = 3

/** Weight configuration */
const WEIGHTS = {
  keyword: 0.5,
  tag: 0.2,
  category: 0.3,
} as const

/** Category inference keywords */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'code-review': ['review', 'code review', 'pr', 'pull request', 'feedback', 'inspect'],
  testing: ['test', 'unit test', 'e2e', 'coverage', 'spec', 'jest', 'vitest', 'assert'],
  debugging: ['debug', 'bug', 'error', 'fix', 'issue', 'crash', 'trace', 'breakpoint'],
  refactoring: ['refactor', 'cleanup', 'restructure', 'extract', 'rename', 'simplify'],
  documentation: ['document', 'readme', 'docs', 'comment', 'jsdoc', 'api doc', 'guide'],
  security: ['security', 'vulnerability', 'xss', 'injection', 'auth', 'encrypt', 'owasp'],
  performance: ['performance', 'optimize', 'speed', 'memory', 'cache', 'benchmark', 'profil'],
  architecture: ['architecture', 'design', 'pattern', 'module', 'structure', 'layer'],
}

/**
 * Find matching skills for the given context.
 */
export function matchSkills(skills: Skill[], context: SkillMatchContext): SkillMatch[] {
  const messageLower = context.userMessage.toLowerCase()
  const messageWords = extractWords(messageLower)

  const matches: SkillMatch[] = []

  for (const skill of skills) {
    if (!skill.enabled) continue

    const keywordScore = computeKeywordScore(skill, messageWords, messageLower)
    const tagScore = computeTagScore(skill, messageWords)
    const categoryScore = computeCategoryScore(skill, messageLower, context)

    const totalScore =
      keywordScore * WEIGHTS.keyword + tagScore * WEIGHTS.tag + categoryScore * WEIGHTS.category

    if (totalScore >= MATCH_THRESHOLD) {
      matches.push({
        skill,
        score: totalScore,
        matchFactors: { keywordScore, tagScore, categoryScore },
      })
    }
  }

  // Sort by score descending, take top N
  matches.sort((a, b) => b.score - a.score)
  return matches.slice(0, MAX_INJECTED_SKILLS)
}

/**
 * Build the skills injection block for the system prompt.
 */
export function buildSkillsPrompt(matches: SkillMatch[]): string {
  if (matches.length === 0) return ''

  const sections = matches.map((m) => {
    let block = `## Skill: ${m.skill.name}\n\n${m.skill.instruction}`
    if (m.skill.examples) {
      block += `\n\n### Examples\n${m.skill.examples}`
    }
    return block
  })

  return `\n\n---\n# Active Skills\n\n${sections.join('\n\n---\n\n')}`
}

// ============================================================================
// Internal scoring functions
// ============================================================================

/** Compute keyword match score (0-1) */
function computeKeywordScore(skill: Skill, messageWords: string[], messageLower: string): number {
  const keywords = skill.triggers.keywords
  if (keywords.length === 0) return 0

  let matched = 0
  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase()
    // Check both exact word match and substring match
    if (messageWords.includes(kwLower) || messageLower.includes(kwLower)) {
      matched++
    }
  }

  return matched / keywords.length
}

/** Compute tag match score (0-1) */
function computeTagScore(skill: Skill, messageWords: string[]): number {
  const tags = skill.tags
  if (tags.length === 0) return 0

  let matched = 0
  for (const tag of tags) {
    if (messageWords.includes(tag.toLowerCase())) {
      matched++
    }
  }

  return matched / tags.length
}

/** Compute category inference score (0-1) */
function computeCategoryScore(
  skill: Skill,
  messageLower: string,
  context: SkillMatchContext
): number {
  // Infer category from message
  const inferredCategories = inferCategories(messageLower)

  let score = 0

  // Direct category match
  if (inferredCategories.includes(skill.category)) {
    score = 1.0
  }

  // File extension match (bonus)
  if (skill.triggers.fileExtensions && context.activeFileExtensions) {
    const extOverlap = skill.triggers.fileExtensions.filter((ext) =>
      context.activeFileExtensions!.includes(ext)
    )
    if (extOverlap.length > 0) {
      score = Math.max(score, 0.5)
    }
  }

  return score
}

/** Infer categories from message text */
function inferCategories(message: string): string[] {
  const categories: string[] = []
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (message.includes(kw)) {
        categories.push(category)
        break
      }
    }
  }
  return categories
}

/** Extract words from text */
function extractWords(text: string): string[] {
  return text
    .split(/[\s,.:;!?()[\]{}"'`]+/)
    .filter((w) => w.length > 1)
    .map((w) => w.toLowerCase())
}
