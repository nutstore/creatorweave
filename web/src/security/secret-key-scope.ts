/** Namespace used for encrypted secrets in the API-key table.

 * Secrets support two scopes:
 * - **Project scope**: prefixed with the encoded project ID, isolated per project.
 * - **Global scope**: prefixed with `__secret__:_global:`, shared across all projects.
 *
 * At read time, project-scope secrets take priority over global ones (fallback chain).
 */
const SECRET_KEY_PREFIX = '__secret__:'

/** The fixed global namespace (no project ID). */
export const GLOBAL_SECRET_SCOPE_ID = '_global'

/** Return the exact encrypted-key prefix for one project. */
export function getProjectSecretStoragePrefix(projectId: string): string {
  if (!projectId) {
    throw new Error('A project is required to manage project-scoped secrets.')
  }
  return `${SECRET_KEY_PREFIX}${encodeURIComponent(projectId)}:`
}

/** Return the exact encrypted-key prefix for global secrets. */
export function getGlobalSecretStoragePrefix(): string {
  return `${SECRET_KEY_PREFIX}${GLOBAL_SECRET_SCOPE_ID}:`
}

/** Secret scope identifier used in UI and CRUD APIs. */
export type SecretScope = 'project' | 'global'

/**
 * Resolve the storage-key prefix for the given scope.
 *
 * - `project` → requires a non-empty `projectId`.
 * - `global` → ignores `projectId`.
 */
export function getSecretStoragePrefix(scope: SecretScope, projectId?: string): string {
  if (scope === 'global') return getGlobalSecretStoragePrefix()
  if (!projectId) {
    throw new Error('A project is required to manage project-scoped secrets.')
  }
  return getProjectSecretStoragePrefix(projectId)
}

export { SECRET_KEY_PREFIX }
