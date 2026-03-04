/**
 * MCP Settings Component
 *
 * UI for managing MCP (Model Context Protocol) server configurations.
 * Allows adding, editing, deleting, and testing MCP server connections.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Edit,
  X,
  RefreshCw,
  Circle,
  CircleCheck,
  CircleX,
  Globe,
  Eye,
  EyeOff,
  Loader2,
  Power,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { getMCPManager } from '@/mcp'
import type { MCPServerConfig, MCPConnectionState } from '@/mcp/mcp-types'
import { useT } from '@/i18n'

type TransportType = 'sse' | 'streamable_http'

interface MCPServerItem extends MCPServerConfig {
  connectionStatus?: MCPConnectionState
  tools?: string[]
  error?: string
}

interface ServerFormData {
  id: string
  name: string
  description: string
  url: string
  transport: TransportType
  enabled: boolean
  token: string
  timeout: string
  type: 'builtin' | 'user' | 'project'
}

const EMPTY_FORM: ServerFormData = {
  id: '',
  name: '',
  description: '',
  url: '',
  transport: 'sse',
  enabled: true,
  token: '',
  timeout: '30000',
  type: 'user',
}

export function MCPSettings() {
  const mcpManager = getMCPManager()
  const t = useT()
  const tf = useCallback(
    (key: string, fallback: string, params?: Record<string, string | number>) => {
      const value = t(key, params)
      return !value || value === key ? fallback : value
    },
    [t]
  )
  const transportLabels: Record<TransportType, string> = {
    sse: tf('mcp.form.transport.sse', 'SSE (Server-Sent Events)'),
    streamable_http: tf('mcp.form.transport.streamableHttp', 'Streamable HTTP'),
  }

  // State
  const [servers, setServers] = useState<MCPServerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingServer, setEditingServer] = useState<string | null>(null)
  const [formData, setFormData] = useState<ServerFormData>(EMPTY_FORM)
  const [showToken, setShowToken] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      await mcpManager.initialize()

      const allServers = mcpManager.getAllServers()
      const statuses = mcpManager.getAllConnectionStatuses()

      const serverItems: MCPServerItem[] = allServers.map((server) => {
        const status = statuses.find((s) => s.serverId === server.id)
        return {
          ...server,
          connectionStatus: status?.state || 'disconnected',
          tools: status?.tools?.map((t) => t.name) || [],
          error: status?.error,
        }
      })

      setServers(serverItems)
    } catch (error) {
      console.error('[MCPSettings] Failed to load servers:', error)
      toast.error('Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [mcpManager])

  const refreshConnectionStatuses = useCallback(() => {
    setServers((prev) => {
      let changed = false
      const next = prev.map((server) => {
        const status = mcpManager.getConnectionStatus(server.id)
        const nextStatus = status?.state || 'disconnected'
        const nextTools = status?.tools?.map((t) => t.name) || []
        const nextError = status?.error

        const toolsChanged =
          (server.tools?.length || 0) !== nextTools.length ||
          (server.tools || []).some((name, index) => name !== nextTools[index])

        if (
          server.connectionStatus !== nextStatus ||
          server.error !== nextError ||
          toolsChanged
        ) {
          changed = true
        }

        return {
          ...server,
          connectionStatus: nextStatus,
          tools: nextTools,
          error: nextError,
        }
      })
      return changed ? next : prev
    })
  }, [mcpManager])

  // Load servers on mount
  useEffect(() => {
    loadServers()
  }, [loadServers])

  // Refresh connection statuses periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refreshConnectionStatuses()
    }, 5000)

    return () => clearInterval(interval)
  }, [refreshConnectionStatuses])

  // Form handling
  const openAddForm = () => {
    setFormData(EMPTY_FORM)
    setFormErrors({})
    setShowAddForm(true)
    setEditingServer(null)
  }

  const openEditForm = (server: MCPServerItem) => {
    setFormData({
      id: server.id,
      name: server.name,
      description: server.description || '',
      url: server.url,
      transport: server.transport as TransportType,
      enabled: server.enabled,
      token: server.token || '',
      timeout: String(server.timeout || 30000),
      type: server.type || 'user',
    })
    setFormErrors({})
    setEditingServer(server.id)
    setShowAddForm(true)
  }

  const closeForm = () => {
    setShowAddForm(false)
    setEditingServer(null)
    setFormData(EMPTY_FORM)
    setFormErrors({})
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    // Validate server ID
    const validation = mcpManager.validateServerId(formData.id)
    if (formData.id && !validation.valid) {
      errors.id = validation.error || tf('mcp.validation.invalidServerId', 'Invalid server ID')
    }

    // Validate required fields
    if (!formData.name.trim()) {
      errors.name = tf('mcp.validation.nameRequired', 'Please enter server name')
    }
    if (!formData.url.trim()) {
      errors.url = tf('mcp.validation.urlRequired', 'Please enter server URL')
    } else {
      try {
        new URL(formData.url)
      } catch {
        errors.url = tf('mcp.validation.urlInvalid', 'Please enter a valid URL')
      }
    }

    // Validate timeout
    const timeout = parseInt(formData.timeout)
    if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
      errors.timeout = tf(
        'mcp.validation.timeoutRange',
        'Timeout must be between 1000-300000ms'
      )
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) {
      return
    }

    setSaving(true)
    try {
      if (editingServer) {
        // Update existing server
        await mcpManager.updateServer(editingServer, {
          name: formData.name,
          description: formData.description || undefined,
          url: formData.url,
          transport: formData.transport,
          enabled: formData.enabled,
          token: formData.token || undefined,
          timeout: parseInt(formData.timeout),
          type: formData.type,
        })
        toast.success(tf('mcp.toast.updated', 'Server configuration updated'))
      } else {
        // Add new server
        await mcpManager.addServer({
          id: formData.id,
          name: formData.name,
          description: formData.description || undefined,
          url: formData.url,
          transport: formData.transport,
          enabled: formData.enabled,
          token: formData.token || undefined,
          timeout: parseInt(formData.timeout),
          type: formData.type,
        })
        toast.success(tf('mcp.toast.added', 'Server added'))
      }

      await loadServers()
      closeForm()
    } catch (error) {
      console.error('[MCPSettings] Failed to save server:', error)
      toast.error(error instanceof Error ? error.message : tf('mcp.toast.saveFailed', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (serverId: string) => {
    if (!confirm(tf('mcp.confirmDelete', 'Are you sure you want to delete this MCP server?'))) {
      return
    }

    try {
      await mcpManager.removeServer(serverId)
      await loadServers()
      toast.success(tf('mcp.toast.deleted', 'Server deleted'))
    } catch (error) {
      console.error('[MCPSettings] Failed to delete server:', error)
      toast.error(tf('mcp.toast.deleteFailed', 'Delete failed'))
    }
  }

  const handleToggleEnabled = async (serverId: string, enabled: boolean) => {
    try {
      await mcpManager.setEnabled(serverId, enabled)
      await loadServers()
    } catch (error) {
      console.error('[MCPSettings] Failed to toggle server:', error)
      toast.error(tf('mcp.toast.updateStatusFailed', 'Failed to update status'))
    }
  }

  // Connection status icon
  const ConnectionIcon = ({ status }: { status?: MCPConnectionState }) => {
    switch (status) {
      case 'connected':
        return <CircleCheck className="h-4 w-4 text-success" />
      case 'connecting':
        return <Loader2 className="h-4 w-4 animate-spin text-muted" />
      case 'error':
        return <CircleX className="h-4 w-4 text-danger" />
      default:
        return <Circle className="h-4 w-4 text-muted" />
    }
  }

  // Server ID validation indicator
  const ServerIdValidation = () => {
    if (!formData.id) return null

    const validation = mcpManager.validateServerId(formData.id)

    if (formData.id === editingServer) {
      // Editing - don't show validation for existing ID
      return null
    }

    if (!validation?.valid) {
      return <p className="text-xs text-danger">{validation.error}</p>
    }

    if (formData.id && servers.some((s) => s.id === formData.id && s.id !== editingServer)) {
      return <p className="text-xs text-danger">{tf('mcp.validation.serverIdExists', 'Server ID already exists')}</p>
    }

    return <p className="text-xs text-success">✓ {tf('mcp.validation.serverIdValid', 'ID format is valid')}</p>
  }

  return (
    <div className="mcp-settings space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{tf('mcp.title', 'MCP Servers')}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{tf('mcp.description', 'Manage external MCP service connections')}</p>
        </div>
        <button
          onClick={loadServers}
          className="text-tertiary flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:text-primary"
          title={tf('common.refresh', 'Refresh')}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Add Server Button */}
      {!showAddForm && (
        <button
          onClick={openAddForm}
          className="hover:border-primary-300 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-secondary transition-colors hover:bg-primary-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        >
          <Plus className="h-4 w-4" />
          {tf('mcp.addServer', 'Add MCP Server')}
        </button>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {editingServer ? tf('mcp.editServer', 'Edit Server') : tf('mcp.addServer', 'Add MCP Server')}
            </h4>
            <button onClick={closeForm} className="text-tertiary hover:text-danger">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Server ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{tf('mcp.form.serverId', 'Server ID')} *</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder={tf('mcp.form.serverIdPlaceholder', 'e.g. excel-analyzer')}
                  className={`w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:text-neutral-100 ${
                    formErrors.id ? 'border-danger' : 'border-gray-200 dark:border-neutral-700'
                  }`}
                  disabled={!!editingServer}
                />
                <ServerIdValidation />
              </div>
              <p className="text-tertiary text-xs">
                {tf('mcp.form.serverIdHint', 'Used for tool calls, e.g. excel-analyzer:analyze_spreadsheet')}
              </p>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{tf('mcp.form.displayName', 'Display Name')} *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={tf('mcp.form.displayNamePlaceholder', 'e.g. Excel Analyzer')}
                className={`w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:text-neutral-100 ${
                    formErrors.name ? 'border-danger' : 'border-gray-200 dark:border-neutral-700'
                }`}
              />
              {formErrors.name && <p className="text-xs text-danger">{formErrors.name}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{tf('mcp.form.description', 'Description')}</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={tf('mcp.form.descriptionPlaceholder', 'Server capability description')}
                className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            {/* URL */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{tf('mcp.form.serverUrl', 'Server URL')} *</label>
              <input
                type="text"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="http://localhost:8080/mcp"
                className={`w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:text-neutral-100 ${
                    formErrors.url ? 'border-danger' : 'border-gray-200 dark:border-neutral-700'
                }`}
              />
              {formErrors.url && <p className="text-xs text-danger">{formErrors.url}</p>}
            </div>

            {/* Transport Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{tf('mcp.form.transportType', 'Transport Type')}</label>
              <select
                value={formData.transport}
                onChange={(e) =>
                  setFormData({ ...formData, transport: e.target.value as TransportType })
                }
                className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              >
                <option value="sse">{transportLabels.sse}</option>
                <option value="streamable_http">
                  {tf('mcp.form.transport.streamableHttpExperimental', 'Streamable HTTP (Experimental)')}
                </option>
              </select>
            </div>

            {/* Token */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{tf('mcp.form.authTokenOptional', 'Auth Token (Optional)')}</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                  placeholder="Bearer token"
                  className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 pr-10 text-sm focus:border-primary-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-tertiary absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Timeout */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{tf('mcp.form.timeoutMs', 'Timeout (ms)')}</label>
              <input
                type="number"
                value={formData.timeout}
                onChange={(e) => setFormData({ ...formData, timeout: e.target.value })}
                min="1000"
                max="300000"
                step="1000"
                className={`w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:text-neutral-100 ${
                  formErrors.timeout ? 'border-danger' : 'border-gray-200 dark:border-neutral-700'
                }`}
              />
              {formErrors.timeout && <p className="text-xs text-danger">{formErrors.timeout}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={closeForm}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-secondary transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:text-neutral-300"
              >
                {tf('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tf('mcp.saving', 'Saving...')}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {editingServer ? tf('mcp.update', 'Update') : tf('mcp.add', 'Add')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server List */}
      {!loading && servers.length === 0 && !showAddForm && (
        <div className="py-8 text-center text-sm text-secondary">
          <Globe className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p>{tf('mcp.empty.title', 'No MCP servers')}</p>
          <p className="text-tertiary text-xs">{tf('mcp.empty.hint', 'Click the button above to add a server')}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className={`group relative rounded-lg border transition-all ${
                !server.enabled
                  ? 'border-gray-100 bg-gray-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/60'
                  : 'hover:border-primary-200 border-gray-200 bg-white hover:bg-primary-50/30 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Status indicator - fixed on left */}
                <div className="flex items-center gap-2">
                  <ConnectionIcon status={server.connectionStatus} />
                  {/* Power toggle - combines status and control */}
                  <button
                    onClick={() => handleToggleEnabled(server.id, !server.enabled)}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                      server.enabled
                        ? 'bg-success/10 text-success hover:bg-success/20'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700'
                    }`}
                    title={server.enabled ? tf('mcp.actions.clickToDisable', 'Click to disable') : tf('mcp.actions.clickToEnable', 'Click to enable')}
                  >
                    <Power
                      className="h-3.5 w-3.5"
                      fill={server.enabled ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`truncate text-sm font-medium ${!server.enabled ? 'text-tertiary' : 'text-primary'}`}
                    >
                      {server.name}
                    </h4>
                    {server.type === 'builtin' && (
                      <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        {tf('mcp.badge.builtin', 'Builtin')}
                      </span>
                    )}
                    {!server.enabled && (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-neutral-700 dark:text-neutral-300">
                        {tf('mcp.badge.disabled', 'Disabled')}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-0.5">
                    {server.description && (
                      <p
                        className={`text-xs ${!server.enabled ? 'text-tertiary' : 'text-secondary'}`}
                      >
                        {server.description}
                      </p>
                    )}
                    <p className="text-tertiary break-all font-mono text-xs">{server.url}</p>

                    {/* Connection details */}
                    <div className="text-tertiary flex items-center gap-3 text-xs">
                      <span>{transportLabels[server.transport as TransportType]}</span>
                      {server.tools && server.tools.length > 0 && (
                        <span>• {tf('mcp.toolsCount', '{count} tool(s)', { count: server.tools.length })}</span>
                      )}
                      {server.error && <span className="text-danger">• {server.error}</span>}
                    </div>
                  </div>
                </div>

                {/* Actions - shown on hover */}
                <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {/* Edit */}
                  <button
                    onClick={() => openEditForm(server)}
                    className="text-tertiary flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-gray-100 hover:text-primary dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                    title={tf('mcp.actions.editConfig', 'Edit configuration')}
                  >
                    <Edit className="h-4 w-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="text-tertiary flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-danger/10 hover:text-danger"
                    title={tf('mcp.actions.deleteServer', 'Delete server')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Connection status hint bar */}
              {server.connectionStatus === 'error' && server.error && (
                <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-md bg-danger/10 px-2 py-1">
                  <CircleX className="h-3 w-3 text-danger" />
                  <span className="text-xs text-danger">{server.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
