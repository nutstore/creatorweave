import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MonacoDiffEditor from '../MonacoDiffEditor'

const diffEditorMock = vi.fn()
const loaderConfigMock = vi.fn()

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: (props: { theme: string }) => {
    diffEditorMock(props)
    return <div data-testid="mock-diff-editor">{props.theme}</div>
  },
  loader: {
    config: (...args: unknown[]) => loaderConfigMock(...args),
  },
}))

vi.mock('monaco-editor', () => ({}))

describe('MonacoDiffEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.classList.remove('dark')
  })

  it('updates theme when dark mode class changes', async () => {
    render(<MonacoDiffEditor original="a" modified="b" path="src/a.ts" />)

    expect(screen.getByTestId('mock-diff-editor').textContent).toBe('vs')

    document.documentElement.classList.add('dark')
    document.documentElement.setAttribute('data-theme-switch', '1')

    expect(await screen.findByText('vs-dark')).toBeDefined()
  })
})
