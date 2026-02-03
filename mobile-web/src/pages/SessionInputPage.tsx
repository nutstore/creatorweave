/**
 * SessionInputPage - Session ID 输入页面
 * 用于手动输入会话 ID 加入会话
 * Phase 5: Added i18n support
 */

import { useState, useCallback, useEffect } from 'react'
import { Key, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRemoteStore } from '../store/remote.store'
import { useConnection } from '../contexts/ConnectionContext'
import { useT } from '../i18n'

// UUID validation regex (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function SessionInputPage() {
  const navigate = useNavigate()
  const [sessionInput, setSessionInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const t = useT()

  // 从 store 获取连接状态
  const {
    connectionState,
    error,
    reconnectAttempt,
    reconnectMaxAttempts,
  } = useRemoteStore()

  // 从 Context 获取连接方法
  const { joinSession, cancelConnection } = useConnection()

  // 连接成功后跳转到 /chats
  useEffect(() => {
    if (connectionState === 'connected') {
      navigate('/chats', { replace: true })
    }
  }, [connectionState, navigate])

  const handleCancel = () => {
    cancelConnection()
  }

  // Validate UUID format
  const isValidUUID = useCallback((id: string): boolean => {
    return UUID_REGEX.test(id)
  }, [])

  const handleJoinSession = () => {
    const trimmed = sessionInput.trim()
    if (!trimmed) {
      setInputError(t('mobile.sessionInput.errorRequired'))
      return
    }
    if (!isValidUUID(trimmed)) {
      setInputError(t('mobile.sessionInput.errorInvalidFormat'))
      return
    }
    setInputError(null)
    joinSession(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJoinSession()
    }
  }

  // 显示取消按钮：连接中或重连中状态
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting'
  const isReconnecting = connectionState === 'reconnecting'
  const showCancelButton = isConnecting
  const showProgress = isReconnecting && reconnectAttempt > 0

  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-50 p-4">
      <div className="bg-white rounded-2xl p-6 shadow-lg w-full max-w-md">
        {/* Logo/Icon */}
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Key className="w-8 h-8 text-primary-600" />
        </div>

        <h2 className="text-xl font-semibold text-neutral-800 text-center mb-2">{t('mobile.sessionInput.title')}</h2>
        <p className="text-sm text-neutral-500 text-center mb-6">
          {t('mobile.sessionInput.subtitle')}
        </p>

        {/* Session ID Input */}
        <div className="mb-4">
          <input
            type="text"
            value={sessionInput}
            onChange={(e) => {
              setSessionInput(e.target.value)
              setInputError(null)
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('mobile.sessionInput.placeholder')}
            disabled={connectionState === 'connecting' || connectionState === 'reconnecting'}
            className={`w-full px-4 py-3 rounded-xl border text-center font-mono text-sm tracking-wider
              ${inputError ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-neutral-50'}
              focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-50`}
            aria-label={t('mobile.sessionInput.inputLabel')}
          />
        </div>

        {/* Error Message */}
        {(inputError || error) && (
          <div className="mb-4 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs flex items-start gap-2">
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{inputError || error}</span>
          </div>
        )}

        {/* Reconnecting Progress */}
        {showProgress && (
          <div className="mb-4 bg-neutral-100 px-3 py-2 rounded-lg text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-neutral-600">{t('mobile.sessionInput.reconnecting')}</span>
              <span className="text-neutral-400">
                {Math.min(reconnectAttempt, reconnectMaxAttempts)} / {reconnectMaxAttempts}
              </span>
            </div>
            <div className="w-full bg-neutral-200 rounded-full h-1.5">
              <div
                className="bg-primary-500 h-1.5 rounded-full transition-all"
                style={{
                  width: `${(Math.min(reconnectAttempt, reconnectMaxAttempts) / reconnectMaxAttempts) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Helper Text */}
        <p className="text-xs text-neutral-400 text-center mb-4">
          {t('mobile.sessionInput.formatHint')}
        </p>

        {/* Buttons Row */}
        <div className="flex gap-2">
          {/* Join Button */}
          <button
            onClick={handleJoinSession}
            disabled={!sessionInput.trim() || connectionState === 'connecting' || connectionState === 'reconnecting'}
            className={`flex-1 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
              !sessionInput.trim() || connectionState === 'connecting' || connectionState === 'reconnecting'
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {connectionState === 'connecting' || connectionState === 'reconnecting' ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {t('mobile.sessionInput.connecting')}
              </>
            ) : (
              t('mobile.sessionInput.joinSession')
            )}
          </button>

          {/* Cancel Button - 连接中或重连中显示 */}
          {showCancelButton && (
            <button
              onClick={handleCancel}
              className="px-4 py-3 rounded-xl font-medium bg-neutral-200 text-neutral-600 hover:bg-neutral-300 transition-colors flex items-center justify-center"
              aria-label={t('mobile.sessionInput.cancel')}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scan QR Hint */}
        <div className="mt-6 pt-4 border-t border-neutral-100">
          <p className="text-xs text-neutral-400 text-center flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0h.01M12 12v4M8 20H4m12-4h2M4 16h2"
              />
            </svg>
            {t('mobile.sessionInput.qrHint')}
          </p>
        </div>
      </div>
    </div>
  )
}
