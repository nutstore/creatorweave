/**
 * Plugin Manager Component
 *
 * Unified design matching the main app
 */

import { useState, useEffect } from 'react'
import { Puzzle, Grid3x3, List, Search, RotateCcw } from 'lucide-react'
import type { PluginInstance } from '../../types/plugin'
import { getPluginLoader } from '../../services/plugin-loader.service'
import { getPluginStorage } from '../../services/plugin-storage.service'
import { MOCK_PLUGINS } from '../../mocks/plugin-mocks'

import { PluginUpload } from './PluginUpload'
import { PluginList } from './PluginList'
import { PluginFooter } from './PluginFooter'

import './plugin-ui.css'

interface PluginManagerProps {
  onPluginsSelect?: (plugins: PluginInstance[]) => void
  selectedPlugins?: PluginInstance[]
}

type ViewMode = 'grid' | 'list'

export function PluginManager({
  onPluginsSelect,
  selectedPlugins: externalSelectedPlugins = [],
}: PluginManagerProps) {
  const [plugins, setPlugins] = useState<PluginInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'version' | 'date'>('name')
  const [selectedPluginIds, setSelectedPluginIds] = useState<string[]>([])

  // Sync external selected plugins
  useEffect(() => {
    if (externalSelectedPlugins.length > 0) {
      const ids = externalSelectedPlugins.map((p) => p.metadata.id)
      setSelectedPluginIds(ids)
    } else {
      setSelectedPluginIds([])
    }
  }, [externalSelectedPlugins])

  // Load plugins from IndexedDB on mount
  useEffect(() => {
    loadPlugins()
  }, [])

  const loadPlugins = async () => {
    setLoading(true)
    try {
      const storage = getPluginStorage()
      const savedPlugins = await storage.loadPlugins()

      if (savedPlugins.length > 0) {
        // Filter out plugins that don't have WASM implementations
        const validPlugins = savedPlugins.filter((p) => {
          const wasmId = p.metadata.id.replace(/-/g, '_')
          const builtinPlugins = ['line_counter', 'md5_calculator', 'file_stats_wasm']
          return builtinPlugins.includes(wasmId)
        })

        if (validPlugins.length > 0) {
          setPlugins(validPlugins)
        } else {
          setPlugins(MOCK_PLUGINS)
        }

        if (validPlugins.length !== savedPlugins.length) {
          console.log(`Filtered out ${savedPlugins.length - validPlugins.length} invalid plugins`)
          await storage.clearAll()
          for (const plugin of validPlugins) {
            await storage.savePlugin(plugin)
          }
        }
      } else {
        setPlugins(MOCK_PLUGINS)
      }
    } catch (error) {
      console.error('Failed to load plugins:', error)
      setPlugins(MOCK_PLUGINS)
    } finally {
      setLoading(false)
    }
  }

  const handlePluginUpload = async (file: File) => {
    try {
      const loader = getPluginLoader()
      const wasmId = file.name.replace('_bg.wasm', '').replace('.wasm', '')
      const pluginId = wasmId.replace(/_/g, '-')

      console.log('[PluginManager] Loading plugin by ID:', pluginId, 'from file:', file.name)
      const instance = await loader.loadPluginWithId(pluginId)

      const storage = getPluginStorage()
      await storage.savePlugin(instance)

      setPlugins((prev) => [...prev, instance])
    } catch (error) {
      console.error('Failed to upload plugin:', error)
      throw error
    }
  }

  const handlePluginDelete = async (pluginId: string) => {
    try {
      const loader = getPluginLoader()
      await loader.unloadPlugin(pluginId)

      const storage = getPluginStorage()
      await storage.deletePlugin(pluginId)

      setPlugins((prev) => prev.filter((p) => p.metadata.id !== pluginId))

      if (selectedPluginIds.includes(pluginId)) {
        setSelectedPluginIds((prev) => prev.filter((id) => id !== pluginId))
        const updatedPlugins = plugins.filter(
          (p) => p.metadata.id !== pluginId && selectedPluginIds.includes(p.metadata.id)
        )
        if (onPluginsSelect) {
          onPluginsSelect(updatedPlugins)
        }
      }
    } catch (error) {
      console.error('Failed to delete plugin:', error)
    }
  }

  const handlePluginSelect = (plugin: PluginInstance) => {
    const isSelected = selectedPluginIds.includes(plugin.metadata.id)

    let newIds: string[]
    if (isSelected) {
      newIds = selectedPluginIds.filter((id) => id !== plugin.metadata.id)
    } else {
      newIds = [...selectedPluginIds, plugin.metadata.id]
    }

    const newSelectedPlugins = plugins.filter((p) => newIds.includes(p.metadata.id))

    setSelectedPluginIds(newIds)
    onPluginsSelect?.(newSelectedPlugins)
  }

  const handleResetPlugins = async () => {
    try {
      const storage = getPluginStorage()
      await storage.clearAll()
      await loadPlugins()
    } catch (error) {
      console.error('Failed to reset plugins:', error)
    }
  }

  const getStats = () => {
    return {
      total: plugins.length,
      loaded: plugins.filter((p) => p.state === 'Loaded').length,
      error: plugins.filter((p) => p.state === 'Error').length,
      loading: plugins.filter((p) => p.state === 'Loading').length,
    }
  }

  if (loading) {
    return (
      <div className="plugin-loading">
        <div className="plugin-loading-spinner"></div>
        <div className="plugin-loading-text">Initializing plugin system...</div>
      </div>
    )
  }

  return (
    <div className="plugin-manager-container">
      {/* Header Section */}
      <header className="plugin-manager-header">
        <div className="plugin-manager-title">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Puzzle className="h-6 w-6" />
          </div>
          <div>
            <h1>Plugin Modules</h1>
            <div className="plugin-manager-subtitle">Extendable WASM module system</div>
          </div>
        </div>

        <div className="plugin-manager-controls">
          {/* Search */}
          <div className="plugin-manager-search">
            <Search className="plugin-manager-search-icon h-4 w-4" />
            <input
              type="text"
              placeholder="Search plugins..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button className="plugin-manager-search-clear" onClick={() => setFilter('')}>
                ✕
              </button>
            )}
          </div>

          {/* Sort */}
          <select
            className="plugin-manager-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="name">Sort by name</option>
            <option value="version">Sort by version</option>
            <option value="date">Sort by date loaded</option>
          </select>

          {/* View Toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Reset */}
          <button
            className="reset-btn"
            onClick={handleResetPlugins}
            title="Reset plugins (clear cache)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Upload Section */}
      <section className="plugin-upload-section">
        <PluginUpload onUpload={handlePluginUpload} />
      </section>

      {/* Selection Status Bar */}
      {selectedPluginIds.length > 0 && (
        <section className="plugin-selection-bar">
          <span className="plugin-selection-count">
            {selectedPluginIds.length} plugin{selectedPluginIds.length > 1 ? 's' : ''} selected
          </span>
          <button
            className="plugin-selection-clear"
            onClick={() => {
              setSelectedPluginIds([])
              onPluginsSelect?.([])
            }}
          >
            Clear all
          </button>
        </section>
      )}

      {/* Plugin List */}
      <section>
        <PluginList
          plugins={plugins}
          viewMode={viewMode}
          filter={filter}
          sortBy={sortBy}
          onSelect={handlePluginSelect}
          onDelete={handlePluginDelete}
          selectedPluginIds={selectedPluginIds}
        />
      </section>

      {/* Footer */}
      <PluginFooter stats={getStats()} />
    </div>
  )
}
