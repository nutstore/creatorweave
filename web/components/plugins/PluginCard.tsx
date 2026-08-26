/**
 * Plugin Card Component
 *
 * Unified design matching the main app
 */

import { FileCode, Trash2, ChevronRight } from 'lucide-react'
import type { PluginInstance } from '../../types/plugin'

interface PluginCardProps {
  plugin: PluginInstance
  onSelect?: (plugin: PluginInstance) => void
  onDelete?: () => void
  selected?: boolean
}

export function PluginCard({ plugin, onSelect, onDelete, selected }: PluginCardProps) {
  const { metadata, state } = plugin

  const getStatusConfig = () => {
    switch (state) {
      case 'Loading':
        return { text: 'LOADING', className: 'plugin-card-status--loading' }
      case 'Loaded':
        return { text: 'ACTIVE', className: 'plugin-card-status--loaded' }
      case 'Error':
        return { text: 'ERROR', className: 'plugin-card-status--error' }
      default:
        return { text: 'UNKNOWN', className: '' }
    }
  }

  const status = getStatusConfig()

  return (
    <div className={`plugin-card ${selected ? 'plugin-card--selected' : ''}`}>
      {/* Header */}
      <div className="plugin-card-header">
        <div className="plugin-card-icon">
          <FileCode className="h-6 w-6" />
        </div>
        <div className="plugin-card-content">
          <h3 className="plugin-card-name">{metadata.name}</h3>
          <div className="plugin-card-meta">
            <span>v{metadata.version}</span>
            <span>•</span>
            <span className="plugin-card-id">{metadata.id}</span>
          </div>
        </div>
        <div className={`plugin-card-status ${status.className}`}>{status.text}</div>
      </div>

      {/* Body */}
      <div className="plugin-card-body">
        <p className="plugin-card-description">{metadata.description}</p>

        {/* Specs */}
        <div className="plugin-card-specs">
          <div className="plugin-card-spec">
            <span className="plugin-card-spec-label">Author</span>
            <span className="plugin-card-spec-value">{metadata.author}</span>
          </div>
          <div className="plugin-card-spec">
            <span className="plugin-card-spec-label">API Version</span>
            <span className="plugin-card-spec-value">{metadata.api_version}</span>
          </div>
          <div className="plugin-card-spec">
            <span className="plugin-card-spec-label">Memory Limit</span>
            <span className="plugin-card-spec-value">
              {formatMemory(metadata.resource_limits?.max_memory ?? 16 * 1024 * 1024)}
            </span>
          </div>
        </div>

        {/* File Extensions */}
        {metadata.capabilities.file_extensions.length > 0 && (
          <div className="plugin-card-extensions">
            {metadata.capabilities.file_extensions.slice(0, 6).map((ext) => (
              <span key={ext} className="plugin-card-ext">
                {ext === '*' ? 'ALL' : ext.toUpperCase()}
              </span>
            ))}
            {metadata.capabilities.file_extensions.length > 6 && (
              <span className="plugin-card-ext">
                +{metadata.capabilities.file_extensions.length - 6}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="plugin-card-footer">
        <button
          className="plugin-card-btn plugin-card-btn--select"
          onClick={() => onSelect?.(plugin)}
          disabled={state !== 'Loaded'}
        >
          Select
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          className="plugin-card-btn plugin-card-btn--delete"
          onClick={onDelete}
          title="Remove plugin"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function formatMemory(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  }
  return `${(bytes / 1024).toFixed(0)}KB`
}
