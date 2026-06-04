/**
 * Renderer for WebMCP on-demand tools:
 * - webmcp_get_tool_schema: displays matched tool schemas with parameter details
 * - webmcp_call: displays tool execution with hostname, result preview, and errors
 */

import { Plug } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

// ── webmcp_get_tool_schema ──

registerRenderer({
  name: 'webmcp_get_tool_schema',
  icon: <Plug className="h-3.5 w-3.5 text-violet-400" />,
  Summary(ctx) {
    const names = extractToolNames(ctx)
    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">get_tool_schema</code>
        {names.length > 0 && (
          <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[280px]">
            {names.length === 1 ? shortToolName(names[0]) : `${names.length} tools`}
          </span>
        )}
        {!ctx.isExecuting && !ctx.isStreaming && !ctx.isError && (
          <span className="ml-auto text-xs text-emerald-500 shrink-0">✓ schema loaded</span>
        )}
      </>
    )
  },
  Detail(ctx) {
    const tools = extractSchemaResults(ctx)

    if (ctx.isExecuting) return <StreamingPlaceholder count={1} />
    if (tools.length === 0) {
      if (ctx.isError) return <ErrorDetail ctx={ctx} />
      return (
        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">No schema returned</div>
      )
    }

    return (
      <div className="px-3 py-2 space-y-2">
        {tools.map((tool, i) => (
          <div
            key={tool.fullName}
            className="rounded-md border border-neutral-100 dark:border-neutral-800 p-2"
            style={{ animation: `tool-row-in .2s ease-out ${i * 40}ms backwards` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                {tool.hostname}
              </span>
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                {tool.name}
              </span>
            </div>
            {tool.description && (
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5">{tool.description}</div>
            )}
            <SchemaParamsPreview inputSchema={tool.inputSchema} />
          </div>
        ))}
      </div>
    )
  },
})

// ── webmcp_call ──

registerRenderer({
  name: 'webmcp_call',
  icon: <Plug className="h-3.5 w-3.5 text-violet-400" />,
  Summary(ctx) {
    const fullName = typeof ctx.args.full_tool_name === 'string' ? ctx.args.full_tool_name : ''
    const hostname = extractHostnameFromResult(ctx) || extractHostnameFromToolName(fullName)

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">webmcp_call</code>
        {fullName && (
          <span className="truncate text-neutral-400 dark:text-neutral-500 max-w-[240px]">
            {shortToolName(fullName)}
          </span>
        )}
        {hostname && (
          <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 shrink-0">
            {hostname}
          </span>
        )}
        {!ctx.isExecuting && !ctx.isStreaming && (
          <span className={`ml-auto text-xs shrink-0 ${ctx.isError ? 'text-red-500' : 'text-emerald-500'}`}>
            {ctx.isError ? '✗ failed' : '✓ done'}
          </span>
        )}
      </>
    )
  },
  Detail(ctx) {
    const fullName = typeof ctx.args.full_tool_name === 'string' ? ctx.args.full_tool_name : ''
    const toolArgs = ctx.args.args as Record<string, unknown> | undefined
    const data = ctx.result?.data as Record<string, unknown> | undefined

    if (ctx.isExecuting) return <StreamingPlaceholder count={2} />
    if (ctx.isError) return <ErrorDetail ctx={ctx} />

    const hostname = typeof data?.hostname === 'string' ? data.hostname : ''
    const result = data?.result
    const pluginDownload = data?.pluginDownload as Record<string, unknown> | undefined

    return (
      <div className="px-3 py-2 space-y-2">
        {/* Header: hostname + tool name */}
        <div className="flex items-center gap-1.5">
          {hostname && (
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
              {hostname}
            </span>
          )}
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {shortToolName(fullName)}
          </span>
        </div>

        {/* Args preview (non-trivial calls) */}
        {toolArgs && Object.keys(toolArgs).length > 0 && (
          <div className="rounded border border-neutral-100 dark:border-neutral-800 p-1.5">
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">Arguments</div>
            <pre className="text-[11px] text-neutral-600 dark:text-neutral-400 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(toolArgs, null, 2).slice(0, 500)}
            </pre>
          </div>
        )}

        {/* Plugin download info */}
        {pluginDownload && (
          <div className="rounded border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10 p-2">
            <div className="text-[10px] text-blue-500 dark:text-blue-400 mb-0.5">File Downloaded</div>
            <div className="text-xs text-neutral-700 dark:text-neutral-300">
              {typeof pluginDownload.fileName === 'string' ? pluginDownload.fileName : 'file'}
            </div>
            {typeof pluginDownload.size === 'number' && (
              <div className="text-[10px] text-neutral-400">{formatBytes(pluginDownload.size)}</div>
            )}
          </div>
        )}

        {/* Result preview */}
        {result !== undefined && result !== null && !pluginDownload && (
          <div className="rounded border border-neutral-100 dark:border-neutral-800 p-1.5">
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">Result</div>
            <pre className="text-[11px] text-neutral-600 dark:text-neutral-400 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
              {typeof result === 'string' ? result.slice(0, 800) : JSON.stringify(result, null, 2).slice(0, 800)}
            </pre>
          </div>
        )}

        {/* Copy button */}
        {ctx.rawResult && (
          <div className="flex justify-end">
            <CopyIconButton content={ctx.rawResult} />
          </div>
        )}
      </div>
    )
  },
})

// ── Shared Components ──

function SchemaParamsPreview({ inputSchema }: { inputSchema: Record<string, unknown> }) {
  const properties = inputSchema.properties as Record<string, Record<string, unknown>> | undefined
  if (!properties || Object.keys(properties).length === 0) return null

  const required = new Set((inputSchema.required as string[] | undefined) || [])
  const entries = Object.entries(properties).slice(0, 8)
  const overflow = Object.keys(properties).length - entries.length

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, prop]) => (
        <span
          key={key}
          className={`text-[10px] font-mono px-1 py-0.5 rounded ${
            required.has(key)
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
              : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
          }`}
        >
          {key}
          {prop.type && <span className="opacity-50">:{prop.type}</span>}
          {required.has(key) && <span className="opacity-50">*</span>}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">+{overflow} more</span>
      )}
    </div>
  )
}

function ErrorDetail({ ctx }: { ctx: ToolRenderCtx }) {
  const error = ctx.result?.error as Record<string, unknown> | undefined
  const code = typeof error?.code === 'string' ? error.code : ''
  const message = typeof error?.message === 'string' ? error.message : ctx.rawResult || 'Unknown error'

  return (
    <div className="px-3 py-2">
      <div className="rounded border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 p-2">
        {code && (
          <div className="text-[10px] font-mono text-red-500 dark:text-red-400 mb-0.5">{code}</div>
        )}
        <div className="text-[11px] text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
          {typeof message === 'string' ? message.slice(0, 500) : String(message).slice(0, 500)}
        </div>
      </div>
    </div>
  )
}

function StreamingPlaceholder({ count = 3 }: { count?: number }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-md border border-neutral-100 dark:border-neutral-800 p-2 animate-pulse">
          <div className="h-3 w-1/3 rounded bg-neutral-200 dark:bg-neutral-700 mb-1.5" />
          <div className="h-2.5 w-2/3 rounded bg-neutral-100 dark:bg-neutral-800" />
        </div>
      ))}
    </div>
  )
}

// ── Helpers ──

interface SchemaResult {
  fullName: string
  name: string
  hostname: string
  description: string
  inputSchema: Record<string, unknown>
}

function extractToolNames(ctx: ToolRenderCtx): string[] {
  const names = ctx.args.full_tool_names
  if (Array.isArray(names)) return names.filter((n): n is string => typeof n === 'string')
  if (typeof names === 'string') return [names]
  return []
}

function extractSchemaResults(ctx: ToolRenderCtx): SchemaResult[] {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  const tools = data?.tools
  if (!Array.isArray(tools)) return []
  return tools
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map(t => ({
      fullName: typeof t.fullName === 'string' ? t.fullName : '',
      name: typeof t.name === 'string' ? t.name : '',
      hostname: typeof t.hostname === 'string' ? t.hostname : '',
      description: typeof t.description === 'string' ? t.description : '',
      inputSchema: (t.inputSchema as Record<string, unknown>) || {},
    }))
    .filter(t => t.fullName)
}

function extractHostnameFromResult(ctx: ToolRenderCtx): string {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  const hostname = data?.hostname
  return typeof hostname === 'string' ? hostname : ''
}

function extractHostnameFromToolName(fullName: string): string {
  // workspace_jianguoyun_com__fetch_ticket_messages → workspace.jianguoyun.com
  const sepIdx = fullName.indexOf('__')
  if (sepIdx === -1) return ''
  const hostPart = fullName.slice(0, sepIdx)
  return hostPart.replace(/_/g, '.')
}

function shortToolName(fullName: string): string {
  // workspace_jianguoyun_com__fetch_ticket_messages → fetch_ticket_messages
  const sepIdx = fullName.indexOf('__')
  return sepIdx === -1 ? fullName : fullName.slice(sepIdx + 2)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
