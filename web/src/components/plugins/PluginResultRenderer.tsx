/**
 * Universal Plugin Result Renderer
 *
 * Renders plugin results based on UI Schema defined in plugin metadata.
 * This allows plugins to control how their results are displayed without
 * requiring custom React components.
 */

import type { PluginResultWithMetadata, PluginMetadata } from '@/types/plugin'

//=============================================================================
// UI Schema Types
//=============================================================================

type ColumnType = 'text' | 'number' | 'bytes' | 'duration' | 'badge' | 'progress' | 'code'

export interface UIColumn {
  key: string
  label: string
  type?: ColumnType
  width?: string
  sortable?: boolean
  format?: string // for numbers: "0.00", for bytes: "MB"
}

export type UISchema =
  | { type: 'table'; columns: UIColumn[]; sortable?: boolean; filterable?: boolean }
  | { type: 'cards'; titleKey: string; subtitleKey?: string; metricKey?: string; icon?: string }
  | { type: 'key_value'; pairs: { key: string; label: string; type?: ColumnType }[] }
  | { type: 'code'; language?: string }
  | { type: 'json'; collapsible?: boolean }
  | { type: 'chart'; chartType: 'bar' | 'line' | 'pie'; xKey: string; yKey: string }

type PluginMetadataWithUISchema = PluginMetadata & {
  ui_schema?: UISchema
}

type FileResultRow = {
  path: string
  name: string
  output?: unknown
  success: boolean
  size: number
  [key: string]: unknown
}

//=============================================================================
// Formatters
//=============================================================================

function formatCellValue(value: unknown, type: ColumnType = 'text', _format?: string): string {
  if (value === null || value === undefined) return '-'

  switch (type) {
    case 'number': {
      return typeof value === 'number'
        ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        : String(value)
    }

    case 'bytes': {
      const bytes = typeof value === 'number' ? value : parseFloat(String(value)) || 0
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
    }

    case 'duration': {
      const ms = typeof value === 'number' ? value : parseFloat(String(value)) || 0
      if (ms < 1000) return `${ms}ms`
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
      return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
    }

    case 'badge': {
      const badgeColor = getBadgeColor(String(value))
      return `<span class="px-2 py-1 rounded text-xs font-medium ${badgeColor}">${escapeHtml(String(value))}</span>`
    }

    case 'progress': {
      const progress = typeof value === 'number' ? value : parseFloat(String(value)) || 0
      return `
        <div class="flex items-center gap-2">
          <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-blue-600 rounded-full" style="width: ${Math.min(100, Math.max(0, progress))}%"></div>
          </div>
          <span class="text-xs text-gray-600">${progress.toFixed(0)}%</span>
        </div>
      `
    }

    case 'code':
      return `<code class="px-2 py-1 bg-gray-100 rounded text-sm font-mono">${escapeHtml(String(value))}</code>`

    default:
      return escapeHtml(String(value))
  }
}

function getBadgeColor(value: string): string {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    completed: 'bg-green-100 text-green-700',
    pass: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    failed: 'bg-red-100 text-red-700',
    fail: 'bg-red-100 text-red-700',
    warning: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-yellow-100 text-yellow-700',
    info: 'bg-blue-100 text-blue-700',
    processing: 'bg-blue-100 text-blue-700',
    default: 'bg-gray-100 text-gray-700',
  }
  const lower = value.toLowerCase()
  return colors[lower] || colors.default
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

//=============================================================================
// Renderers
//=============================================================================

interface PluginResultRendererProps {
  pluginResult: PluginResultWithMetadata
  metadata?: PluginMetadata
  fileResults?: FileResultRow[]
}

/**
 * Main renderer component - dispatches to appropriate renderer based on schema
 */
export function PluginResultRenderer({
  pluginResult,
  metadata,
  fileResults,
}: PluginResultRendererProps) {
  // Get UI schema from plugin metadata
  const uiSchema = (metadata as PluginMetadataWithUISchema | undefined)?.ui_schema

  // If no schema, fall back to automatic detection
  if (!uiSchema) {
    return <AutoRenderer pluginResult={pluginResult} fileResults={fileResults} />
  }

  // Render based on schema type
  switch (uiSchema.type) {
    case 'table':
      return <TableRenderer schema={uiSchema} fileResults={fileResults} />
    case 'cards':
      return <CardsRenderer schema={uiSchema} fileResults={fileResults} />
    case 'key_value':
      return <KeyValueRenderer schema={uiSchema} data={pluginResult.metrics} />
    case 'code':
      return <CodeRenderer data={pluginResult} />
    case 'json':
      return <JsonRenderer data={pluginResult} collapsible={uiSchema.collapsible} />
    case 'chart':
      return <ChartRenderer schema={uiSchema} fileResults={fileResults} />
    default:
      return <JsonRenderer data={pluginResult} />
  }
}

//=============================================================================
// Auto Renderer (fallback)
//=============================================================================

function AutoRenderer({ pluginResult, fileResults }: PluginResultRendererProps) {
  const hasFileResults = fileResults && fileResults.length > 0

  // If we have per-file results, show them in a table
  if (hasFileResults) {
    return (
      <div className="rounded-lg border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left font-medium text-gray-700 dark:text-neutral-300">File</th>
              <th className="py-2 text-right font-medium text-gray-700 dark:text-neutral-300">Size</th>
              <th className="py-2 text-center font-medium text-gray-700 dark:text-neutral-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {fileResults.map((file, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2 text-gray-900 dark:text-neutral-100">{file.name}</td>
                <td className="py-2 text-right text-gray-600 dark:text-neutral-300">
                  {formatCellValue(file.size, 'bytes')}
                </td>
                <td className="py-2 text-center">
                  <span
                    className={`text-xs font-medium ${file.success ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {file.success ? '✓' : '✗'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Otherwise show metrics as key-value pairs
  return <JsonRenderer data={pluginResult} collapsible={false} />
}

//=============================================================================
// Table Renderer
//=============================================================================

function TableRenderer({
  schema,
  fileResults,
}: {
  schema: Extract<UISchema, { type: 'table' }>
  fileResults?: FileResultRow[]
}) {
  if (!fileResults || fileResults.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-neutral-400">No file results to display</p>
  }

  const getNestedValue = (obj: unknown, key: string): unknown => {
    return key.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') {
        return undefined
      }
      return (current as Record<string, unknown>)[segment]
    }, obj)
  }

  return (
    <div className="overflow-x-auto rounded-lg border dark:border-neutral-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-neutral-800">
          <tr>
            {schema.columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left font-medium text-gray-700 dark:text-neutral-300"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fileResults.map((file, i) => (
            <tr key={i} className="border-t hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
              {schema.columns.map((col) => {
                const value = getNestedValue(file, col.key)
                return (
                  <td key={col.key} className="px-4 py-3 text-gray-900 dark:text-neutral-100">
                    {col.type === 'badge' ? (
                      <span
                        dangerouslySetInnerHTML={{ __html: formatCellValue(value, col.type) }}
                      />
                    ) : col.type === 'progress' ? (
                      <span
                        dangerouslySetInnerHTML={{ __html: formatCellValue(value, col.type) }}
                      />
                    ) : (
                      formatCellValue(value, col.type)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

//=============================================================================
// Cards Renderer
//=============================================================================

function CardsRenderer({
  schema,
  fileResults,
}: {
  schema: Extract<UISchema, { type: 'cards' }>
  fileResults?: FileResultRow[]
}) {
  if (!fileResults || fileResults.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-neutral-400">No file results to display</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fileResults.map((file, i) => {
        const title = toDisplayString(file[schema.titleKey] ?? file.name ?? 'Unnamed')
        const subtitle = schema.subtitleKey
          ? toDisplayString(file[schema.subtitleKey])
          : toDisplayString(file.path)
        const metric = schema.metricKey ? file[schema.metricKey] : null

        return (
          <div key={i} className="rounded-lg border bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
            <h4 className="truncate font-medium text-gray-900 dark:text-neutral-100" title={title}>
              {title}
            </h4>
            {subtitle.length > 0 && (
              <p className="truncate text-sm text-gray-500 dark:text-neutral-400" title={subtitle}>
                {subtitle}
              </p>
            )}
            {metric !== null && (
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-neutral-100">{toDisplayString(metric)}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

//=============================================================================
// Key-Value Renderer
//=============================================================================

function KeyValueRenderer({
  schema,
  data,
}: {
  schema: Extract<UISchema, { type: 'key_value' }>
  data?: unknown
}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return <p className="text-sm text-gray-500 dark:text-neutral-400">No metrics available</p>
  }
  const metrics = data as Record<string, unknown>

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {schema.pairs.map(({ key, label, type = 'text' }) => {
        const value = metrics[key]
        return (
          <div key={key} className="flex items-center gap-3 rounded-lg border bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex-1">
              <p className="text-xs text-gray-600 dark:text-neutral-400">{label}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{formatCellValue(value, type)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

//=============================================================================
// Code Renderer
//=============================================================================

function CodeRenderer({ data }: { data: unknown }) {
  const code = typeof data === 'string' ? data : JSON.stringify(data, null, 2)

  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4">
      <code className="text-sm text-gray-100">{code}</code>
    </pre>
  )
}

//=============================================================================
// JSON Renderer
//=============================================================================

function JsonRenderer({ data, collapsible = true }: { data: unknown; collapsible?: boolean }) {
  const json = JSON.stringify(data, null, 2)

  return (
    <details open={!collapsible} className="group">
      <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-neutral-300 dark:hover:text-neutral-100">
        Raw JSON
      </summary>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-100 p-4 text-xs dark:bg-neutral-800">
        <code className="text-gray-800 dark:text-neutral-200">{json}</code>
      </pre>
    </details>
  )
}

//=============================================================================
// Chart Renderer (simple CSS-based charts)
//=============================================================================

function ChartRenderer({
  schema,
  fileResults,
}: {
  schema: Extract<UISchema, { type: 'chart' }>
  fileResults?: FileResultRow[]
}) {
  if (!fileResults || fileResults.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-neutral-400">No data to display</p>
  }

  const maxValue = Math.max(
    ...fileResults.map((f) => {
      const val = f[schema.yKey]
      return typeof val === 'number' ? val : 0
    })
  )

  return (
    <div className="space-y-2">
      {fileResults.map((file, i) => {
        const label = String(file[schema.xKey] || file.name || `Item ${i}`)
        const rawValue = file[schema.yKey]
        const numericValue = typeof rawValue === 'number' ? rawValue : 0
        const percent = maxValue > 0 ? (numericValue / maxValue) * 100 : 0

        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-32 flex-shrink-0 truncate text-sm text-gray-700 dark:text-neutral-300" title={label}>
              {label}
            </div>
            <div className="h-6 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-neutral-800">
              <div
                className="h-full rounded bg-blue-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="w-16 flex-shrink-0 text-right text-sm font-medium text-gray-900 dark:text-neutral-100">
              {typeof rawValue === 'number' ? rawValue.toLocaleString() : toDisplayString(rawValue)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
