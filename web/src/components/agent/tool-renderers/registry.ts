/**
 * Tool Renderer Registry.
 * Maps tool names to their custom renderers.
 * Falls back to GenericToolRenderer for unregistered tools.
 */

import type { ToolRenderer } from './types'

const registry = new Map<string, ToolRenderer>()

export function registerRenderer(renderer: ToolRenderer) {
  registry.set(renderer.name, renderer)
}

export function getRenderer(toolName: string): ToolRenderer | undefined {
  return registry.get(toolName)
}

/** Get all registered renderers (for debugging) */
export function getAllRenderers(): ReadonlyMap<string, ToolRenderer> {
  return registry
}
