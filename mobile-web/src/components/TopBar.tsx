/**
 * TopBar - 顶部状态栏组件
 * 显示连接状态、加密状态、返回按钮和操作按钮
 * Phase 5: Added i18n support
 */

import { ArrowLeft, Lock, Unlock, RefreshCw, AlertTriangle } from 'lucide-react'
import { useRemoteStore } from '../store/remote.store'
import { useT } from '../i18n'

export interface TopBarAction {
  icon: React.ElementType
  onClick: () => void
  title?: string
  show?: boolean
}

export interface TopBarProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  actions?: TopBarAction[]
}

export function TopBar({ title, showBack, onBack, actions = [] }: TopBarProps) {
  const { connectionState, encryptionState } = useRemoteStore()
  const t = useT()

  const getStatusDot = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-400 animate-pulse'
      default:
        return 'bg-gray-400'
    }
  }

  const getEncryptionIcon = () => {
    switch (encryptionState) {
      case 'ready':
        return <Lock className="h-5 w-5 text-green-400" />
      case 'exchanging':
        return <RefreshCw className="h-5 w-5 text-yellow-400 animate-spin" />
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-400" />
      default:
        return <Unlock className="h-5 w-5 text-gray-400" />
    }
  }

  return (
    <header className="h-14 flex-shrink-0 bg-white border-b border-neutral-200 flex items-center justify-between px-4 safe-top">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-neutral-100 active:scale-95 transition-transform"
            aria-label={t('mobile.back')}
          >
            <ArrowLeft className="h-5 w-5 text-neutral-600" />
          </button>
        )}
        <h1 className="text-base font-semibold text-neutral-800 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {/* 连接状态圆点 */}
        <span
          className={`h-2 w-2 rounded-full ${getStatusDot()}`}
          aria-label={`${t('mobile.settings.status')}: ${connectionState}`}
        />
        {/* 加密状态图标 */}
        <span aria-label={`${t('mobile.settings.encryption')}: ${encryptionState}`}>
          {getEncryptionIcon()}
        </span>
        {/* 操作按钮 */}
        {actions
          .filter((a) => a.show !== false)
          .map((action, i) => {
            const Icon = action.icon
            return (
              <button
                key={i}
                onClick={action.onClick}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-neutral-100 active:scale-95"
                title={action.title}
                aria-label={action.title}
              >
                <Icon className="h-5 w-5 text-neutral-600" />
              </button>
            )
          })}
      </div>
    </header>
  )
}
