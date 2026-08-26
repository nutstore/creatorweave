/** Shared types for the skill-searcher subagent. */

export interface SkillSearcherInput {
  /** User's search query / intent */
  query: string
  /** Pre-formatted text of ALL skill names + descriptions (for LLM system prompt) */
  allSkillDescriptionsText: string
}

export interface SkillSearcherResult {
  skills: SkillSearcherResultItem[]
}

export interface SkillSearcherResultItem {
  skill_name: string
  relevance_reason: string
  description: string
}

export interface SkillRerankerInput {
  intent: string
  candidates: SkillRerankCandidate[]
  topK?: number
}

export interface SkillRerankCandidate {
  name: string
  description: string
  category: string
  bm25Score: number
}

export interface SkillRerankerResult {
  skills: SkillSearcherResultItem[]
}
