import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowQuickActions } from '../WorkflowQuickActions'

// Radix relies on Pointer Capture APIs that are missing in happy-dom.
if (!('hasPointerCapture' in Element.prototype)) {
  ;(Element.prototype as unknown as { hasPointerCapture: (pointerId: number) => boolean })
    .hasPointerCapture = () => false
}
if (!('setPointerCapture' in Element.prototype)) {
  ;(Element.prototype as unknown as { setPointerCapture: (pointerId: number) => void })
    .setPointerCapture = () => undefined
}
if (!('releasePointerCapture' in Element.prototype)) {
  ;(Element.prototype as unknown as { releasePointerCapture: (pointerId: number) => void })
    .releasePointerCapture = () => undefined
}
if (!('toggleAttribute' in Element.prototype)) {
  ;(Element.prototype as unknown as { toggleAttribute: (name: string) => void })
    .toggleAttribute = function (this: Element, name: string) {
      if (this.hasAttribute(name)) {
        this.removeAttribute(name)
      } else {
        this.setAttribute(name, '')
      }
    }
}

describe('WorkflowQuickActions', () => {
  const templates = [
    { id: 'novel_daily_v1', label: '小说日更', pipeline: ['plan', 'produce', 'review'] },
    { id: 'short_video_script_v1', label: '短视频脚本', pipeline: ['plan', 'produce', 'review', 'assemble'] },
  ]

  it('opens popover and renders workflow options', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()

    function Wrapper() {
      const [selectedTemplateId, setSelectedTemplateId] = useState('novel_daily_v1')
      return (
        <WorkflowQuickActions
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          disabled={false}
          onTemplateChange={setSelectedTemplateId}
          onRun={onRun}
        />
      )
    }

    render(<Wrapper />)
    await user.click(screen.getByRole('button', { name: /工作流/i }))

    expect(screen.getByText('工作流')).toBeTruthy()
    expect(screen.getByText('短视频脚本')).toBeTruthy()
    expect(screen.getByRole('button', { name: /模拟运行/i })).toBeTruthy()
  })

  it('disables trigger when disabled is true', () => {
    render(
      <WorkflowQuickActions
        templates={templates}
        selectedTemplateId="novel_daily_v1"
        disabled={true}
        onTemplateChange={() => undefined}
        onRun={() => undefined}
      />
    )

    const trigger = screen.getByRole('button', { name: /工作流/i }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
  })

  it('runs with default rubric when custom rubric is disabled', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()

    function Wrapper() {
      const [selectedTemplateId, setSelectedTemplateId] = useState('novel_daily_v1')
      return (
        <WorkflowQuickActions
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          disabled={false}
          onTemplateChange={setSelectedTemplateId}
          onRun={onRun}
        />
      )
    }

    render(<Wrapper />)
    await user.click(screen.getByRole('button', { name: /工作流/i }))
    await user.click(screen.getByRole('button', { name: /模拟运行/i }))

    expect(onRun).toHaveBeenCalledWith('novel_daily_v1', undefined)
  })

  it('updates selected template when clicking template card', async () => {
    const user = userEvent.setup()
    const onTemplateChange = vi.fn()

    render(
      <WorkflowQuickActions
        templates={templates}
        selectedTemplateId="novel_daily_v1"
        disabled={false}
        onTemplateChange={onTemplateChange}
        onRun={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: /工作流/i }))
    await user.click(screen.getByText('短视频脚本'))

    expect(onTemplateChange).toHaveBeenCalledWith('short_video_script_v1')
  })

  it('blocks run when custom rubric form is invalid', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [selectedTemplateId, setSelectedTemplateId] = useState('novel_daily_v1')
      return (
        <WorkflowQuickActions
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          disabled={false}
          onTemplateChange={setSelectedTemplateId}
          onRun={() => undefined}
        />
      )
    }

    render(<Wrapper />)
    await user.click(screen.getByRole('button', { name: /工作流/i }))
    await user.click(screen.getByRole('button', { name: /高级设置/i }))
    await user.click(screen.getByLabelText('启用自定义评分规则'))

    fireEvent.change(screen.getByLabelText('段落最小句数'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('段落最大句数'), { target: { value: '3' } })

    const runButton = screen.getByRole('button', { name: /模拟运行/ }) as HTMLButtonElement
    expect(runButton.disabled).toBe(true)
    expect(screen.getByText(/段落句数范围不合法/)).toBeTruthy()
  })

  it('builds rubric DSL from form and passes it to onRun', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()

    function Wrapper() {
      const [selectedTemplateId, setSelectedTemplateId] = useState('novel_daily_v1')
      return (
        <WorkflowQuickActions
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          disabled={false}
          onTemplateChange={setSelectedTemplateId}
          onRun={onRun}
        />
      )
    }

    render(<Wrapper />)
    await user.click(screen.getByRole('button', { name: /工作流/i }))
    await user.click(screen.getByRole('button', { name: /高级设置/i }))
    await user.click(screen.getByLabelText('启用自定义评分规则'))

    fireEvent.change(screen.getByLabelText('自定义评分规则'), { target: { value: '我的评分规则' } })
    fireEvent.change(screen.getByLabelText('通过分'), { target: { value: '85' } })
    fireEvent.change(screen.getByLabelText('最大修复轮次'), { target: { value: '1' } })

    await user.click(screen.getByRole('button', { name: /模拟运行/i }))

    const call = onRun.mock.calls[0]
    expect(call?.[0]).toBe('novel_daily_v1')
    expect(typeof call?.[1]).toBe('string')

    const rubric = JSON.parse(call?.[1] as string)
    expect(rubric.name).toBe('我的评分规则')
    expect(rubric.passCondition).toContain('85')
    expect(rubric.retryPolicy.maxRepairRounds).toBe(1)
    expect(Array.isArray(rubric.rules)).toBe(true)
    expect(rubric.rules.length).toBeGreaterThan(0)
  })

  it('calls onOpenEditor when custom editor button is clicked', async () => {
    const user = userEvent.setup()
    const onOpenEditor = vi.fn()

    render(
      <WorkflowQuickActions
        templates={templates}
        selectedTemplateId="novel_daily_v1"
        disabled={false}
        onTemplateChange={() => undefined}
        onRun={() => undefined}
        onOpenEditor={onOpenEditor}
      />
    )

    await user.click(screen.getByRole('button', { name: /工作流/i }))
    await user.click(screen.getByRole('button', { name: /自定义工作流编辑器/i }))

    expect(onOpenEditor).toHaveBeenCalledTimes(1)
  })
})
