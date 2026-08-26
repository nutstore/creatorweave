import type { ToolDefinition } from '../../tools/tool-types'

/** Exit tool for the skill searcher — no executor, the bridge reads arguments directly. */
export const submitSkillSearchResultsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_skill_search_results',
    description: 'Submit the final skill search results. You MUST call this in your response.',
    parameters: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              skill_name: {
                type: 'string',
                description: 'The EXACT skill name from the Available Skills list',
              },
              relevance_reason: {
                type: 'string',
                description: 'Why this skill matches the user request',
              },
              description: {
                type: 'string',
                description: 'Short description of the skill',
              },
            },
            required: ['skill_name', 'relevance_reason', 'description'],
          },
        },
      },
      required: ['skills'],
    },
  },
}

/** Exit tool for the reranker — same shape, different name for clarity. */
export const submitSkillRerankedResultsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_skill_reranked_results',
    description: 'Submit the re-ranked skill list. You MUST call this in your response.',
    parameters: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              skill_name: {
                type: 'string',
                description: 'The EXACT skill name from the Candidate list',
              },
              relevance_reason: {
                type: 'string',
                description: 'Why this skill is relevant',
              },
              description: {
                type: 'string',
                description: 'Short description of the skill',
              },
            },
            required: ['skill_name', 'relevance_reason', 'description'],
          },
        },
      },
      required: ['skills'],
    },
  },
}
