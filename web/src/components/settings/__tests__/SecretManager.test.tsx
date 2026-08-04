import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const secretStore = vi.hoisted(() => ({
  deleteSecret: vi.fn(async () => undefined),
  getAllSecretEntries: vi.fn(async () => [{ name: 'ASSEMBLYAI_API_KEY', scope: 'project' as const }]),
  getGlobalSecretNames: vi.fn(async () => [] as string[]),
  getAllSecretNames: vi.fn(async () => ['ASSEMBLYAI_API_KEY']),
  loadSecret: vi.fn(async () => 'secret-value'),
  saveSecret: vi.fn(async () => undefined),
}))
const translate = vi.hoisted(
  () => (key: string, values?: Record<string, string>) => values?.name ? `${key}:${values.name}` : key
)
const projectStore = vi.hoisted(() => ({
  activeProjectId: 'project-alpha',
  projects: [{ id: 'project-alpha', name: 'Project Alpha' }],
}))

vi.mock('@/security/secret-store', () => secretStore)
vi.mock('@/i18n', () => ({ useT: () => translate }))
vi.mock('@/store/project.store', () => ({ useProjectStore: (selector: (state: typeof projectStore) => unknown) => selector(projectStore) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { SecretManager } from '../SecretManager'

describe('SecretManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectStore.activeProjectId = 'project-alpha'
    secretStore.getAllSecretEntries.mockResolvedValue([
      { name: 'ASSEMBLYAI_API_KEY', scope: 'project' },
    ])
    secretStore.getGlobalSecretNames.mockResolvedValue([])
    secretStore.getAllSecretNames.mockResolvedValue(['ASSEMBLYAI_API_KEY'])
  })

  it('lists project secret names without loading secret values', async () => {
    render(<SecretManager />)

    expect(await screen.findByText('ASSEMBLYAI_API_KEY')).toBeInTheDocument()
    expect(secretStore.getAllSecretEntries).toHaveBeenCalledWith('project-alpha')
    expect(secretStore.loadSecret).not.toHaveBeenCalled()
  })

  it('saves a new project secret through the encrypted store', async () => {
    render(<SecretManager />)
    await screen.findByText('ASSEMBLYAI_API_KEY')

    // The first "add" button is for project scope
    const addButtons = screen.getAllByText('settings.secrets.add')
    fireEvent.click(addButtons[0])
    fireEvent.change(screen.getByLabelText('settings.secrets.name'), {
      target: { value: 'ASSEMBLYAI_API_KEY' },
    })
    fireEvent.change(screen.getByLabelText('settings.secrets.value'), {
      target: { value: 'new-secret' },
    })
    fireEvent.click(screen.getByText('settings.secrets.save'))

    await waitFor(() => {
      expect(secretStore.saveSecret).toHaveBeenCalledWith(
        'project-alpha',
        'ASSEMBLYAI_API_KEY',
        'new-secret',
        'project'
      )
    })
  })

  it('lists global secrets in the global section', async () => {
    secretStore.getGlobalSecretNames.mockResolvedValue(['SHARED_GLOBAL_TOKEN'])

    render(<SecretManager />)

    expect(await screen.findByText('SHARED_GLOBAL_TOKEN')).toBeInTheDocument()
    expect(secretStore.getGlobalSecretNames).toHaveBeenCalled()
  })
})
