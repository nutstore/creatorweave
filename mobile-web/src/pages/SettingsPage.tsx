/**
 * SettingsPage - 设置页面
 * 显示连接状态、会话管理、关于信息
 * Phase 5: Added i18n support
 */

import { useNavigate } from 'react-router-dom'
import { Lock, Trash2, Info, LogOut } from 'lucide-react'
import { useRemoteStore } from '../store/remote.store'
import { useConversationStore } from '../store/conversation.store'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useT } from '../i18n'

export function SettingsPage() {
  const navigate = useNavigate()
  const { connectionState, encryptionState, sessionId, hostRootName } = useRemoteStore()
  const { clear: clearConversations } = useConversationStore()
  const t = useT()

  const handleDisconnect = () => {
    // 断开连接 - 逻辑在 App.tsx 中处理
    navigate('/input')
  }

  const handleClearData = () => {
    if (confirm(t('mobile.settings.clearDataConfirm'))) {
      clearConversations()
    }
  }

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return t('mobile.settings.statusConnected')
      case 'connecting':
      case 'reconnecting':
        return t('mobile.settings.statusConnecting')
      default:
        return t('mobile.settings.statusDisconnected')
    }
  }

  const getEncryptionText = () => {
    switch (encryptionState) {
      case 'ready':
        return t('mobile.settings.encryptionReady')
      case 'exchanging':
        return t('mobile.settings.encryptionExchanging')
      case 'error':
        return t('mobile.settings.encryptionError')
      default:
        return t('mobile.settings.encryptionNone')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* 连接状态 */}
        <section className="bg-white rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-600 mb-3">{t('mobile.settings.connectionStatus')}</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">{t('mobile.settings.status')}</span>
              <span className="text-sm font-medium">{getStatusText()}</span>
            </div>
            {hostRootName && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600 flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  {t('mobile.settings.directory')}
                </span>
                <span className="text-sm font-mono text-neutral-800 truncate max-w-[200px]">
                  {hostRootName}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600 flex items-center gap-1">
                <Lock className="h-4 w-4" />
                {t('mobile.settings.encryption')}
              </span>
              <span className="text-sm">{getEncryptionText()}</span>
            </div>
            {sessionId && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">{t('mobile.settings.sessionId')}</span>
                <span className="text-xs font-mono text-neutral-400 truncate max-w-[150px]">
                  {sessionId.slice(0, 8)}...
                </span>
              </div>
            )}
          </div>
        </section>

        {/* 语言设置 */}
        <section className="bg-white rounded-xl p-4">
          <LanguageSwitcher />
        </section>

        {/* 会话管理 */}
        <section className="bg-white rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-600 mb-3">{t('mobile.settings.sessionManagement')}</h2>
          <button
            onClick={handleClearData}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <span className="text-sm flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-neutral-400" />
              {t('mobile.settings.clearLocalData')}
            </span>
          </button>
        </section>

        {/* 关于 */}
        <section className="bg-white rounded-xl p-4">
          <h2 className="text-sm font-medium text-neutral-600 mb-3">{t('mobile.settings.about')}</h2>
          <p className="text-sm text-neutral-500">CreatorWeave Remote v1.0.0</p>
        </section>

        {/* 断开连接 */}
        {connectionState === 'connected' && (
          <button
            onClick={handleDisconnect}
            className="w-full py-3 text-red-600 font-medium bg-white rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            {t('mobile.settings.disconnect')}
          </button>
        )}
      </div>
    </div>
  )
}
