/**
 * Types for the Tool Searcher specialized agent.
 *
 * This agent is spawned by search_tools (when semantic=true) to perform
 * semantic tool matching across all external tool descriptions using an LLM.
 */

/** A single tool result returned by the tool-searcher agent */
export interface ToolSearcherResultItem {
  /** Full tool name (e.g. "workspace_jianguoyun_com__message_send_text") */
  full_tool_name: string
  /** Why this tool was selected (for the main agent's understanding) */
  relevance_reason: string
  /** Complete input schema from get_tools_schema */
  input_schema: Record<string, unknown>
  /** Tool description */
  description: string
}

/** Final structured result from the tool-searcher agent */
export interface ToolSearcherResult {
  tools: ToolSearcherResultItem[]
}

/** Input to the tool-searcher agent */
export interface ToolSearcherInput {
  /** The user's search query / intent */
  query: string
  /** Pre-formatted text of all tool names + descriptions */
  allToolDescriptionsText: string
}
