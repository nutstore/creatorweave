import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HtmlSandboxPreview, prepareUntrustedHtml } from '../HtmlSandboxPreview'
import { MarkdownContent, parseInteractiveHtmlMeta } from '../MarkdownContent'

vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: {
    subscribe: vi.fn(),
    getState: () => ({ activeWorkspaceId: null }),
  },
}))

describe('interactive-html fence metadata', () => {
  it('uses safe defaults for absent or invalid metadata', () => {
    expect(parseInteractiveHtmlMeta(undefined)).toEqual({ title: 'Interactive demo', height: 420 })
    expect(parseInteractiveHtmlMeta('height="not-a-number"')).toEqual({ title: 'Interactive demo', height: 420 })
  })

  it('parses quoted attributes and constrains height to the chat-safe range', () => {
    expect(parseInteractiveHtmlMeta('title="设置页交互原型" height="440"')).toEqual({
      title: '设置页交互原型',
      height: 440,
    })
    expect(parseInteractiveHtmlMeta("title='Too tall' height=9999")).toEqual({ title: 'Too tall', height: 720 })
    expect(parseInteractiveHtmlMeta('height=12')).toEqual({ title: 'Interactive demo', height: 240 })
  })
})

describe('HtmlSandboxPreview', () => {
  it('renders only the dedicated interactive-html fence as a sandboxed prototype', () => {
    render(
      <MarkdownContent
        content={`\`\`\`interactive-html title="Settings demo" height="440"
<button>Save</button>
\`\`\``}
      />,
    )

    expect(screen.getByLabelText('Settings demo preview')).toHaveStyle({ height: '440px' })
    expect(screen.getByTitle('Settings demo')).toHaveAttribute('sandbox', 'allow-scripts')
  })

  it('places its network-denying CSP before every byte of untrusted markup', () => {
    const suppliedHtml = '<html><head><base href="https://example.com/"><title>Demo</title></head><body><img src="/tracker.gif"></body></html>'
    const prepared = prepareUntrustedHtml(suppliedHtml)

    expect(prepared).toContain("default-src 'none'")
    expect(prepared.indexOf("default-src 'none'")).toBeLessThan(prepared.indexOf(suppliedHtml))
    expect(prepared).toContain(`<body>${suppliedHtml}</body>`)
  })

  it('runs HTML only in a script-enabled opaque-origin sandbox', () => {
    render(<HtmlSandboxPreview html="<button>Try it</button>" title="Demo" />)

    const frame = screen.getByTitle('Demo')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(frame).not.toHaveAttribute('src')
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'")
  })

  it('keeps the existing local-file preview permissions behind an explicit profile', () => {
    render(<HtmlSandboxPreview html="<button>Try it</button>" title="Local file" sandboxProfile="trusted-file" />)

    expect(screen.getByTitle('Local file')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
  })

  it('shows raw source, resets the iframe, and opens an accessible full-screen preview', () => {
    render(
      <HtmlSandboxPreview
        html="<button>Try it</button>"
        title="Demo"
        showReset
        showSource
        allowFullscreen
      />,
    )

    const initialFrame = screen.getByTitle('Demo')
    fireEvent.click(screen.getByRole('button', { name: 'Show source' }))
    expect(screen.getByText('<button>Try it</button>')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset preview' }))
    expect(screen.getByTitle('Demo')).not.toBe(initialFrame)

    const fullscreenTrigger = screen.getByRole('button', { name: 'Open full-screen preview' })
    fireEvent.click(fullscreenTrigger)

    const dialog = screen.getByRole('dialog', { name: 'Demo full-screen preview' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const closeButton = screen.getByRole('button', { name: 'Close full-screen preview' })
    expect(closeButton).toHaveFocus()

    const frames = screen.getAllByTitle('Demo')
    const fullscreenFrame = frames[frames.length - 1]
    fullscreenFrame.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.querySelector('button')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(fullscreenFrame).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Demo full-screen preview' })).not.toBeInTheDocument()
    expect(fullscreenTrigger).toHaveFocus()
  })
})
