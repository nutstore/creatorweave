import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillDiscover } from '../SkillDiscover'
import { fetchSkillStoreManifest } from '@/skills/skill-store'

// i18n hook: return the key so assertions can match `skills.discover.*` directly.
vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

// SkillToolbar: stub the shared toolbar primitives so the test stays focused
// on SkillDiscover behaviour rather than toolbar internals.
vi.mock('../SkillToolbar', () => ({
  SkillSearchInput: ({ placeholder, ariaLabel }: { placeholder: string; ariaLabel?: string }) => (
    <input type="search" placeholder={placeholder} aria-label={ariaLabel} />
  ),
  SkillSegmentFilter: ({ options }: { options: Array<{ value: string; label: string }> }) => (
    <div>
      {options.map((o) => (
        <span key={o.value}>{o.label}</span>
      ))}
    </div>
  ),
  SkillRefreshButton: ({ label, ariaLabel }: { label: string; ariaLabel?: string }) => (
    <button type="button" title={label} aria-label={ariaLabel ?? label}>
      refresh
    </button>
  ),
}))

// BrandButton: minimal stub matching the props SkillDiscover uses.
vi.mock('@creatorweave/ui', () => ({
  BrandButton: ({
    children,
    disabled,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick?: () => void
    'aria-label'?: string
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}))

vi.mock('@/store/skills.store', () => ({
  useSkillsStore: (selector: (state: { bumpSkillsScanVersion: () => void }) => unknown) =>
    selector({ bumpSkillsScanVersion: vi.fn() }),
}))

vi.mock('@/skills/skill-store', () => ({
  fetchSkillStoreManifest: vi.fn().mockResolvedValue({ skills: [] }),
  annotateInstalled: vi.fn((skills: unknown[]) => skills),
  scanInstalledDirNames: vi.fn().mockResolvedValue(new Set<string>()),
  installSkillFromUrl: vi.fn(),
  invalidateSkillStoreCache: vi.fn(),
}))

describe('SkillDiscover', () => {
  beforeEach(() => {
    vi.mocked(fetchSkillStoreManifest).mockResolvedValue({
      version: '1',
      generated: '2026-08-04T00:00:00.000Z',
      count: 0,
      skills: [],
    })
  })

  it('renders search input and install-state filter after manifest loads', async () => {
    render(<SkillDiscover />)

    // Toolbar renders the search input and refresh button.
    expect(await screen.findByPlaceholderText('skills.discover.searchPlaceholder')).toBeInTheDocument()
    expect(screen.getByLabelText('skills.discover.checkUpdatesAria')).toBeInTheDocument()

    // Filter segment renders three options with i18n keys.
    expect(screen.getByText('skills.discover.filterAll')).toBeInTheDocument()
    expect(screen.getByText('skills.discover.filterUninstalled')).toBeInTheDocument()
    expect(screen.getByText('skills.discover.filterInstalled')).toBeInTheDocument()
  })

  it('renders an installable skill card', async () => {
    vi.mocked(fetchSkillStoreManifest).mockResolvedValue({
      version: '1',
      generated: '2026-08-04T00:00:00.000Z',
      count: 1,
      skills: [{
        id: 'demo-skill',
        dirName: 'demo-skill',
        name: 'Demo skill',
        description: 'A skill used to verify the discovery card.',
        category: 'general',
        tags: [],
        version: '1.0.0',
        zipUrl: 'https://example.test/demo-skill.zip',
      }],
    })

    render(<SkillDiscover />)

    expect(await screen.findByText('Demo skill')).toBeInTheDocument()
  })
})
