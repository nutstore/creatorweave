/**
 * Plugin List Component
 *
 * Unified design matching the main app
 */

import { PluginCard } from './PluginCard'
import type { PluginInstance } from '../../types/plugin'
import { Inbox } from 'lucide-react'

type ViewMode = 'grid' | 'list'
type SortBy = 'name' | 'version' | 'date'

interface PluginListProps {
  plugins: PluginInstance[]
  viewMode?: ViewMode
  filter?: string
  sortBy?: SortBy
  onSelect?: (plugin: PluginInstance) => void
  onDelete?: (pluginId: string) => void
  selectedPluginIds?: string[]
}

export function PluginList({
  plugins,
  viewMode = 'grid',
  filter = '',
  sortBy = 'name',
  onSelect,
  onDelete,
  selectedPluginIds = [],
}: PluginListProps) {
  // Filter plugins
  const filteredPlugins = plugins.filter((plugin) => {
    const search = filter.toLowerCase()
    return (
      plugin.metadata.name.toLowerCase().includes(search) ||
      plugin.metadata.id.toLowerCase().includes(search) ||
      plugin.metadata.description.toLowerCase().includes(search) ||
      plugin.metadata.author.toLowerCase().includes(search)
    )
  })

  // Sort plugins
  const sortedPlugins = [...filteredPlugins].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.metadata.name.localeCompare(b.metadata.name)
      case 'version':
        return compareVersions(b.metadata.version, a.metadata.version)
      case 'date':
        return (b.loadedAt || 0) - (a.loadedAt || 0)
      default:
        return 0
    }
  })

  // Empty state
  if (sortedPlugins.length === 0) {
    return (
      <div className="plugin-list-empty">
        <div className="plugin-list-empty-icon">
          <Inbox className="h-8 w-8" />
        </div>
        <div className="plugin-list-empty-title">
          {filter ? 'No plugins found' : 'No plugins installed'}
        </div>
        <div className="plugin-list-empty-subtitle">
          {filter ? `No results for "${filter}"` : 'Upload a WASM module to get started'}
        </div>
      </div>
    )
  }

  return (
    <div className={`plugin-list plugin-list--${viewMode}`}>
      {sortedPlugins.map((plugin) => (
        <PluginCard
          key={plugin.metadata.id}
          plugin={plugin}
          onSelect={() => onSelect?.(plugin)}
          onDelete={() => onDelete?.(plugin.metadata.id)}
          selected={selectedPluginIds.includes(plugin.metadata.id)}
        />
      ))}
    </div>
  )
}

/**
 * Compare semantic version strings
 */
function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const parts = v.split('.').map((p) => parseInt(p, 10))
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }

  const [aMajor, aMinor, aPatch] = parseVersion(a)
  const [bMajor, bMinor, bPatch] = parseVersion(b)

  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}
