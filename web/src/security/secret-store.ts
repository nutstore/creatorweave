/**
 * Encrypted local secret storage.
 *
 * Secrets reuse the existing AES-GCM-backed API-key store, but are stored in a
 * separate logical namespace per project. This keeps browser-local credentials
 * encrypted at rest without changing the existing LLM provider-key API or schema.
 *
 * A secret name is intentionally constrained to a portable environment-variable
 * identifier because the next execution-layer step will inject approved secrets
 * into Pyodide as `os.environ` entries.
 */

import {
  deleteApiKey,
  getAllApiKeyProviders,
  hasApiKey,
  loadApiKey,
  saveApiKey,
} from './api-key-store'
import { getProjectSecretStoragePrefix } from './secret-key-scope'

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

export type SecretName = string

function assertSecretName(name: string): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid secret name "${name}". Secret names must match ${SECRET_NAME_PATTERN.source}.`
    )
  }
}

export { getProjectSecretStoragePrefix } from './secret-key-scope'

function getStorageKey(projectId: string, name: SecretName): string {
  assertSecretName(name)
  return `${getProjectSecretStoragePrefix(projectId)}${name}`
}

/**
 * Save a non-empty secret value using the existing encrypted local store.
 * The plaintext is never written to workspace files or SQLite columns.
 */
export async function saveSecret(projectId: string, name: SecretName, value: string): Promise<void> {
  if (!value) {
    throw new Error(`Secret "${name}" cannot be empty.`)
  }
  await saveApiKey(getStorageKey(projectId, name), value)
}

/** Load a secret value for trusted runtime plumbing only. */
export async function loadSecret(projectId: string, name: SecretName): Promise<string | null> {
  return loadApiKey(getStorageKey(projectId, name))
}

/** Delete a locally stored secret. */
export async function deleteSecret(projectId: string, name: SecretName): Promise<void> {
  await deleteApiKey(getStorageKey(projectId, name))
}

/** Check whether a locally stored secret exists without revealing its value. */
export async function hasSecret(projectId: string, name: SecretName): Promise<boolean> {
  return hasApiKey(getStorageKey(projectId, name))
}

/**
 * List configured secret names only. Values are never loaded or returned.
 */
export async function getAllSecretNames(projectId: string): Promise<SecretName[]> {
  if (!projectId) {
    return []
  }
  const projectPrefix = getProjectSecretStoragePrefix(projectId)
  const storageKeys = await getAllApiKeyProviders()
  return storageKeys
    .filter((key) => key.startsWith(projectPrefix))
    .map((key) => key.slice(projectPrefix.length))
    .filter((name) => SECRET_NAME_PATTERN.test(name))
    .sort()
}
