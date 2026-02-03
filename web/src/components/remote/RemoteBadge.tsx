/**
 * Remote Badge - 顶部导航栏远程控制状态指示器
 *
 * 布局：状态区 | 操作区，中间竖线分隔
 * 7 种状态，信息密度最小化，靠视觉通道传达状态
 */

import React, { useState, useMemo } from 'react'
import { useRemoteStore } from '@/store/remote.store'
import { RemoteControlPanel } from './RemoteControlPanel'
import { QrCode, Lock, LockOpen, Key, RefreshCw, AlertTriangle } from 'lucide-react'

// 加密状态配置
const ENCRYPTION_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; animation?: string }
> = {
  none: {
    icon: <LockOpen className="h-3 w-3" />,
    color: 'text-gray-400',
  },
  generating: {
    icon: <Key className="h-3 w-3" />,
    color: 'text-yellow-400',
    animation: 'animate-pulse',
  },
  exchanging: {
    icon: <RefreshCw className="h-3 w-3" />,
    color: 'text-yellow-400',
    animation: 'animate-spin',
  },
  ready: {
    icon: <Lock className="h-3 w-3" />,
    color: 'text-green-500',
  },
  error: {
    icon: <AlertTriangle className="h-3 w-3" />,
    color: 'text-red-500',
  },
}

export const RemoteBadge: React.FC = () => {
  const [panelOpen, setPanelOpen] = useState(false)
  const {
    connectionState,
    role,
    encryptionState,
    peerCount,
    error,
    encryptionError,
    closeSession,
    clearError,
  } = useRemoteStore()

  const isActive = role !== 'none'
  const hasError = error || encryptionError

  // 连接状态对应的圆点颜色
  const connectionDotColor = useMemo(() => {
    if (!isActive) return 'bg-gray-400'
    if (connectionState === 'disconnected') return 'bg-gray-400'
    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      return 'bg-yellow-400'
    }
    // Host: 有 peer 才算真正连接
    if (role === 'host') {
      return peerCount > 1 ? 'bg-green-400' : 'bg-yellow-400'
    }
    // Remote: 连接到 relay 就算 ready
    return 'bg-green-400'
  }, [isActive, connectionState, role, peerCount])

  // 是否已连接（用于显示 QR 按钮）
  const isConnected = connectionState === 'connected'

  // ========================================
  // Inactive 视图 (role === 'none')
  // ========================================
  if (!isActive) {
    return (
      <>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          title="打开远程控制"
        >
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          <span>Remote</span>
        </button>
        <RemoteControlPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      </>
    )
  }

  // ========================================
  // Active 视图 (role !== 'none')
  // ========================================
  const encryptionConfig = ENCRYPTION_CONFIG[encryptionState] || ENCRYPTION_CONFIG.none

  return (
    <>
      <div className="flex items-center rounded-md border px-3 py-1.5 text-sm">
        {/* ==================== 状态区 ==================== */}
        <div className="flex items-center gap-2 pr-3">
          {/* 1. 连接圆点 */}
          <span className={`h-2 w-2 rounded-full ${connectionDotColor}`} />

          {/* 2. 加密图标 */}
          <span className={encryptionConfig.animation}>
            <span className={encryptionConfig.color}>{encryptionConfig.icon}</span>
          </span>

          {/* 3. 角色徽章 */}
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
            {role === 'host' ? 'HOST' : 'REMOTE'}
          </span>
        </div>

        {/* ==================== 分隔线 ==================== */}
        <div className="mx-1 h-4 w-px bg-border" />

        {/* ==================== 操作区 ==================== */}
        <div className="flex items-center gap-2 pl-3">
          {/* Error 状态：显示错误文字 + 分隔线 + Disconnect */}
          {hasError ? (
            <>
              <button
                onClick={clearError}
                className="max-w-[120px] truncate text-xs text-red-500 hover:underline"
                title={error || encryptionError || undefined}
              >
                {error || encryptionError}
              </button>
              <div className="h-4 w-px bg-border" />
              <button
                onClick={closeSession}
                className="text-xs text-red-500 transition-colors hover:bg-destructive/10"
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              {/* QR 按钮 (连接时显示) */}
              {isConnected && (
                <button
                  onClick={() => setPanelOpen(true)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="显示二维码"
                >
                  <QrCode className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Disconnect 按钮 */}
              <button
                onClick={closeSession}
                className="text-xs text-red-500 transition-colors hover:bg-destructive/10 hover:text-red-600"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {/* RemoteControlPanel 对话框 */}
      <RemoteControlPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  )
}
