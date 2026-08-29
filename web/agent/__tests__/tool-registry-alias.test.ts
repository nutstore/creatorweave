import { afterEach, describe, expect, it } from 'vitest'
import { getToolRegistry } from '../tool-registry'
import { useToolAuthStore } from '@/store/tool-auth.store'
import { useSessionAllowStore } from '@/store/session-allow.store'

/**
 * PR-3 renamed the `sync` tool to `sync-to-opfs`. The registry keeps a
 * compatibility alias so LLMs still emitting the legacy name keep working,
 * while canonical execution reports `sync-to-opfs` envelopes.
 */
describe('tool registry alias mechanism (sync → sync-to-opfs)', () => {
  afterEach(() => {
    useToolAuthStore.getState().clear()
    useSessionAllowStore.getState().clearAll()
  })

  it('resolves the legacy sync alias to the canonical tool', () => {
    const registry = getToolRegistry()
    expect(registry.resolveAlias('sync')).toBe('sync-to-opfs')
    expect(registry.resolveAlias('sync-to-opfs')).toBe('sync-to-opfs')
    expect(registry.resolveAlias('write')).toBe('write')
    // Canonical name is registered; the legacy name is NOT a separate entry.
    expect(registry.has('sync-to-opfs')).toBe(true)
    expect(registry.has('sync')).toBe(false)
  })

  it('execute() accepts the legacy alias and returns a sync-to-opfs envelope', async () => {
    const registry = getToolRegistry()
    const result = await registry.execute('sync', { paths: [] }, {} as never)
    const parsed = JSON.parse(result) as { tool?: string; error?: { code?: string } | string }
    // The envelope tool name is the CANONICAL one — the alias never leaks.
    const envelopeTool = (parsed as { tool?: string }).tool
    expect(envelopeTool).toBe('sync-to-opfs')
  })

  it('policy lookup goes through the alias too', () => {
    const registry = getToolRegistry()
    expect(registry.getPolicy('sync')?.level).toBe('auto')
    expect(registry.getPolicy('sync-to-opfs')?.level).toBe('auto')
  })

  it('unknown tools do not resolve', () => {
    const registry = getToolRegistry()
    expect(registry.resolveAlias('nope')).toBe('nope')
    expect(registry.getPolicy('nope')).toBeUndefined()
  })
})
