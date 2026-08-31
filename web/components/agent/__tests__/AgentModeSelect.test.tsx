import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePageActionSessionStore } from '@/store/page-action-session.store'
import { useYoloModeStore } from '@/store/yolo-mode.store'

// isSidePanelMode no longer gates the YOLO option (PR-4 generalization) but
// keep the module mock in case the component's import graph still touches it.
vi.mock('@/agent/workspace-assistant-context', () => ({
  isSidePanelMode: () => false,
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string, values?: { mode?: string }) => {
    const labels: Record<string, string> = {
      'agent.mode.plan': 'Plan',
      'agent.mode.act': 'Act',
      'agent.mode.yolo': 'YOLO',
      'agent.mode.planShort': 'Read only',
      'agent.mode.actShort': 'Ask before writing',
      'agent.mode.yoloShort': 'Auto-approve confirmations',
    }
    return key === 'agent.mode.currentAriaLabel' ? `Current mode: ${values?.mode}` : labels[key] ?? key
  },
}))

import { AgentModeSelect } from '../AgentModeSelect'

describe('AgentModeSelect', () => {
  beforeEach(() => {
    useYoloModeStore.getState().clearAll()
    usePageActionSessionStore.setState({ pageActionYolo: false })
  })

  afterEach(() => {
    useYoloModeStore.getState().clearAll()
    usePageActionSessionStore.setState({ pageActionYolo: false })
  })

  it('shows the YOLO option even OUTSIDE side-panel mode (PR-4 generalization)', () => {
    render(<AgentModeSelect mode="act" onModeChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Current mode: Act' }))
    // isSidePanelMode() is mocked false — previously YOLO was hidden here.
    expect(screen.getByText('YOLO')).toBeTruthy()
  })

  it('selecting YOLO writes the conversation-scoped store and mirrors the legacy flag', () => {
    render(<AgentModeSelect mode="act" onModeChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Current mode: Act' }))
    fireEvent.click(screen.getByText('YOLO'))

    // Legacy flag mirrored for older consumers.
    expect(usePageActionSessionStore.getState().pageActionYolo).toBe(true)
    // Indicator derives from the new conversation-scoped store: without a
    // known conversation id it falls back to the legacy flag.
    expect(screen.getByRole('button', { name: 'Current mode: YOLO' })).toBeTruthy()
  })

  it('turns off YOLO when the user selects Plan', () => {
    usePageActionSessionStore.setState({ pageActionYolo: true })
    const onModeChange = vi.fn()
    render(<AgentModeSelect mode="act" onModeChange={onModeChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Current mode: YOLO' }))
    fireEvent.click(screen.getByText('Plan'))

    expect(onModeChange).toHaveBeenCalledWith('plan')
    expect(usePageActionSessionStore.getState().pageActionYolo).toBe(false)
  })
})
