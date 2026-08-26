'use client'

/**
 * Legacy singular workspace URL (HTTP-308'd to the bare form by
 * next.config.mjs for external loads; only reached via in-app history).
 * The actual workspace UI is rendered by the parent layout — see
 * layout.tsx. This page exists only so the URL resolves.
 */
export default function ProjectWorkspacePage() {
  return null
}
