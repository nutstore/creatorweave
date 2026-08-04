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
  promoteSecretToGlobal,
  saveSecret,
} from './secret-store'

describe('secret-store', () => {
  const projectId = 'project-alpha'

  beforeEach(() => {
    vi.resetAllMocks()
    apiKeyStore.deleteApiKey.mockResolvedValue(undefined)
    apiKeyStore.getAllApiKeyProviders.mockResolvedValue([])
    apiKeyStore.hasApiKey.mockResolvedValue(false)
    apiKeyStore.loadApiKey.mockResolvedValue(null)
    apiKeyStore.saveApiKey.mockResolvedValue(undefined)
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

    // load/has check project scope first, then fall back to global scope
    expect(apiKeyStore.loadApiKey).toHaveBeenCalledWith('__secret__:project-alpha:ASSEMBLYAI_API_KEY')
    expect(apiKeyStore.loadApiKey).toHaveBeenCalledWith('__secret__:_global:ASSEMBLYAI_API_KEY')
    expect(apiKeyStore.hasApiKey).toHaveBeenCalledWith('__secret__:project-alpha:ASSEMBLYAI_API_KEY')
    expect(apiKeyStore.hasApiKey).toHaveBeenCalledWith('__secret__:_global:ASSEMBLYAI_API_KEY')
    expect(apiKeyStore.deleteApiKey).toHaveBeenCalledWith('__secret__:project-alpha:ASSEMBLYAI_API_KEY')
  })

  it('lists only valid secret names and never their values', async () => {
    apiKeyStore.getAllApiKeyProviders.mockResolvedValue([
      'openai',
      '__secret__:project-alpha:ASSEMBLYAI_API_KEY',
      '__secret__:project-alpha:bad-name',
      '__secret__:project-alpha:OPENAI_API_KEY',
      '__secret__:project-beta:OTHER_PROJECT_KEY',
      '__secret__:_global:SHARED_GLOBAL_KEY',
    ])

    await expect(getAllSecretNames(projectId)).resolves.toEqual([
      'ASSEMBLYAI_API_KEY',
      'OPENAI_API_KEY',
      'SHARED_GLOBAL_KEY',
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

  // --- Global scope tests ---

  it('saves a global secret under the _global prefix', async () => {
    await saveSecret(projectId, 'SHARED_TOKEN', 'value', 'global')

    expect(apiKeyStore.saveApiKey).toHaveBeenCalledWith(
      '__secret__:_global:SHARED_TOKEN',
      'value'
    )
  })

  it('deletes a global secret from the _global prefix', async () => {
    await deleteSecret(projectId, 'SHARED_TOKEN', 'global')

    expect(apiKeyStore.deleteApiKey).toHaveBeenCalledWith('__secret__:_global:SHARED_TOKEN')
  })

  it('falls back to global scope when project scope is missing', async () => {
    // First call (project scope) returns null, second (global) returns the value
    apiKeyStore.loadApiKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('global-value')

    const result = await loadSecret(projectId, 'SHARED_TOKEN')

    expect(result).toBe('global-value')
    expect(apiKeyStore.loadApiKey).toHaveBeenCalledWith('__secret__:project-alpha:SHARED_TOKEN')
    expect(apiKeyStore.loadApiKey).toHaveBeenCalledWith('__secret__:_global:SHARED_TOKEN')
  })

  it('prefers project scope over global scope', async () => {
    apiKeyStore.loadApiKey
      .mockResolvedValueOnce('project-value')
      .mockResolvedValueOnce('global-value')

    const result = await loadSecret(projectId, 'SHARED_TOKEN')

    expect(result).toBe('project-value')
    // Should not have checked global when project scope had the value
    expect(apiKeyStore.loadApiKey).toHaveBeenCalledTimes(1)
  })

  it('returns null when neither project nor global scope has the secret', async () => {
    apiKeyStore.loadApiKey.mockResolvedValue(null)

    const result = await loadSecret(projectId, 'MISSING_KEY')

    expect(result).toBeNull()
  })

  it('loadSecret works without a project (global-only lookup)', async () => {
    apiKeyStore.loadApiKey.mockResolvedValue('global-only-value')

    const result = await loadSecret('', 'SHARED_TOKEN')

    expect(result).toBe('global-only-value')
    // Should only check global, not project
    expect(apiKeyStore.loadApiKey).toHaveBeenCalledWith('__secret__:_global:SHARED_TOKEN')
    expect(apiKeyStore.loadApiKey).not.toHaveBeenCalledWith(expect.stringContaining('project'))
  })

  it('promotes a project secret to global (read → write global → delete project)', async () => {
    apiKeyStore.loadApiKey.mockResolvedValue('project-value')

    const ok = await promoteSecretToGlobal(projectId, 'API_KEY')

    expect(ok).toBe(true)
    // Read project value
    expect(apiKeyStore.loadApiKey).toHaveBeenCalledWith('__secret__:project-alpha:API_KEY')
    // Write to global
    expect(apiKeyStore.saveApiKey).toHaveBeenCalledWith('__secret__:_global:API_KEY', 'project-value')
    // Delete project-scoped copy
    expect(apiKeyStore.deleteApiKey).toHaveBeenCalledWith('__secret__:project-alpha:API_KEY')
  })

  it('returns false when promoting a non-existent project secret', async () => {
    apiKeyStore.loadApiKey.mockResolvedValue(null)

    const ok = await promoteSecretToGlobal(projectId, 'MISSING_KEY')

    expect(ok).toBe(false)
    expect(apiKeyStore.saveApiKey).not.toHaveBeenCalled()
    expect(apiKeyStore.deleteApiKey).not.toHaveBeenCalled()
  })
})
