import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { isProtectedAgentCoreFile, resolveVfsTarget } from '../vfs-resolver'

const { getProjectMock, createProjectManagerMock, activeAgentState } = vi.hoisted(() => {
  const getProjectMockInner = vi.fn()
  const createProjectManagerMockInner = vi.fn(async () => ({
    getProject: getProjectMockInner,
  }))
  const activeAgentStateInner: { activeAgentId: string | null } = {
    activeAgentId: 'default',
  }
  return {
    getProjectMock: getProjectMockInner,
    createProjectManagerMock: createProjectManagerMockInner,
    activeAgentState: activeAgentStateInner,
  }
})

vi.mock('@/opfs', () => ({
  ProjectManager: {
    create: createProjectManagerMock,
  },
}))

vi.mock('@/store/agents.store', () => ({
  useAgentsStore: {
    getState: () => activeAgentState,
  },
}))

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    directoryHandle: null,
    projectId: 'project-1',
    currentAgentId: 'default',
    ...overrides,
  }
}

describe('vfs-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeAgentState.activeAgentId = 'default'
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('resolves non-vfs path to workspace namespace', async () => {
    const result = await resolveVfsTarget('src/a.ts', makeContext(), 'read')
    expect(result.kind).toBe('workspace')
    if (result.kind === 'workspace') {
      expect(result.path).toBe('src/a.ts')
    }
    expect(createProjectManagerMock).not.toHaveBeenCalled()
  })

  it('resolves vfs workspace path', async () => {
    const result = await resolveVfsTarget('vfs://workspace/src/a.ts', makeContext(), 'read')
    expect(result.kind).toBe('workspace')
    if (result.kind === 'workspace') {
      expect(result.path).toBe('src/a.ts')
    }
  })

  it('resolves vfs agent write with default agent permissions', async () => {
    const agentManager = { readPath: vi.fn(), writePath: vi.fn(), deletePath: vi.fn() }
    getProjectMock.mockResolvedValue({ agentManager })

    const result = await resolveVfsTarget(
      'vfs://agents/frontend/SOUL.md',
      makeContext({ currentAgentId: 'default' }),
      'write'
    )

    expect(result.kind).toBe('agent')
    if (result.kind === 'agent') {
      expect(result.agentId).toBe('frontend')
      expect(result.path).toBe('SOUL.md')
      expect(result.projectId).toBe('project-1')
      expect(result.agentManager).toBe(agentManager)
    }
  })

  it('accepts Chinese agent id in vfs path', async () => {
    const agentManager = { readPath: vi.fn(), writePath: vi.fn(), deletePath: vi.fn() }
    getProjectMock.mockResolvedValue({ agentManager })

    const result = await resolveVfsTarget(
      'vfs://agents/墨染/IDENTITY.md',
      makeContext({ currentAgentId: 'default' }),
      'write'
    )

    expect(result.kind).toBe('agent')
    if (result.kind === 'agent') {
      expect(result.agentId).toBe('墨染')
      expect(result.path).toBe('IDENTITY.md')
    }
  })

  it('supports agents root path when allowEmptyPath is enabled', async () => {
    const agentManager = { readPath: vi.fn(), writePath: vi.fn(), deletePath: vi.fn() }
    getProjectMock.mockResolvedValue({ agentManager })

    const result = await resolveVfsTarget('vfs://agents/default', makeContext(), 'list', {
      allowEmptyPath: true,
    })

    expect(result.kind).toBe('agent')
    if (result.kind === 'agent') {
      expect(result.path).toBe('')
      expect(result.agentId).toBe('default')
    }
  })

  it('supports agents namespace root list path vfs://agents', async () => {
    const agentManager = { readPath: vi.fn(), writePath: vi.fn(), deletePath: vi.fn() }
    getProjectMock.mockResolvedValue({ agentManager })

    const result = await resolveVfsTarget('vfs://agents', makeContext(), 'list', {
      allowEmptyPath: true,
    })

    expect(result.kind).toBe('agent')
    if (result.kind === 'agent') {
      expect(result.path).toBe('')
      expect(result.agentId).toBe('')
    }
  })

  it('keeps compatibility with legacy vfs://agent alias', async () => {
    const agentManager = { readPath: vi.fn(), writePath: vi.fn(), deletePath: vi.fn() }
    getProjectMock.mockResolvedValue({ agentManager })

    const result = await resolveVfsTarget('vfs://agent/default/SOUL.md', makeContext(), 'read')
    expect(result.kind).toBe('agent')
    if (result.kind === 'agent') {
      expect(result.agentId).toBe('default')
      expect(result.path).toBe('SOUL.md')
    }
  })

  it('rejects cross-agent write for non-default actor', async () => {
    const agentManager = { readPath: vi.fn(), writePath: vi.fn(), deletePath: vi.fn() }
    getProjectMock.mockResolvedValue({ agentManager })

    await expect(
      resolveVfsTarget(
        'vfs://agents/agent-b/SOUL.md',
        makeContext({ currentAgentId: 'agent-a' }),
        'write'
      )
    ).rejects.toThrow('Forbidden')
  })

  it('requires active project for agent namespace path', async () => {
    await expect(
      resolveVfsTarget(
        'vfs://agents/default/SOUL.md',
        makeContext({ projectId: null }),
        'read'
      )
    ).rejects.toThrow('No active project')
  })

  it('returns explicit agent id constraints for invalid agent id', async () => {
    await expect(
      resolveVfsTarget(
        'vfs://agents/墨 染/IDENTITY.md',
        makeContext({ currentAgentId: 'default' }),
        'read'
      )
    ).rejects.toThrow('Allowed agentId chars')
  })

  it('uses active agent id from store when context is missing actor id', async () => {
    const agentManager = { readPath: vi.fn(), writePath: vi.fn(), deletePath: vi.fn() }
    getProjectMock.mockResolvedValue({ agentManager })
    activeAgentState.activeAgentId = 'agent-self'

    const result = await resolveVfsTarget(
      'vfs://agents/agent-self/IDENTITY.md',
      makeContext({ currentAgentId: null }),
      'write'
    )

    expect(result.kind).toBe('agent')
  })

  it('detects protected core files', () => {
    expect(isProtectedAgentCoreFile('SOUL.md')).toBe(true)
    expect(isProtectedAgentCoreFile('skills/debug.md')).toBe(false)
  })
})
