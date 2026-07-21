import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiKeyStore = vi.hoisted(() => ({
  deleteApiKey: vi.fn(async () => undefined),
  getAllApiKeyProviders: vi.fn(async () => [] as string[]),
  hasApiKey: vi.fn(async () => false),
  loadApiKey: vi.fn(async () => null as string | null),
  saveApiKey: vi.fn(async () => undefined),
}))

vi.mock('./api-key-store', () => apiKeyStore)

import {
  deleteSecret,
  getProjectSecretStoragePrefix,
  getAllSecretNames,
  hasSecret,
  loadSecret,
  saveSecret,
} from './secret-store'

describe('secret-store', () => {
  const projectId = 'project-alpha'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores a secret in an isolated encrypted-store namespace', async () => {
    await saveSecret(projectId, 'ASSEMBLYAI_API_KEY', 'secret-value')

    expect(apiKeyStore.saveApiKey).toHaveBeenCalledWith(
      '__secret__:project-alpha:ASSEMBLYAI_API_KEY',
      'secret-value'
    )
  })

  it('uses a project-specific prefix that can be safely cleaned up on project deletion', () => {
    expect(getProjectSecretStoragePrefix(projectId)).toBe('__secret__:project-alpha:')
    expect(getProjectSecretStoragePrefix('project:beta')).toBe('__secret__:project%3Abeta:')
  })

  it('uses the same isolated namespace for load, existence checks, and deletion', async () => {
    await loadSecret(projectId, 'ASSEMBLYAI_API_KEY')
    await hasSecret(projectId, 'ASSEMBLYAI_API_KEY')
    await deleteSecret(projectId, 'ASSEMBLYAI_API_KEY')

    expect(apiKeyStore.loadApiKey).toHaveBeenCalledWith('__secret__:project-alpha:ASSEMBLYAI_API_KEY')
    expect(apiKeyStore.hasApiKey).toHaveBeenCalledWith('__secret__:project-alpha:ASSEMBLYAI_API_KEY')
    expect(apiKeyStore.deleteApiKey).toHaveBeenCalledWith('__secret__:project-alpha:ASSEMBLYAI_API_KEY')
  })

  it('lists only valid secret names and never their values', async () => {
    apiKeyStore.getAllApiKeyProviders.mockResolvedValue([
      'openai',
      '__secret__:project-alpha:ASSEMBLYAI_API_KEY',
      '__secret__:project-alpha:bad-name',
      '__secret__:project-alpha:OPENAI_API_KEY',
      '__secret__:project-beta:OTHER_PROJECT_KEY',
    ])

    await expect(getAllSecretNames(projectId)).resolves.toEqual([
      'ASSEMBLYAI_API_KEY',
      'OPENAI_API_KEY',
    ])
    expect(apiKeyStore.loadApiKey).not.toHaveBeenCalled()
  })

  it.each(['assemblyai_api_key', 'ASSEMBLYAI-API-KEY', '__SECRET', '1_API_KEY']) (
    'rejects an invalid environment-variable name: %s',
    async (name) => {
      await expect(saveSecret(projectId, name, 'value')).rejects.toThrow('Invalid secret name')
      expect(apiKeyStore.saveApiKey).not.toHaveBeenCalled()
    }
  )

  it('rejects an empty secret value', async () => {
    await expect(saveSecret(projectId, 'ASSEMBLYAI_API_KEY', '')).rejects.toThrow('cannot be empty')
    expect(apiKeyStore.saveApiKey).not.toHaveBeenCalled()
  })
})
