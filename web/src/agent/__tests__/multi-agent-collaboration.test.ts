/**
 * Tests for Multi-Agent Collaboration System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getAgentBus,
  resetAgentBus,
  createMessage,
  createTask,
  sendTaskToAgent,
  type AgentMessage,
  type AgentTask,
} from '../multi-agent-collaboration'

describe('Multi-Agent Collaboration System', () => {
  beforeEach(() => {
    resetAgentBus()
  })

  afterEach(() => {
    resetAgentBus()
  })

  describe('AgentBus', () => {
    it('should initialize with built-in agents', () => {
      const bus = getAgentBus()
      const agents = bus.getAgents()

      expect(agents.length).toBeGreaterThan(0)
      expect(agents.find((a) => a.agentId === 'orchestrator')).toBeDefined()
      expect(agents.find((a) => a.agentId === 'code_agent')).toBeDefined()
      expect(agents.find((a) => a.agentId === 'data_agent')).toBeDefined()
    })

    it('should register a custom agent', () => {
      const bus = getAgentBus()

      bus.registerAgent({
        agentId: 'custom_agent',
        name: 'Custom Agent',
        description: 'A custom test agent',
        canHandle: ['test', 'custom'],
        maxConcurrentTasks: 5,
        currentLoad: 0,
      })

      const agent = bus.getAgent('custom_agent')
      expect(agent).toBeDefined()
      expect(agent?.name).toBe('Custom Agent')
    })

    it('should unregister an agent', () => {
      const bus = getAgentBus()
      bus.registerAgent({
        agentId: 'temp_agent',
        name: 'Temp Agent',
        description: 'Temporary agent',
        canHandle: ['temp'],
        maxConcurrentTasks: 1,
        currentLoad: 0,
      })

      bus.unregisterAgent('temp_agent')
      const agent = bus.getAgent('temp_agent')

      expect(agent).toBeUndefined()
    })

    it('should find agents for a task type', () => {
      const bus = getAgentBus()

      const codeAgents = bus.findAgentsForTask('code-analysis')
      expect(codeAgents.length).toBeGreaterThan(0)
      expect(codeAgents[0].agentId).toBe('code_agent')

      const dataAgents = bus.findAgentsForTask('analyze-data')
      expect(dataAgents.length).toBeGreaterThan(0)
      expect(dataAgents[0].agentId).toBe('data_agent')
    })
  })

  describe('Message Sending', () => {
    it('should send message to specific agents', async () => {
      const bus = getAgentBus()

      const message = createMessage('query', 'system', ['code_agent'], { action: 'test' })

      const responses = await bus.send(message)

      expect(responses).toHaveLength(1)
      expect(responses[0].agentId).toBe('code_agent')
      expect(responses[0].success).toBe(true)
    })

    it('should broadcast message to all agents', async () => {
      const bus = getAgentBus()

      const responses = await bus.broadcast({
        id: 'test_broadcast',
        type: 'notification',
        from: 'system',
        payload: { message: 'Hello all' },
        timestamp: Date.now(),
      })

      expect(responses.length).toBeGreaterThan(0)
      responses.forEach((response) => {
        expect(response.success).toBe(true)
      })
    })

    it('should maintain message history', async () => {
      const bus = getAgentBus()

      const message = createMessage('query', 'system', ['code_agent'], { test: 'data' })

      await bus.send(message)
      const history = bus.getHistory()

      expect(history.length).toBeGreaterThan(0)
      expect(history[0].id).toBe(message.id)
    })

    it('should filter history by agent', async () => {
      const bus = getAgentBus()

      await bus.send({
        id: 'msg1',
        type: 'query',
        from: 'code_agent',
        to: ['data_agent'],
        payload: {},
        timestamp: Date.now(),
      })

      await bus.send({
        id: 'msg2',
        type: 'query',
        from: 'orchestrator',
        to: ['data_agent'],
        payload: {},
        timestamp: Date.now(),
      })

      const codeAgentHistory = bus.getHistory('code_agent')
      expect(codeAgentHistory.length).toBe(1)
      expect(codeAgentHistory[0].from).toBe('code_agent')

      const dataAgentHistory = bus.getHistory('data_agent')
      expect(dataAgentHistory.length).toBe(2)
    })
  })

  describe('Task Collaboration', () => {
    it('should execute independent tasks in parallel', async () => {
      const bus = getAgentBus()

      const tasks: AgentTask[] = [
        createTask('Task 1', ['code_agent']),
        createTask('Task 2', ['data_agent']),
        createTask('Task 3', ['search_agent']),
      ]

      const results = await bus.collaborate(tasks)

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.status).toBe('completed')
      })
    })

    it('should respect task dependencies', async () => {
      const bus = getAgentBus()

      const task1 = createTask('Task 1', ['code_agent'])
      const task2 = createTask('Task 2', ['data_agent'], { dependencies: [task1.id] })
      const task3 = createTask('Task 3', ['search_agent'], { dependencies: [task2.id] })

      const results = await bus.collaborate([task1, task2, task3])

      expect(results).toHaveLength(3)

      // Check that dependencies were respected
      const result1 = results.find((r) => r.id === task1.id)!
      const result2 = results.find((r) => r.id === task2.id)!
      const result3 = results.find((r) => r.id === task3.id)!

      expect(result1.completedAt!).toBeLessThanOrEqual(result2.startedAt!)
      expect(result2.completedAt!).toBeLessThanOrEqual(result3.startedAt!)
    })

    it('should handle task failures gracefully', async () => {
      const bus = getAgentBus()
      bus.unregisterAgent('code_agent')

      const task = createTask('Task for code_agent', ['code_agent'])
      const results = await bus.collaborate([task])

      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('failed')
      expect(results[0].error).toBeDefined()
    })
  })

  describe('Event Listeners', () => {
    it('should emit message events', async () => {
      const bus = getAgentBus()
      let receivedMessage: AgentMessage | null = null

      bus.on('message', (msg) => {
        receivedMessage = msg
      })

      const message = createMessage('query', 'system', ['code_agent'], { test: 'data' })

      await bus.send(message)

      expect(receivedMessage).not.toBeNull()
      expect((receivedMessage as AgentMessage | null)?.id).toBe(message.id)
    })

    it('should remove event listeners', async () => {
      const bus = getAgentBus()
      let callCount = 0

      const listener = () => {
        callCount++
      }
      bus.on('message', listener)
      bus.off('message', listener)

      await bus.broadcast({
        id: 'test',
        type: 'notification',
        from: 'system',
        payload: {},
        timestamp: Date.now(),
      })

      expect(callCount).toBe(0)
    })
  })

  describe('Statistics', () => {
    it('should return system statistics', () => {
      const bus = getAgentBus()
      const stats = bus.getStats()

      expect(stats.totalAgents).toBeGreaterThan(0)
      expect(stats.totalMessages).toBe(0)
      expect(typeof stats.agentLoads).toBe('object')
    })

    it('should track message count', async () => {
      const bus = getAgentBus()

      await bus.broadcast({
        id: 'msg1',
        type: 'notification',
        from: 'system',
        payload: {},
        timestamp: Date.now(),
      })

      const stats = bus.getStats()
      expect(stats.totalMessages).toBeGreaterThan(0)
    })
  })

  describe('Utility Functions', () => {
    it('should create message with auto-generated ID', () => {
      const message = createMessage('query', 'system', ['code_agent'], { test: 'data' })

      expect(message.id).toBeDefined()
      expect(message.id).toMatch(/^msg_/)
      expect(message.type).toBe('query')
      expect(message.from).toBe('system')
      expect(message.to).toEqual(['code_agent'])
    })

    it('should create task with auto-generated ID', () => {
      const task = createTask('Test task', ['code_agent'])

      expect(task.id).toBeDefined()
      expect(task.id).toMatch(/^task_/)
      expect(task.description).toBe('Test task')
      expect(task.assignedTo).toEqual(['code_agent'])
      expect(task.status).toBe('pending')
    })

    it('should create task with custom options', () => {
      const task = createTask('Test task', ['code_agent'], {
        id: 'custom_task_id',
        dependencies: ['task1', 'task2'],
      })

      expect(task.id).toBe('custom_task_id')
      expect(task.dependencies).toEqual(['task1', 'task2'])
    })
  })

  describe('sendTaskToAgent', () => {
    it('should send task and wait for response', async () => {
      const response = await sendTaskToAgent('code_agent', 'Analyze code')

      expect(response.agentId).toBe('code_agent')
      expect(response.success).toBe(true)
      expect(response.data).toBeDefined()
    })

    it('should reject for non-existent agent', async () => {
      await expect(sendTaskToAgent('non_existent_agent', 'Test task')).rejects.toThrow()
    })
  })
})
