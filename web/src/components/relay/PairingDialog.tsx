/**
 * PairingDialog - Modal dialog for pairing with mobile device
 */

import { useState, useEffect, useCallback } from 'react'
import { X, Smartphone, Check, Loader2 } from 'lucide-react'
import { getRelayClient } from '@/relay/client'
import type { ConnectionStatus, ChatMessage } from '@/relay/client'

interface PairingDialogProps {
  open: boolean
  onClose: () => void
  onConnected?: () => void
  onMessage?: (msg: ChatMessage) => void
}

export function PairingDialog({ open, onClose, onConnected, onMessage }: PairingDialogProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [pairingCode, setPairingCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const relayClient = getRelayClient()

  // Sync status with relay client
  useEffect(() => {
    if (!open) return

    const updateStatus = () => setStatus(relayClient.Status)
    updateStatus()

    const interval = setInterval(updateStatus, 500)
    return () => clearInterval(interval)
  }, [open, relayClient])

  // Subscribe to messages
  useEffect(() => {
    if (!open || status !== 'connected') return

    const unsubscribe = relayClient.on((msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg])
      onMessage?.(msg)
    })

    return () => {
      unsubscribe()
    }
  }, [open, status, onMessage, relayClient])

  // Approve pairing (enter code manually)
  const handleApprove = useCallback(async () => {
    const code = inputCode.trim().toUpperCase()
    if (code.length !== 6) {
      setError('请输入6位配对码')
      return
    }

    const success = await relayClient.approvePairing(code)
    if (success) {
      setPairingCode('')
      onConnected?.()
    } else {
      setError('配对码无效或已过期')
    }
  }, [inputCode, onConnected, relayClient])

  // Send response to mobile
  const handleSendResponse = useCallback(() => {
    // Get the last mobile message and show input for response
    const lastMobileMsg = messages.filter((m) => m.from === 'mobile').pop()
    if (lastMobileMsg) {
      relayClient.sendToMobile(`[响应]: ${lastMobileMsg.content}`)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          from: 'pc',
          content: `[响应]: ${lastMobileMsg.content}`,
          timestamp: Date.now(),
        },
      ])
    }
  }, [messages, relayClient])

  // Reset state when dialog closes
  const handleClose = useCallback(() => {
    setPairingCode('')
    setInputCode('')
    setError('')
    setMessages([])
    onClose()
  }, [onClose])

  // Status display
  const getStatusDisplay = (): { text: string; color: string } => {
    switch (status) {
      case 'disconnected':
        return { text: '未连接', color: 'bg-gray-500' }
      case 'pairing':
        return { text: '等待配对', color: 'bg-yellow-500' }
      case 'connected':
        return { text: '已连接', color: 'bg-green-500' }
    }
  }

  return (
    <dialog
      open={open}
      onClose={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-800">移动端配对</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600" title="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-6">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${getStatusDisplay().color}`} />
            <span className="text-sm text-gray-600">{getStatusDisplay().text}</span>
          </div>

          {/* Status-specific UI */}
          {status === 'disconnected' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">在移动端生成配对码，然后在此输入进行配对</p>
              <div>
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="输入6位配对码"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-center font-mono text-xl tracking-widest focus:border-primary-500 focus:outline-none"
                  maxLength={6}
                />
                {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
              </div>
              <button
                onClick={handleApprove}
                disabled={inputCode.length !== 6}
                className="w-full rounded-lg bg-primary-600 py-2.5 font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                连接
              </button>
            </div>
          )}

          {status === 'pairing' && pairingCode && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-gray-600">配对码</p>
              <div className="rounded-lg bg-gray-100 p-4">
                <code className="font-mono text-3xl tracking-widest text-gray-800">
                  {pairingCode}
                </code>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>等待移动端连接...</span>
              </div>
            </div>
          )}

          {status === 'connected' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                <span>连接成功！</span>
              </div>

              {/* Chat interface */}
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                <div className="max-h-48 space-y-2 overflow-y-auto p-3">
                  {messages.length === 0 ? (
                    <p className="text-center text-sm text-gray-400">等待移动端消息...</p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`text-sm ${
                          msg.from === 'mobile' ? 'text-gray-800' : 'text-primary-600'
                        }`}
                      >
                        <span className="mr-2 text-xs text-gray-400">
                          {msg.from === 'mobile' ? '移动端' : 'PC'}
                        </span>
                        {msg.content}
                      </div>
                    ))
                  )}
                </div>

                {/* Send response button */}
                {messages.some((m) => m.from === 'mobile') && (
                  <div className="border-t border-gray-100 p-3">
                    <button
                      onClick={handleSendResponse}
                      className="w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                    >
                      发送响应到移动端
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  )
}
