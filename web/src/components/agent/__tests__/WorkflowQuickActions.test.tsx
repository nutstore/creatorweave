import { render, screen } from '@testing-library/react'
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
    { id: 'novel_daily_v1', label: 'Novel Daily', pipeline: ['plan', 'produce', 'review'] },
    { id: 'short_video_script_v1', label: 'Short Video Script', pipeline: ['plan', 'produce', 'review', 'assemble'] },
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
    await user.click(screen.getByRole('button', { name: /workflow/i }))

    expect(screen.getByText('Workflow')).toBeTruthy()
    expect(screen.getByText('Short Video Script')).toBeTruthy()
    expect(screen.getByRole('button', { name: /simulate run/i })).toBeTruthy()
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

    const trigger = screen.getByRole('button', { name: /workflow/i }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
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

    await user.click(screen.getByRole('button', { name: /workflow/i }))
    await user.click(screen.getByText('Short Video Script'))

    expect(onTemplateChange).toHaveBeenCalledWith('short_video_script_v1')
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

    await user.click(screen.getByRole('button', { name: /workflow/i }))
    await user.click(screen.getByRole('button', { name: /custom workflow editor/i }))

    expect(onOpenEditor).toHaveBeenCalledTimes(1)
  })
})
