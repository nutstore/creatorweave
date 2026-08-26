'use client'

/**
 * Bare project URL. The actual workspace UI is rendered by the parent
 * layout (kept mounted across workspace switches — see layout.tsx); this
 * page exists only so the URL resolves. It must stay a client component so
 * Next treats it as a leaf under the client layout.
 */
export default function ProjectPage() {
  return null
}
