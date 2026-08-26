/**
 * useAgentStore Unit Tests
 *
 * Tests for the agent store state management
 * Note: agent.store is now a compatibility layer that delegates to folder-access.store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAgentStore } from '../agent.store'

// Mock folder-access.store
const mockSetHandle = vi.fn(() => Promise.resolve())
const mockRelease = vi.fn(() => Promise.resolve())
const mockGetRecord = vi.fn(() => null)
const mockHydrateProject = vi.fn(() => Promise.resolve())
const mockSetActiveProject = vi.fn(() => Promise.resolve())
const mockRequestPermission = vi.fn(() => Promise.resolve(true))

vi.mock('../folder-access.store', () => ({
  useFolderAccessStore: {
    getState: vi.fn(() => ({
      setHandle: mockSetHandle,
      release: mockRelease,
      getRecord: mockGetRecord,
      hydrateProject: mockHydrateProject,
      setActiveProject: mockSetActiveProject,
      requestPermission: mockRequestPermission,
    })),
    subscribe: vi.fn(),
  },
}))

// Mock remote.store
vi.mock('../remote.store', () => ({
  useRemoteStore: {
    getState: vi.fn(() => ({
      session: null,
      getRole: vi.fn(() => 'participant'),
      refreshFileTree: vi.fn(() => Promise.resolve()),
    })),
  },
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('useAgentStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAgentStore.setState({
      activeProjectId: '',
      directoryHandle: null,
      directoryName: null,
      pendingHandle: null,
      isRestoringHandle: false,
    })
    vi.clearAllMocks()
    mockGetRecord.mockReturnValue(null)
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useAgentStore.getState()

      expect(state.directoryHandle).toBe(null)
      expect(state.directoryName).toBe(null)
      expect(state.activeProjectId).toBe('')
    })
  })

  describe('setActiveProject', () => {
    it('should update activeProjectId', async () => {
      const { setActiveProject } = useAgentStore.getState()
      await setActiveProject('project-1')

      expect(useAgentStore.getState().activeProjectId).toBe('project-1')
    })
  })

  describe('setDirectoryHandle', () => {
    it('should not update handle without activeProjectId', async () => {
      const mockHandle = {
        name: 'test-directory',
      } as unknown as FileSystemDirectoryHandle

      const { setDirectoryHandle } = useAgentStore.getState()
      await setDirectoryHandle(mockHandle)

      // Should not have called setHandle since there's no activeProjectId
      expect(mockSetHandle).not.toHaveBeenCalled()
    })

    it('should call folder-access.setHandle when activeProjectId is set', async () => {
      // Set active project first
      useAgentStore.setState({ activeProjectId: 'project-1' })

      const mockHandle = {
        name: 'test-directory',
      } as unknown as FileSystemDirectoryHandle

      const { setDirectoryHandle } = useAgentStore.getState()
      await setDirectoryHandle(mockHandle)

      expect(mockSetHandle).toHaveBeenCalledWith('project-1', mockHandle)
    })

    it('should call release when setting null handle', async () => {
      // Set active project first
      useAgentStore.setState({ activeProjectId: 'project-1' })

      const { setDirectoryHandle } = useAgentStore.getState()
      await setDirectoryHandle(null)

      expect(mockRelease).toHaveBeenCalledWith('project-1')
    })
  })

  describe('restoreDirectoryHandle', () => {
    it('should have restoreDirectoryHandle function', () => {
      const { restoreDirectoryHandle } = useAgentStore.getState()
      expect(typeof restoreDirectoryHandle).toBe('function')
    })

    it('should call hydrateProject when activeProjectId is set', async () => {
      useAgentStore.setState({ activeProjectId: 'project-1' })

      const { restoreDirectoryHandle } = useAgentStore.getState()
      await restoreDirectoryHandle()

      expect(mockHydrateProject).toHaveBeenCalledWith('project-1')
    })

    it('should not call hydrateProject without activeProjectId', async () => {
      const { restoreDirectoryHandle } = useAgentStore.getState()
      await restoreDirectoryHandle()

      expect(mockHydrateProject).not.toHaveBeenCalled()
    })
  })

  describe('requestPendingHandlePermission', () => {
    it('should return false without pendingHandle', async () => {
      const { requestPendingHandlePermission } = useAgentStore.getState()
      const result = await requestPendingHandlePermission()

      expect(result).toBe(false)
    })

    it('should return false without activeProjectId', async () => {
      const mockHandle = {} as FileSystemDirectoryHandle
      useAgentStore.setState({ pendingHandle: mockHandle })

      const { requestPendingHandlePermission } = useAgentStore.getState()
      const result = await requestPendingHandlePermission()

      expect(result).toBe(false)
    })

    it('should call requestPermission with both pendingHandle and activeProjectId', async () => {
      const mockHandle = {} as FileSystemDirectoryHandle
      useAgentStore.setState({
        pendingHandle: mockHandle,
        activeProjectId: 'project-1',
      })

      const { requestPendingHandlePermission } = useAgentStore.getState()
      const result = await requestPendingHandlePermission()

      expect(mockRequestPermission).toHaveBeenCalledWith('project-1')
      expect(result).toBe(true)
    })
  })
})
