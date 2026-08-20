import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HashRouter } from 'react-router-dom'
import { DocsPage } from '../DocsPage'

function renderDocs(ui: React.ReactElement) {
  return render(<HashRouter>{ui}</HashRouter>)
}

const { localeState, setLocaleMock } = vi.hoisted(() => ({
  localeState: { value: 'zh-CN' as 'zh-CN' | 'en-US' },
  setLocaleMock: vi.fn(),
}))

vi.mock('@/i18n', () => ({
  useLocale: () => [localeState.value, setLocaleMock] as const,
}))

const userIndex = {
  title: '用户文档',
  pages: [
    {
      slug: 'getting-started',
      title: '快速入门',
      file: 'getting-started.md',
      order: 1,
    },
  ],
}

const userIndexEn = {
  title: 'User Documentation',
  pages: [
    {
      slug: 'getting-started',
      title: 'Getting Started',
      file: 'getting-started.md',
      order: 1,
    },
  ],
}

const developerIndex = {
  title: '开发者文档',
  pages: [
    {
      slug: 'guides-quick-start',
      title: '快速入门',
      file: 'guides/quick-start.md',
      category: 'guides',
      order: 101,
    },
  ],
}

const developerIndexEn = {
  title: 'Developer Documentation',
  pages: [
    {
      slug: 'quick-start',
      title: 'Quick Start',
      file: 'quick-start.md',
      order: 1,
    },
  ],
}

describe('DocsPage sidebar grouping', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url

      if (url === '/docs/zh/user/_index.json') {
        return Promise.resolve(new Response(JSON.stringify(userIndex), { status: 200 }))
      }

      if (url === '/docs/en/user/_index.json') {
        return Promise.resolve(new Response(JSON.stringify(userIndexEn), { status: 200 }))
      }

      if (url === '/docs/zh/developer/_index.json') {
        return Promise.resolve(new Response(JSON.stringify(developerIndex), { status: 200 }))
      }

      if (url === '/docs/en/developer/_index.json') {
        return Promise.resolve(new Response(JSON.stringify(developerIndexEn), { status: 200 }))
      }

      if (url === '/docs/zh/user/getting-started.md') {
        return Promise.resolve(
          new Response('---\ntitle: 快速入门\norder: 1\n---\n\n# 快速入门正文', { status: 200 })
        )
      }

      if (url === '/docs/zh/developer/guides/quick-start.md') {
        return Promise.resolve(new Response('# 开发者快速入门', { status: 200 }))
      }

      return Promise.resolve(new Response('Not found', { status: 404 }))
    })
  })

  afterEach(() => {
    localeState.value = 'zh-CN'
    setLocaleMock.mockReset()
    window.location.hash = ''
    vi.restoreAllMocks()
  })

  it('renders user docs without group headers', async () => {
    renderDocs(<DocsPage category="user" />)

    const entries = await screen.findAllByText('快速入门')
    expect(entries.length).toBeGreaterThan(0)
    expect(screen.queryByText('使用指南')).not.toBeInTheDocument()
  })

  it('renders developer docs without group headers', async () => {
    renderDocs(<DocsPage category="developer" />)

    const entries = await screen.findAllByText('快速入门')
    expect(entries.length).toBeGreaterThan(0)
    expect(screen.queryByText('开发指南')).not.toBeInTheDocument()
    expect(screen.queryByText('Guides')).not.toBeInTheDocument()
  })

  it('loads locale-prefixed docs index for english locale', async () => {
    localeState.value = 'en-US'

    renderDocs(<DocsPage category="user" />)

    const entries = await screen.findAllByText('Getting Started')
    expect(entries.length).toBeGreaterThan(0)
    expect(globalThis.fetch).toHaveBeenCalledWith('/docs/en/user/_index.json')
  })

  it('uses zh-prefixed index path for chinese locale', async () => {
    renderDocs(<DocsPage category="user" />)

    await screen.findAllByText('快速入门')
    const fetchMock = vi.mocked(globalThis.fetch)
    const firstCall = fetchMock.mock.calls[0]?.[0]
    const firstUrl = typeof firstCall === 'string' ? firstCall : firstCall instanceof URL ? firstCall.pathname : ''
    expect(firstUrl).toBe('/docs/zh/user/_index.json')
  })

  it('switches locale to english from docs home', () => {
    renderDocs(<DocsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(setLocaleMock).toHaveBeenCalledWith('en-US')
  })

  it('strips frontmatter from loaded markdown', async () => {
    renderDocs(<DocsPage category="user" page="getting-started" />)

    await screen.findByText('快速入门正文')
    expect(screen.queryByText('title: 快速入门')).not.toBeInTheDocument()
    expect(screen.queryByText('order: 1')).not.toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/docs/zh/user/getting-started.md')
  })

  it('keeps current page on locale switch when same slug exists', async () => {
    renderDocs(<DocsPage category="user" page="getting-started" />)

    await screen.findByText('快速入门正文')
    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    await waitFor(() => {
      expect(window.location.hash).toBe('#/docs/en/user/getting-started')
    })
  })

  it('falls back to category home on locale switch when slug is missing', async () => {
    renderDocs(<DocsPage category="developer" page="guides-quick-start" />)

    await screen.findByText('开发者快速入门')
    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    await waitFor(() => {
      expect(window.location.hash).toBe('#/docs/en/developer')
    })
  })
})
