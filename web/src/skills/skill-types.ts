/**
 * Skill System Types - defines the data structures for the Skills system.
 *
 * Skills are reusable knowledge units (instructions, examples, templates)
 * that can be injected into the Agent's system prompt based on context matching.
 *
 * Format is compatible with SKILL.md (YAML frontmatter + Markdown body).
 */

/** Skill source origin */
export type SkillSource = 'builtin' | 'user' | 'import' | 'project'

/** Skill category for classification */
export type SkillCategory =
  | 'code-review'
  | 'testing'
  | 'debugging'
  | 'refactoring'
  | 'documentation'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'general'

/** Trigger definition for automatic skill matching */
export interface SkillTrigger {
  /** Keywords that activate this skill (case-insensitive) */
  keywords: string[]
  /** File extensions that activate this skill (e.g. ".ts", ".rs") */
  fileExtensions?: string[]
}

/** Skill metadata (always loaded) */
export interface SkillMetadata {
  id: string
  name: string
  version: string
  description: string
  author: string
  category: SkillCategory
  tags: string[]
  source: SkillSource
  /** Trigger conditions for auto-matching */
  triggers: SkillTrigger
  /** Whether this skill is enabled */
  enabled: boolean
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
}

/** Full skill data (loaded on demand) */
export interface Skill extends SkillMetadata {
  /** Main instruction content (Markdown) */
  instruction: string
  /** Optional examples section */
  examples?: string
  /** Optional template snippets */
  templates?: string
}

/** Skill stored in IndexedDB */
export interface StoredSkill extends Skill {
  /** Raw source content (original SKILL.md text) */
  rawContent: string
}

/** Skill match result from the matcher */
export interface SkillMatch {
  skill: Skill
  /** Match score (0-1) */
  score: number
  /** Which factors contributed to the match */
  matchFactors: {
    keywordScore: number
    tagScore: number
    categoryScore: number
  }
}

/** Context for skill matching */
export interface SkillMatchContext {
  /** User's current message text */
  userMessage: string
  /** Currently open file extensions */
  activeFileExtensions?: string[]
  /** Recent conversation topics (extracted keywords) */
  recentTopics?: string[]
}

/** IndexedDB schema version */
export const SKILLS_DB_NAME = 'bfosa-skills'
export const SKILLS_DB_VERSION = 1
export const SKILLS_STORE_NAME = 'skills'
