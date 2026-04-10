import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceCoordinator } from '../intelligence-coordinator'

const {
  recommendMock,
  getToolRecommendationsForPromptMock,
  scanMock,
  formatFingerprintForPromptMock,
  getMemoryBlockForPromptMock,
  processMessageMock,
  getProjectMock,
  buildAgentPromptMock,
} = vi.hoisted(() => {
  return {
    recommendMock: vi.fn(() => []),
    getToolRecommendationsForPromptMock: vi.fn(() => ''),
    scanMock: vi.fn(async () => null),
    formatFingerprintForPromptMock: vi.fn(() => ''),
    getMemoryBlockForPromptMock: vi.fn(async () => ''),
    processMessageMock: vi.fn(async () => {}),
    getProjectMock: vi.fn(),
    buildAgentPromptMock: vi.fn(() => 'AGENT_PROMPT'),
  }
})

vi.mock('../tools/tool-recommendation', () => ({
  getRecommendationEngine: () => ({
    recommend: recommendMock,
    getAllTools: vi.fn(() => ({})),
  }),
  getToolRecommendationsForPrompt: getToolRecommendationsForPromptMock,
}))

vi.mock('../project-fingerprint', () => ({
  getFingerprintScanner: () => ({
    scan: scanMock,
    quickScan: vi.fn(async () => 'unknown'),
  }),
  formatFingerprintForPrompt: formatFingerprintForPromptMock,
  getProjectTypeDescription: vi.fn(() => ''),
}))

vi.mock('../context-memory', () => ({
  getContextMemoryManager: () => ({
    processMessage: processMessageMock,
  }),
  getMemoryBlockForPrompt: getMemoryBlockForPromptMock,
}))

vi.mock('@/opfs', () => ({
  ProjectManager: {
    create: vi.fn(async () => ({
      getProject: getProjectMock,
    })),
  },
}))

vi.mock('../prompt-builder', () => ({
  buildAgentPrompt: buildAgentPromptMock,
}))

function createAgentInfo(id = 'default') {
  return {
    id,
    meta: { id, name: id, createdAt: Date.now(), lastAccessedAt: Date.now() },
    soul: '# SOUL',
    identity: '# IDENTITY',
    agents: '# AGENTS',
    user: '# USER',
    memory: '# MEMORY',
  }
}

describe('IntelligenceCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProjectMock.mockResolvedValue(null)
  })

  it('injects agent prompt when projectId is provided', async () => {
    const agentInfo = createAgentInfo('default')
    getProjectMock.mockResolvedValue({
      agentManager: {
        getAgent: vi.fn(async () => agentInfo),
        readTodayLog: vi.fn(async () => null),
      },
    })

    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT', { projectId: 'proj-store' })

    expect(result.agentInfo?.id).toBe('default')
    expect(result.systemPrompt).toContain('AGENT_PROMPT\n\n---\n\nBASE_PROMPT')
    expect(getProjectMock).toHaveBeenCalledWith('proj-store')
  })

  it('injects routed agent prompt when currentAgentId is provided', async () => {
    const routedAgent = createAgentInfo('novel-editor')
    const defaultAgent = createAgentInfo('default')
    const getAgentMock = vi.fn(async (id: string) =>
      id === 'novel-editor' ? routedAgent : defaultAgent
    )
    getProjectMock.mockResolvedValue({
      agentManager: {
        getAgent: getAgentMock,
        readTodayLog: vi.fn(async () => null),
      },
    })

    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT', {
      projectId: 'proj-store',
      currentAgentId: 'novel-editor',
    })

    expect(getAgentMock).toHaveBeenCalledWith('novel-editor')
    expect(result.agentInfo?.id).toBe('novel-editor')
    expect(result.systemPrompt).toContain('AGENT_PROMPT\n\n---\n\nBASE_PROMPT')
  })

  it('falls back to default agent prompt when routed agent is missing', async () => {
    const defaultAgent = createAgentInfo('default')
    const getAgentMock = vi.fn(async (id: string) => (id === 'default' ? defaultAgent : null))
    getProjectMock.mockResolvedValue({
      agentManager: {
        getAgent: getAgentMock,
        readTodayLog: vi.fn(async () => null),
      },
    })

    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT', {
      projectId: 'proj-store',
      currentAgentId: 'novel-editor',
    })

    expect(getAgentMock).toHaveBeenCalledWith('novel-editor')
    expect(getAgentMock).toHaveBeenCalledWith('default')
    expect(result.agentInfo?.id).toBe('default')
    expect(result.systemPrompt).toContain('AGENT_PROMPT\n\n---\n\nBASE_PROMPT')
  })

  it('does not inject agent prompt when no projectId is provided', async () => {
    const coordinator = new IntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt('BASE_PROMPT')

    expect(result.agentInfo).toBeNull()
    expect(result.systemPrompt).toBe('BASE_PROMPT')
    expect(buildAgentPromptMock).not.toHaveBeenCalled()
  })
})
