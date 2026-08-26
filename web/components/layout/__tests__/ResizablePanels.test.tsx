import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ResizablePanels } from '../ResizablePanels'

describe('ResizablePanels', () => {
  it('does not force panel wrappers to flex-grow in vertical mode', () => {
    render(
      <div style={{ height: '600px' }}>
        <ResizablePanels direction="vertical">
          <div data-testid="panel-top">top</div>
          <div data-testid="panel-bottom">bottom</div>
        </ResizablePanels>
      </div>
    )

    const topWrapper = screen.getByTestId('panel-top').parentElement
    const bottomWrapper = screen.getByTestId('panel-bottom').parentElement

    expect(topWrapper).toBeTruthy()
    expect(bottomWrapper).toBeTruthy()

    expect(topWrapper?.className).not.toContain('flex-1')
    expect(bottomWrapper?.className).not.toContain('flex-1')
  })
})
