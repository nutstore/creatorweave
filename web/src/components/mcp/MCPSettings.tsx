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

type TransportType = 'sse' | 'streamable_http'

const TRANSPORT_LABELS: Record<TransportType, string> = {
  sse: 'SSE (Server-Sent Events)',
  streamable_http: 'Streamable HTTP',
}

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
      toast.error('加载 MCP 服务器失败')
    } finally {
      setLoading(false)
    }
  }, [mcpManager])

  const refreshConnectionStatuses = useCallback(() => {
    setServers((prev) =>
      prev.map((server) => {
        const status = mcpManager.getConnectionStatus(server.id)
        return {
          ...server,
          connectionStatus: status?.state || 'disconnected',
          tools: status?.tools?.map((t) => t.name) || [],
          error: status?.error,
        }
      })
    )
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
  }, [servers, refreshConnectionStatuses])

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
      errors.id = validation.error || 'Invalid server ID'
    }

    // Validate required fields
    if (!formData.name.trim()) {
      errors.name = '请输入服务器名称'
    }
    if (!formData.url.trim()) {
      errors.url = '请输入服务器 URL'
    } else {
      try {
        new URL(formData.url)
      } catch {
        errors.url = '请输入有效的 URL'
      }
    }

    // Validate timeout
    const timeout = parseInt(formData.timeout)
    if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
      errors.timeout = '超时时间应在 1000-300000ms 之间'
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
        toast.success('服务器配置已更新')
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
        toast.success('服务器已添加')
      }

      await loadServers()
      closeForm()
    } catch (error) {
      console.error('[MCPSettings] Failed to save server:', error)
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (serverId: string) => {
    if (!confirm('确定要删除此 MCP 服务器吗？')) {
      return
    }

    try {
      await mcpManager.removeServer(serverId)
      await loadServers()
      toast.success('服务器已删除')
    } catch (error) {
      console.error('[MCPSettings] Failed to delete server:', error)
      toast.error('删除失败')
    }
  }

  const handleToggleEnabled = async (serverId: string, enabled: boolean) => {
    try {
      await mcpManager.setEnabled(serverId, enabled)
      await loadServers()
    } catch (error) {
      console.error('[MCPSettings] Failed to toggle server:', error)
      toast.error('更新状态失败')
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
      return <p className="text-xs text-danger">服务器 ID 已存在</p>
    }

    return <p className="text-xs text-success">✓ ID 格式正确</p>
  }

  return (
    <div className="mcp-settings space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">MCP 服务器</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">管理外部 MCP 服务连接</p>
        </div>
        <button
          onClick={loadServers}
          className="text-tertiary flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:text-primary"
          title="刷新"
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
          添加 MCP 服务器
        </button>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {editingServer ? '编辑服务器' : '添加服务器'}
            </h4>
            <button onClick={closeForm} className="text-tertiary hover:text-danger">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Server ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">服务器 ID *</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="如: excel-analyzer"
                  className={`w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:text-neutral-100 ${
                    formErrors.id ? 'border-danger' : 'border-gray-200 dark:border-neutral-700'
                  }`}
                  disabled={!!editingServer}
                />
                <ServerIdValidation />
              </div>
              <p className="text-tertiary text-xs">
                用于工具调用，如: excel-analyzer:analyze_spreadsheet
              </p>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">显示名称 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="如: Excel 文档分析器"
                className={`w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:text-neutral-100 ${
                    formErrors.name ? 'border-danger' : 'border-gray-200 dark:border-neutral-700'
                }`}
              />
              {formErrors.name && <p className="text-xs text-danger">{formErrors.name}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">描述</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="服务器功能描述"
                className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            {/* URL */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">服务器 URL *</label>
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
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">传输类型</label>
              <select
                value={formData.transport}
                onChange={(e) =>
                  setFormData({ ...formData, transport: e.target.value as TransportType })
                }
                className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              >
                <option value="sse">SSE (Server-Sent Events)</option>
                <option value="streamable_http">Streamable HTTP (实验性)</option>
              </select>
            </div>

            {/* Token */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">认证 Token（可选）</label>
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
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">超时时间 (ms)</label>
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
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {editingServer ? '更新' : '添加'}
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
          <p>暂无 MCP 服务器</p>
          <p className="text-tertiary text-xs">点击上方按钮添加服务器</p>
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
                {/* 状态指示灯 - 左侧固定 */}
                <div className="flex items-center gap-2">
                  <ConnectionIcon status={server.connectionStatus} />
                  {/* 电源开关按钮 - 状态和控制一体 */}
                  <button
                    onClick={() => handleToggleEnabled(server.id, !server.enabled)}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                      server.enabled
                        ? 'bg-success/10 text-success hover:bg-success/20'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700'
                    }`}
                    title={server.enabled ? '点击禁用' : '点击启用'}
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
                        内置
                      </span>
                    )}
                    {!server.enabled && (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-neutral-700 dark:text-neutral-300">
                        已禁用
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
                      <span>{TRANSPORT_LABELS[server.transport as TransportType]}</span>
                      {server.tools && server.tools.length > 0 && (
                        <span>• {server.tools.length} 个工具</span>
                      )}
                      {server.error && <span className="text-danger">• {server.error}</span>}
                    </div>
                  </div>
                </div>

                {/* Actions - hover 时显示 */}
                <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {/* Edit */}
                  <button
                    onClick={() => openEditForm(server)}
                    className="text-tertiary flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-gray-100 hover:text-primary dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                    title="编辑配置"
                  >
                    <Edit className="h-4 w-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="text-tertiary flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-danger/10 hover:text-danger"
                    title="删除服务器"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 连接状态提示条 */}
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
