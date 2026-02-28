/**
 * Plugin Executor Component
 *
 * Controls for executing plugins on files and displaying progress
 */

import { useState } from 'react'
import type {
  PluginInstance,
  FileEntry,
  ExecutionProgress,
  AggregateResult,
  PluginResult,
  Plugin,
} from '../../types/plugin'
import { PluginDispatcher } from '../../services/plugin-dispatcher.service'
import { PluginExecutorService } from '../../services/plugin-executor.service'
import { PluginResultAggregator } from '../../services/plugin-aggregator.service'

interface PluginExecutorProps {
  plugins: PluginInstance[]
  files: FileEntry[]
  onProgress?: (progress: ExecutionProgress) => void
  onComplete?: (result: AggregateResult) => void
}

export function PluginExecutor({ plugins, files, onProgress, onComplete }: PluginExecutorProps) {
  const [executing, setExecuting] = useState(false)
  const [currentPlugin, setCurrentPlugin] = useState<string | null>(null)
  const [currentFile, setCurrentFile] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set())

  const loadedPlugins = plugins.filter((p) => p.state === 'Loaded')

  const handleTogglePlugin = (pluginId: string) => {
    const newSelected = new Set(selectedPlugins)
    if (newSelected.has(pluginId)) {
      newSelected.delete(pluginId)
    } else {
      newSelected.add(pluginId)
    }
    setSelectedPlugins(newSelected)
  }

  const handleExecute = async () => {
    if (selectedPlugins.size === 0 || files.length === 0) {
      return
    }

    setExecuting(true)
    const startTime = Date.now()

    try {
      const pluginsToExecute: Plugin[] = loadedPlugins
        .filter((p) => selectedPlugins.has(p.metadata.id))
        .map((p) => ({
          id: p.metadata.id,
          metadata: p.metadata,
        }))

      const dispatcher = new PluginDispatcher()
      const executor = new PluginExecutorService()
      const aggregator = new PluginResultAggregator()

      // 1. Distribute files to plugins
      dispatcher.dispatch(files, pluginsToExecute)

      // 2. Execute plugins in parallel
      const results = await executor.executeParallel(pluginsToExecute, files, {
        onProgress: (p) => {
          setCurrentPlugin(p.pluginId)
          setCurrentFile(p.currentFile)
          setProgress(p.percentage)
          onProgress?.(p)
        },
      })

      // 3. Aggregate results
      const duration = Date.now() - startTime
      const pluginResults = new Map<string, PluginResult>()
      for (const [pluginId, execution] of results) {
        const finalResult = execution.result.finalResult
        pluginResults.set(pluginId, {
          summary: finalResult?.summary || execution.result.summary,
          filesProcessed: finalResult?.filesProcessed ?? 0,
          filesSkipped: finalResult?.filesSkipped ?? 0,
          filesWithErrors: finalResult?.filesWithErrors ?? execution.result.errors.length,
          metrics: finalResult?.metrics ?? {},
          warnings: finalResult?.warnings ?? execution.result.errors,
        })
      }

      const aggregated = aggregator.aggregate(pluginResults, files.length, duration)

      onComplete?.(aggregated)
    } catch (error) {
      console.error('Execution failed:', error)
    } finally {
      setExecuting(false)
      setCurrentPlugin(null)
      setProgress(0)
    }
  }

  const handleCancel = () => {
    // In production, this would cancel the execution
    setExecuting(false)
    setCurrentPlugin(null)
    setProgress(0)
  }

  return (
    <div className="plugin-executor">
      <div className="plugin-executor__header">
        <h3 className="plugin-executor__title">Execute Plugins</h3>
        <div className="plugin-executor__stats">
          <span className="plugin-executor__stat">{files.length} files selected</span>
          <span className="plugin-executor__stat">{selectedPlugins.size} plugins selected</span>
        </div>
      </div>

      <div className="plugin-executor__plugins">
        {loadedPlugins.length === 0 ? (
          <div className="plugin-executor__empty">No loaded plugins available</div>
        ) : (
          loadedPlugins.map((plugin) => {
            const isSelected = selectedPlugins.has(plugin.metadata.id)
            return (
              <label
                key={plugin.metadata.id}
                className={`plugin-executor__plugin ${isSelected ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleTogglePlugin(plugin.metadata.id)}
                  disabled={executing}
                />
                <span className="plugin-executor__plugin-name">{plugin.metadata.name}</span>
                <span className="plugin-executor__plugin-version">{plugin.metadata.version}</span>
              </label>
            )
          })
        )}
      </div>

      {executing && (
        <div className="plugin-executor__progress">
          <div className="plugin-executor__progress-bar">
            <div className="plugin-executor__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="plugin-executor__progress-text">
            {currentPlugin && (
              <>
                Processing with {currentPlugin}
                {currentFile && `: ${currentFile}`}
              </>
            )}
          </div>
        </div>
      )}

      <div className="plugin-executor__actions">
        <button
          className="plugin-executor__btn plugin-executor__btn--execute"
          onClick={handleExecute}
          disabled={executing || selectedPlugins.size === 0 || files.length === 0}
        >
          {executing ? 'Executing...' : 'Execute'}
        </button>
        {executing && (
          <button
            className="plugin-executor__btn plugin-executor__btn--cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
