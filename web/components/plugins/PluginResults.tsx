/**
 * Plugin Results Component
 *
 * Displays aggregated results from plugin execution
 */

import type { AggregateResult } from '../../types/plugin'

interface PluginResultsProps {
  result: AggregateResult
}

export function PluginResults({ result }: PluginResultsProps) {
  const { summary, byFile, byPlugin } = result

  return (
    <div className="plugin-results">
      <ResultsSummary summary={summary} />
      <ResultsByPlugin byPlugin={byPlugin} />
      <ResultsByFile byFile={byFile} />
      <ResultsExport result={result} />
    </div>
  )
}

function ResultsSummary({ summary }: { summary: AggregateResult['summary'] }) {
  return (
    <div className="results-summary">
      <h3 className="results-summary__title">Summary</h3>
      <div className="results-summary__cards">
        <StatCard label="Total Plugins" value={summary.totalPlugins} icon="plugin" />
        <StatCard label="Total Files" value={summary.totalFiles} icon="file" />
        <StatCard label="Processed" value={summary.totalProcessed} icon="check" />
        <StatCard label="Skipped" value={summary.totalSkipped} icon="skip" />
        <StatCard label="Errors" value={summary.totalErrors} icon="error" />
        <StatCard label="Duration" value={`${summary.duration}ms`} icon="time" />
      </div>
      {summary.pluginsWithErrors.length > 0 && (
        <div className="results-summary__warnings">
          <p>Plugins with errors:</p>
          <ul>
            {summary.pluginsWithErrors.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ResultsByPlugin({ byPlugin }: { byPlugin: AggregateResult['byPlugin'] }) {
  return (
    <div className="results-by-plugin">
      <h3 className="results-by-plugin__title">Results by Plugin</h3>
      <div className="results-by-plugin__list">
        {Array.from(byPlugin.entries()).map(([id, result]) => (
          <div key={id} className="results-by-plugin__item">
            <div className="results-by-plugin__header">
              <h4 className="results-by-plugin__name">{id}</h4>
            </div>
            <div className="results-by-plugin__stats">
              <span>Processed: {result.filesProcessed}</span>
              <span>Skipped: {result.filesSkipped}</span>
              <span>Errors: {result.filesWithErrors}</span>
            </div>
            <p className="results-by-plugin__summary">{result.summary}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultsByFile({ byFile }: { byFile: AggregateResult['byFile'] }) {
  return (
    <div className="results-by-file">
      <h3 className="results-by-file__title">Results by File</h3>
      <div className="results-by-file__list">
        {Array.from(byFile.entries())
          .slice(0, 100)
          .map(([path, result]) => (
            <div key={path} className="results-by-file__item">
              <div className="results-by-file__header">
                <span className="results-by-file__name">{result.name}</span>
                <span className="results-by-file__size">{formatSize(result.size)}</span>
              </div>
              <div className="results-by-file__plugins">
                {Array.from(result.pluginResults.entries()).map(([pluginId, output]) => (
                  <span
                    key={pluginId}
                    className={`results-by-file__badge results-by-file__badge--${output.status.toLowerCase()}`}
                  >
                    {pluginId}: {output.status}
                  </span>
                ))}
              </div>
            </div>
          ))}
        {byFile.size > 100 && (
          <div className="results-by-file__more">... and {byFile.size - 100} more files</div>
        )}
      </div>
    </div>
  )
}

function ResultsExport({ result }: { result: AggregateResult }) {
  const handleExport = (format: 'json' | 'csv') => {
    let content: string
    let filename: string
    let type: string

    if (format === 'json') {
      content = JSON.stringify(result, null, 2)
      filename = `results-${Date.now()}.json`
      type = 'application/json'
    } else {
      content = exportToCSV(result)
      filename = `results-${Date.now()}.csv`
      type = 'text/csv'
    }

    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="results-export">
      <h3 className="results-export__title">Export Results</h3>
      <div className="results-export__actions">
        <button className="results-export__btn" onClick={() => handleExport('json')}>
          Export as JSON
        </button>
        <button className="results-export__btn" onClick={() => handleExport('csv')}>
          Export as CSV
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  const getIcon = () => {
    switch (icon) {
      case 'plugin':
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        )
      case 'file':
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )
      case 'check':
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )
      case 'skip':
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="10" y1="15" x2="10" y2="9" />
            <line x1="14" y1="15" x2="14" y2="9" />
          </svg>
        )
      case 'error':
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )
      case 'time':
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="stat-card">
      <div className="stat-card__icon">{getIcon()}</div>
      <div className="stat-card__content">
        <div className="stat-card__label">{label}</div>
        <div className="stat-card__value">{value}</div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function exportToCSV(result: AggregateResult): string {
  const rows: string[] = []

  // Header
  rows.push('Path,Size,Plugins,Statuses')

  // Data
  for (const [path, fileResult] of result.byFile) {
    const plugins = Array.from(fileResult.pluginResults.keys()).join(';')
    const statuses = Array.from(fileResult.pluginResults.values())
      .map((o) => o.status)
      .join(';')

    rows.push(`"${path}",${fileResult.size},"${plugins}","${statuses}"`)
  }

  return rows.join('\n')
}
