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
 *
 * ## Scopes (v2)
 *
 * Secrets support two scopes with a **project-over-global fallback** at read time:
 *
 * - **Project scope** (`__secret__:<projectId>:<NAME>`) — isolated per project.
 * - **Global scope** (`__secret__:_global:<NAME>`) — shared across all projects.
 *
 * `loadSecret()` checks the project-scoped key first, then falls back to global.
 * `getAllSecretNames()` returns the union of both scopes (project takes priority
 * on name collisions).
 */

import {
  deleteApiKey,
  getAllApiKeyProviders,
  hasApiKey,
  loadApiKey,
  saveApiKey,
} from './api-key-store'
import {
  GLOBAL_SECRET_SCOPE_ID,
  getProjectSecretStoragePrefix,
  getSecretStoragePrefix,
  type SecretScope,
} from './secret-key-scope'

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

export type SecretName = string

export { getProjectSecretStoragePrefix } from './secret-key-scope'
export { getGlobalSecretStoragePrefix, type SecretScope } from './secret-key-scope'

function assertSecretName(name: string): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid secret name "${name}". Secret names must match ${SECRET_NAME_PATTERN.source}.`
    )
  }
}

// ---------------------------------------------------------------------------
// Storage-key helpers
// ---------------------------------------------------------------------------

function getProjectStorageKey(projectId: string, name: SecretName): string {
  assertSecretName(name)
  return `${getProjectSecretStoragePrefix(projectId)}${name}`
}

function getGlobalStorageKey(name: SecretName): string {
  assertSecretName(name)
  return `${getSecretStoragePrefix('global')}${name}`
}

// ---------------------------------------------------------------------------
// Read API — with project-over-global fallback
// ---------------------------------------------------------------------------

/**
 * Load a secret value for trusted runtime plumbing only.
 *
 * Checks the project-scoped key first; if missing, falls back to the global
 * scope. Returns `null` only when neither scope has the secret.
 */
export async function loadSecret(projectId: string, name: SecretName): Promise<string | null> {
  assertSecretName(name)
  // 1. Project scope (exact) — skip when projectId is empty (global-only lookup)
  if (projectId) {
    const projectValue = await loadApiKey(getProjectStorageKey(projectId, name))
    if (projectValue !== null) return projectValue
  }
  // 2. Global scope fallback
  return loadApiKey(getGlobalStorageKey(name))
}

/**
 * Check whether a secret exists in *any* scope (project or global).
 * Does not reveal the value.
 */
export async function hasSecret(projectId: string, name: SecretName): Promise<boolean> {
  assertSecretName(name)
  // Project scope
  if (projectId && (await hasApiKey(getProjectStorageKey(projectId, name)))) return true
  // Global scope
  return hasApiKey(getGlobalStorageKey(name))
}

// ---------------------------------------------------------------------------
// Write / Delete — scope-aware (backward-compatible)
// ---------------------------------------------------------------------------

/**
 * Save a non-empty secret value using the existing encrypted local store.
 * The plaintext is never written to workspace files or SQLite columns.
 *
 * @param projectId  Required for `scope='project'`; ignored for `scope='global'`.
 * @param name       Uppercase env-style identifier.
 * @param value      Plaintext value (non-empty).
 * @param scope      `'project'` (default) or `'global'`.
 */
export async function saveSecret(
  projectId: string,
  name: SecretName,
  value: string,
  scope: SecretScope = 'project'
): Promise<void> {
  if (!value) {
    throw new Error(`Secret "${name}" cannot be empty.`)
  }
  const key =
    scope === 'global'
      ? getGlobalStorageKey(name)
      : getProjectStorageKey(projectId, name)
  await saveApiKey(key, value)
}

/**
 * Delete a secret.
 *
 * @param projectId  Required for `scope='project'`; ignored for `scope='global'`.
 * @param name       Secret name.
 * @param scope      `'project'` (default) or `'global'`.
 */
export async function deleteSecret(
  projectId: string,
  name: SecretName,
  scope: SecretScope = 'project'
): Promise<void> {
  const key =
    scope === 'global'
      ? getGlobalStorageKey(name)
      : getProjectStorageKey(projectId, name)
  await deleteApiKey(key)
}

/**
 * Promote a project-scoped secret to the global scope.
 *
 * Reads the project value, writes it under the global key, then deletes the
 * project-scoped key. The operation is **idempotent**: if a global secret with
 * the same name already exists it is overwritten. The caller should confirm
 * with the user before overwriting.
 *
 * @returns `true` if the secret was promoted, `false` if the project-scoped
 *          secret did not exist.
 */
export async function promoteSecretToGlobal(
  projectId: string,
  name: SecretName
): Promise<boolean> {
  assertSecretName(name)
  const value = await loadApiKey(getProjectStorageKey(projectId, name))
  if (value === null) return false

  await saveApiKey(getGlobalStorageKey(name), value)
  await deleteApiKey(getProjectStorageKey(projectId, name))
  return true
}

// ---------------------------------------------------------------------------
// Listing — union of project + global scopes
// ---------------------------------------------------------------------------

/** A named secret with the scope it was resolved from. */
export interface SecretEntry {
  name: SecretName
  scope: SecretScope
}

/**
 * List configured secret names only (values are never loaded).
 *
 * Returns the **union** of project-scoped and global-scoped names.
 * If the same name exists in both scopes, the project scope wins.
 */
export async function getAllSecretNames(projectId?: string): Promise<SecretName[]> {
  const entries = await getAllSecretEntries(projectId)
  return entries.map((e) => e.name)
}

/**
 * List configured secrets with their resolved scope.
 *
 * Project scope takes priority: a name present in both scopes only appears once
 * with `scope: 'project'`. This mirrors the read-time fallback semantics so the
 * UI can show users which scope will actually be used at runtime.
 */
export async function getAllSecretEntries(projectId?: string): Promise<SecretEntry[]> {
  const storageKeys = await getAllApiKeyProviders()

  const globalPrefix = getSecretStoragePrefix('global')
  const globalNames = new Set<SecretName>()

  const projectNames = new Set<SecretName>()
  if (projectId) {
    const projectPrefix = getProjectSecretStoragePrefix(projectId)
    for (const key of storageKeys) {
      if (key.startsWith(projectPrefix)) {
        const name = key.slice(projectPrefix.length)
        if (SECRET_NAME_PATTERN.test(name)) projectNames.add(name)
      }
    }
  }

  for (const key of storageKeys) {
    if (key.startsWith(globalPrefix)) {
      const name = key.slice(globalPrefix.length)
      if (SECRET_NAME_PATTERN.test(name)) globalNames.add(name)
    }
  }

  const entries: SecretEntry[] = []

  // Project scope first (priority)
  for (const name of projectNames) {
    entries.push({ name, scope: 'project' })
  }
  // Global scope (skip names already present in project scope)
  for (const name of globalNames) {
    if (!projectNames.has(name)) {
      entries.push({ name, scope: 'global' })
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

/**
 * List **only** global-scoped secret names. Used by the Secret Manager UI to
 * show the global section independently of the project section.
 */
export async function getGlobalSecretNames(): Promise<SecretName[]> {
  const storageKeys = await getAllApiKeyProviders()
  const globalPrefix = getSecretStoragePrefix('global')
  return storageKeys
    .filter((key) => key.startsWith(globalPrefix))
    .map((key) => key.slice(globalPrefix.length))
    .filter((name) => SECRET_NAME_PATTERN.test(name))
    .sort()
}

/** Re-exported for `project.repository.ts` cascade-delete (project scope only). */
export { GLOBAL_SECRET_SCOPE_ID }
