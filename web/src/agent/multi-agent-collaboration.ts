/**
 * Multi-Agent Collaboration System
 *
 * Implements event-driven multi-agent communication with:
 * - Agent bus for message passing
 * - Broadcast and unicast communication
 * - Collaboration for complex tasks
 * - Event history tracking
 *
 * @module multi-agent-collaboration
 */

// ============================================================================
// Types
// ============================================================================

export type AgentMessageType = 'task' | 'query' | 'response' | 'notification' | 'error'

export interface AgentMessage {
  id: string
  type: AgentMessageType
  from: string // Agent ID
  to: string[] // Target agent IDs (empty for broadcast)
  payload: unknown
  timestamp: number
  correlationId?: string // For linking related messages
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface AgentResponse {
  agentId: string
  messageId: string
  success: boolean
  data: unknown
  error?: string
  timestamp: number
}

export interface AgentTask {
  id: string
  description: string
  assignedTo: string[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  dependencies: string[] // Task IDs that must complete first
  result?: unknown
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export interface AgentCapabilities {
  agentId: string
  name: string
  description: string
  canHandle: string[] // Task types this agent can handle
  maxConcurrentTasks: number
  currentLoad: number
}

// ============================================================================
// Agent Registry
// ============================================================================

/**
 * Built-in agent types and their capabilities
 */
export const AGENT_TYPES: Record<string, AgentCapabilities> = {
  orchestrator: {
    agentId: 'orchestrator',
    name: 'Orchestrator Agent',
    description: 'Coordinates task execution and delegates to specialist agents',
    canHandle: ['coordinate', 'delegate', 'plan', 'monitor'],
    maxConcurrentTasks: 10,
    currentLoad: 0,
  },
  code_agent: {
    agentId: 'code_agent',
    name: 'Code Specialist Agent',
    description: 'Handles code analysis, generation, and refactoring tasks',
    canHandle: ['code-analysis', 'refactor', 'generate-code', 'review-code', 'debug'],
    maxConcurrentTasks: 5,
    currentLoad: 0,
  },
  data_agent: {
    agentId: 'data_agent',
    name: 'Data Analysis Agent',
    description: 'Handles data processing, analysis, and visualization',
    canHandle: ['analyze-data', 'process-csv', 'generate-chart', 'statistics', 'ml'],
    maxConcurrentTasks: 3,
    currentLoad: 0,
  },
  search_agent: {
    agentId: 'search_agent',
    name: 'Search Specialist Agent',
    description: 'Handles file searching, pattern matching, and content discovery',
    canHandle: ['search', 'grep', 'find-references', 'locate'],
    maxConcurrentTasks: 5,
    currentLoad: 0,
  },
  learning_agent: {
    agentId: 'learning_agent',
    name: 'Learning/Tutor Agent',
    description: 'Provides educational explanations and learning guidance',
    canHandle: ['explain', 'teach', 'create-plan', 'answer-question'],
    maxConcurrentTasks: 3,
    currentLoad: 0,
  },
  office_agent: {
    agentId: 'office_agent',
    name: 'Office/Productivity Agent',
    description: 'Handles document processing and office automation',
    canHandle: ['process-document', 'excel', 'report', 'automate'],
    maxConcurrentTasks: 3,
    currentLoad: 0,
  },
}

// ============================================================================
// Agent Bus
// ============================================================================

class AgentBus {
  private agents: Map<string, AgentCapabilities> = new Map()
  private messageHistory: AgentMessage[] = []
  private responseHandlers: Map<string, (response: AgentResponse) => void> = new Map()
  private eventListeners: Map<string, Set<(message: AgentMessage) => void>> = new Map()

  constructor() {
    // Register built-in agents
    Object.values(AGENT_TYPES).forEach((agent) => {
      this.agents.set(agent.agentId, { ...agent })
    })
  }

  /**
   * Register a new agent
   */
  registerAgent(capabilities: AgentCapabilities): void {
    this.agents.set(capabilities.agentId, { ...capabilities, currentLoad: 0 })
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId)
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentCapabilities[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentCapabilities | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Find agents that can handle a specific task type
   */
  findAgentsForTask(taskType: string): AgentCapabilities[] {
    return Array.from(this.agents.values()).filter((agent) => agent.canHandle.includes(taskType))
  }

  /**
   * Send a message to specific agents
   */
  async send(message: AgentMessage): Promise<AgentResponse[]> {
    const responses: AgentResponse[] = []
    const targets = message.to.length > 0 ? message.to : Array.from(this.agents.keys())

    // Add to history
    this.messageHistory.push(message)

    // Trigger event listeners
    this._emit('message', message)

    // Send to each target agent
    for (const targetId of targets) {
      const agent = this.agents.get(targetId)
      if (!agent) {
        responses.push({
          agentId: targetId,
          messageId: message.id,
          success: false,
          data: null,
          error: 'Agent not found',
          timestamp: Date.now(),
        })
        continue
      }

      try {
        // Simulate agent processing
        const result = await this._processMessage(agent, message)

        responses.push({
          agentId: targetId,
          messageId: message.id,
          success: true,
          data: result,
          timestamp: Date.now(),
        })

        // Notify response handler
        const handler = this.responseHandlers.get(message.correlationId || message.id)
        if (handler) {
          handler(responses[responses.length - 1])
        }
      } catch (error) {
        responses.push({
          agentId: targetId,
          messageId: message.id,
          success: false,
          data: null,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        })
      }
    }

    return responses
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(message: Omit<AgentMessage, 'to'>): Promise<AgentResponse[]> {
    return this.send({
      ...message,
      to: Array.from(this.agents.keys()),
    })
  }

  /**
   * Collaborate on multiple tasks in parallel
   */
  async collaborate(tasks: AgentTask[]): Promise<AgentTask[]> {
    const results: AgentTask[] = []
    const taskMap = new Map(tasks.map((t) => [t.id, t]))

    // Build dependency graph
    const completed = new Set<string>()
    let attempts = 0
    const maxAttempts = tasks.length * 2

    while (completed.size < tasks.length && attempts < maxAttempts) {
      attempts++

      // Find tasks with all dependencies completed
      const readyTasks = tasks.filter(
        (task) => !completed.has(task.id) && task.dependencies.every((dep) => completed.has(dep))
      )

      if (readyTasks.length === 0) {
        // Check if there's a circular dependency or all remaining tasks have unmet deps
        const remaining = tasks.filter((t) => !completed.has(t.id))
        if (remaining.every((t) => t.dependencies.length > 0)) {
          // Force execute first pending task
          readyTasks.push(remaining[0])
        } else {
          break
        }
      }

      // Execute ready tasks in parallel
      const taskPromises = readyTasks.map(async (task) => {
        const agents = this.findAgentsForTask(task.assignedTo[0] || 'general')
        const agent = agents[0]

        const updatedTask: AgentTask = {
          ...task,
          status: agent ? 'in_progress' : 'failed',
          startedAt: Date.now(),
        }

        if (agent) {
          try {
            // Simulate task execution
            const result = await this._executeTask(agent, task)
            updatedTask.status = 'completed'
            updatedTask.result = result
            updatedTask.completedAt = Date.now()

            // Update agent load
            agent.currentLoad = Math.max(0, agent.currentLoad - 1)
          } catch (error) {
            updatedTask.status = 'failed'
            updatedTask.error = error instanceof Error ? error.message : String(error)
            updatedTask.completedAt = Date.now()
          }
        }

        return updatedTask
      })

      const completedTasks = await Promise.all(taskPromises)
      completedTasks.forEach((task) => {
        completed.add(task.id)
        results.push(task)
        taskMap.set(task.id, task)
      })
    }

    return results
  }

  /**
   * Get message history
   */
  getHistory(agentId?: string, limit = 100): AgentMessage[] {
    let history = this.messageHistory

    if (agentId) {
      history = history.filter((m) => m.from === agentId || m.to.includes(agentId))
    }

    return history.slice(-limit)
  }

  /**
   * Register response handler for a message
   */
  onResponse(messageId: string, handler: (response: AgentResponse) => void): void {
    this.responseHandlers.set(messageId, handler)
  }

  /**
   * Add event listener
   */
  on(event: string, listener: (message: AgentMessage) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(listener)
  }

  /**
   * Remove event listener
   */
  off(event: string, listener: (message: AgentMessage) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(listener)
    }
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = []
  }

  /**
   * Get system statistics
   */
  getStats(): {
    totalAgents: number
    totalMessages: number
    agentLoads: Record<string, number>
  } {
    return {
      totalAgents: this.agents.size,
      totalMessages: this.messageHistory.length,
      agentLoads: Object.fromEntries(
        Array.from(this.agents.entries()).map(([id, agent]) => [id, agent.currentLoad])
      ),
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async _processMessage(agent: AgentCapabilities, message: AgentMessage): Promise<unknown> {
    // Update agent load
    agent.currentLoad++

    // Simulate processing based on message type
    switch (message.type) {
      case 'query':
        return {
          agent: agent.name,
          query: message.payload,
          response: `Processed by ${agent.name}`,
        }

      case 'task':
        return this._executeTask(agent, message.payload as AgentTask)

      default:
        return { acknowledged: true, agent: agent.name }
    }
  }

  private async _executeTask(
    agent: AgentCapabilities,
    task: AgentTask | unknown
  ): Promise<unknown> {
    // Simulate task execution time
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 100))

    if (task && typeof task === 'object' && 'description' in task) {
      return {
        agent: agent.name,
        task: (task as AgentTask).description,
        status: 'completed',
        result: `Task "${(task as AgentTask).description}" executed by ${agent.name}`,
      }
    }

    return {
      agent: agent.name,
      result: 'Task completed',
    }
  }

  private _emit(event: string, message: AgentMessage): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(message)
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let agentBusInstance: AgentBus | null = null

export function getAgentBus(): AgentBus {
  if (!agentBusInstance) {
    agentBusInstance = new AgentBus()
  }
  return agentBusInstance
}

export function resetAgentBus(): void {
  agentBusInstance = null
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a message with auto-generated ID
 */
export function createMessage(
  type: AgentMessageType,
  from: string,
  to: string[],
  payload: unknown,
  options?: {
    correlationId?: string
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  }
): AgentMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    from,
    to,
    payload,
    timestamp: Date.now(),
    ...options,
  }
}

/**
 * Create a task with auto-generated ID
 */
export function createTask(
  description: string,
  assignedTo: string[],
  options?: {
    dependencies?: string[]
    id?: string
  }
): AgentTask {
  return {
    id: options?.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    description,
    assignedTo,
    status: 'pending',
    dependencies: options?.dependencies || [],
    createdAt: Date.now(),
  }
}

/**
 * Send task to agent and wait for response
 */
export async function sendTaskToAgent(
  agentId: string,
  taskDescription: string,
  payload?: unknown
): Promise<AgentResponse> {
  const bus = getAgentBus()

  return new Promise((resolve, reject) => {
    const message = createMessage(
      'task',
      'system',
      [agentId],
      payload || { description: taskDescription },
      { priority: 'normal' }
    )

    bus.onResponse(message.id, (response) => {
      if (response.agentId === agentId) {
        resolve(response)
      }
    })

    bus
      .send(message)
      .then((responses) => {
        const response = responses.find((r) => r.agentId === agentId)
        if (response) {
          resolve(response)
        } else {
          reject(new Error(`No response from agent ${agentId}`))
        }
      })
      .catch(reject)
  })
}

// ============================================================================
// Exports
// ============================================================================

export { AgentBus }
export default getAgentBus
