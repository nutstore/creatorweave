/** Namespace used for encrypted project-scoped secrets in the API-key table. */
const SECRET_KEY_PREFIX = '__secret__:'

/** Return the exact encrypted-key prefix for one project. */
export function getProjectSecretStoragePrefix(projectId: string): string {
  if (!projectId) {
    throw new Error('A project is required to manage secrets.')
  }
  return `${SECRET_KEY_PREFIX}${encodeURIComponent(projectId)}:`
}
