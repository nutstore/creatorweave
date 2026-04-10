import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCurrentWorkspaceAgentMode,
  useWorkspacePreferencesStore,
} from '../workspace-preferences.store'
import { useWorkspaceStore } from '../workspace.store'

describe('workspace-preferences.store agent mode isolation', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspaceStore.setState({ activeWorkspaceId: null })
    useWorkspacePreferencesStore.setState({ agentMode: 'act', agentModeByWorkspace: {} })
  })

  it('isolates agent mode by workspace when switching active workspace', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-a' })
    useWorkspacePreferencesStore.getState().setAgentMode('plan')

    expect(getCurrentWorkspaceAgentMode()).toBe('plan')

    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-b' })
    expect(getCurrentWorkspaceAgentMode()).toBe('act')

    useWorkspacePreferencesStore.getState().setAgentMode('act')

    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-a' })
    expect(getCurrentWorkspaceAgentMode()).toBe('plan')
  })
})
