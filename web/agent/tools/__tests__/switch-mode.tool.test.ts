import { beforeEach, describe, expect, it, vi } from 'vitest'

const { modeState, pageActionState } = vi.hoisted(() => ({
  modeState: { value: 'act' as 'plan' | 'act' },
  pageActionState: {
    pageActionYolo: true,
    setPageActionYolo(pageActionYolo: boolean) {
      this.pageActionYolo = pageActionYolo
    },
  },
}))

vi.mock('@/store/workspace-preferences.store', () => ({
  getCurrentWorkspaceAgentMode: () => modeState.value,
  setCurrentWorkspaceAgentMode: (mode: 'plan' | 'act') => {
    modeState.value = mode
  },
}))

vi.mock('@/store/page-action-session.store', () => ({
  usePageActionSessionStore: {
    getState: () => pageActionState,
  },
}))

import { createSwitchModeExecutor } from '../switch-mode.tool'

describe('switch_agent_mode', () => {
  beforeEach(() => {
    pageActionState.pageActionYolo = true
  })

  it.each(['plan', 'act'] as const)('turns off YOLO when switching to %s', async (mode) => {
    modeState.value = mode === 'plan' ? 'act' : 'plan'

    await createSwitchModeExecutor()({ mode, reason: 'test mode transition' }, {} as never)

    expect(pageActionState.pageActionYolo).toBe(false)
  })
})
