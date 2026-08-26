import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePageActionSessionStore } from '@/store/page-action-session.store'

vi.mock('@/agent/workspace-assistant-context', () => ({
  isSidePanelMode: () => true,
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string, values?: { mode?: string }) => {
    const labels: Record<string, string> = {
      'agent.mode.plan': 'Plan',
      'agent.mode.act': 'Act',
      'agent.mode.yolo': 'YOLO',
      'agent.mode.planShort': 'Read only',
      'agent.mode.actShort': 'Ask before writing',
      'agent.mode.yoloShort': 'Allow page writes',
    }
    return key === 'agent.mode.currentAriaLabel' ? `Current mode: ${values?.mode}` : labels[key] ?? key
  },
}))

import { AgentModeSelect } from '../AgentModeSelect'

describe('AgentModeSelect', () => {
  beforeEach(() => {
    usePageActionSessionStore.setState({ pageActionYolo: true })
  })

  it('turns off YOLO when the user selects Plan', () => {
    const onModeChange = vi.fn()
    render(<AgentModeSelect mode="act" onModeChange={onModeChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Current mode: YOLO' }))
    fireEvent.click(screen.getByText('Plan'))

    expect(onModeChange).toHaveBeenCalledWith('plan')
    expect(usePageActionSessionStore.getState().pageActionYolo).toBe(false)
  })
})
