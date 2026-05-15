/**
 * Router configuration — shared route types and helpers.
 *
 * react-router handles URL parsing via route patterns.
 * This module exports helper types used by multiple components.
 */

/** Route path constants matching react-router route definitions. */
export const ROUTE_PATHS = {
  projectsHome: '/projects',
  projectWorkspace: '/projects/:projectId',
  projectWorkspaceWithId: '/projects/:projectId/workspaces/:workspaceId',
  // Also match the singular form for backwards compat
  projectWorkspaceSingular: '/projects/:projectId/workspace',
  webcontainerPreview: '/webcontainer-preview',
  filePreview: '/preview',
  docs: '/docs',
  docsLanguage: '/docs/:language',
  docsCategory: '/docs/:language/:category',
  docsPage: '/docs/:language/:category/:page',
} as const

/**
 * Build a project workspace path.
 * Uses hash router internally, so paths start with /.
 */
export function projectWorkspacePath(projectId: string, workspaceId?: string): string {
  const encoded = encodeURIComponent(projectId)
  if (workspaceId) {
    return `/projects/${encoded}/workspaces/${encodeURIComponent(workspaceId)}`
  }
  return `/projects/${encoded}/workspace`
}

/**
 * Build a docs path.
 */
export function docsPath(language?: string, category?: string, page?: string): string {
  const parts = ['docs', language, category, page].filter(Boolean)
  return '/' + parts.join('/')
}
