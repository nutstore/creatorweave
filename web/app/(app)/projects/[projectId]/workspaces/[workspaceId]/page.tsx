'use client'

/**
 * Canonical workspace URL. The actual workspace UI is rendered by the
 * parent layout (kept mounted across workspace switches — see layout.tsx);
 * this page exists only so the URL resolves and the [workspaceId] segment
 * is part of the route (useParams() in the layout reads it).
 */
export default function ProjectWorkspaceByIdPage() {
  return null
}
