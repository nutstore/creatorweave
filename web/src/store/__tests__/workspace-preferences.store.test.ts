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
    useWorkspacePreferencesStore.setState({
      agentMode: 'act',
      agentModeByWorkspace: {},
      autoApplyOnRunComplete: false,
      autoApplyOnRunCompleteByWorkspace: {},
    })
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

  it('isolates completion auto-apply by workspace', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-a' })
    useWorkspacePreferencesStore.getState().setAutoApplyOnRunComplete(true)

    expect(useWorkspacePreferencesStore.getState().autoApplyOnRunComplete).toBe(true)
    expect(useWorkspacePreferencesStore.getState().autoApplyOnRunCompleteByWorkspace['ws-a']).toBe(true)

    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-b' })
    expect(useWorkspacePreferencesStore.getState().autoApplyOnRunComplete).toBe(false)

    useWorkspacePreferencesStore.getState().setAutoApplyOnRunComplete(true)
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-a' })

    expect(useWorkspacePreferencesStore.getState().autoApplyOnRunComplete).toBe(true)
    expect(useWorkspacePreferencesStore.getState().autoApplyOnRunCompleteByWorkspace).toEqual({
      'ws-a': true,
      'ws-b': true,
    })
  })
})
