/**
 * Plugin Footer Component
 *
 * Unified design matching the main app
 */

import './plugin-ui.css'

interface PluginFooterProps {
  stats: {
    total: number
    loaded: number
    error: number
    loading: number
  }
}

export function PluginFooter({ stats }: PluginFooterProps) {
  return (
    <footer className="plugin-footer">
      <div className="plugin-footer-stats">
        {stats.loaded > 0 && (
          <div className="plugin-footer-stat">
            <span className="plugin-footer-stat-dot plugin-footer-stat-dot--loaded"></span>
            <span className="plugin-footer-stat-text">{stats.loaded} active</span>
          </div>
        )}
        {stats.loading > 0 && (
          <div className="plugin-footer-stat">
            <span className="plugin-footer-stat-dot plugin-footer-stat-dot--loading"></span>
            <span className="plugin-footer-stat-text">{stats.loading} loading</span>
          </div>
        )}
        {stats.error > 0 && (
          <div className="plugin-footer-stat">
            <span className="plugin-footer-stat-dot plugin-footer-stat-dot--error"></span>
            <span className="plugin-footer-stat-text">{stats.error} error</span>
          </div>
        )}
      </div>

      <div className="plugin-footer-brand">
        <span>Plugin System v2.0</span>
      </div>
    </footer>
  )
}
