import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const secretStore = vi.hoisted(() => ({
  deleteSecret: vi.fn(async () => undefined),
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
    secretStore.getAllSecretNames.mockResolvedValue(['ASSEMBLYAI_API_KEY'])
  })

  it('lists secret names without loading secret values', async () => {
    render(<SecretManager />)

    expect(await screen.findByText('ASSEMBLYAI_API_KEY')).toBeInTheDocument()
    expect(screen.getByText('settings.secrets.currentProject:Project Alpha')).toBeInTheDocument()
    expect(secretStore.getAllSecretNames).toHaveBeenCalledWith('project-alpha')
    expect(secretStore.loadSecret).not.toHaveBeenCalled()
  })

  it('saves a new secret through the encrypted store', async () => {
    render(<SecretManager />)
    await screen.findByText('ASSEMBLYAI_API_KEY')

    fireEvent.click(screen.getByText('settings.secrets.add'))
    fireEvent.change(screen.getByLabelText('settings.secrets.name'), {
      target: { value: 'ASSEMBLYAI_API_KEY' },
    })
    fireEvent.change(screen.getByLabelText('settings.secrets.value'), {
      target: { value: 'new-secret' },
    })
    fireEvent.click(screen.getByText('settings.secrets.save'))

    await waitFor(() => {
      expect(secretStore.saveSecret).toHaveBeenCalledWith('project-alpha', 'ASSEMBLYAI_API_KEY', 'new-secret')
    })
  })

  it('requires an explicit edit-and-reveal action before loading a value', async () => {
    render(<SecretManager />)
    await screen.findByText('ASSEMBLYAI_API_KEY')

    fireEvent.click(screen.getByText('settings.secrets.update'))
    expect(secretStore.loadSecret).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('settings.secrets.reveal'))
    await waitFor(() => expect(secretStore.loadSecret).toHaveBeenCalledWith('project-alpha', 'ASSEMBLYAI_API_KEY'))
  })
})
