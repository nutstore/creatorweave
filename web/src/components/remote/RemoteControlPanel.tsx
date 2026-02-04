/**
 * Remote Control Panel - Dialog for creating session and showing QR code.
 *
 * Auto-closes when remote peer connects AFTER panel is opened.
 * Phase 5: Refactored to use brand components
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Copy, X } from 'lucide-react'
import { useRemoteStore } from '@/store/remote.store'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogBody,
  BrandDialogFooter,
  BrandDialogClose,
  BrandInput,
  BrandButton,
} from '@browser-fs-analyzer/ui'
import { useT } from '@/i18n'

interface RemoteControlPanelProps {
  open: boolean
  onClose: () => void
}

export const RemoteControlPanel: React.FC<RemoteControlPanelProps> = ({ open, onClose }) => {
  const t = useT()
  const [relayUrl, setRelayUrl] = useState(useRemoteStore.getState().relayUrl)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    connectionState,
    role,
    sessionId,
    peerCount,
    createSession,
    setRelayUrl: storeSetRelayUrl,
    closeSession,
  } = useRemoteStore()

  const isActive = role !== 'none'
  const hasSession = isActive && sessionId

  // Track remote connection state when panel opens
  const remoteConnectedWhenOpenedRef = useRef(false)

  // Reset tracking when panel opens
  useEffect(() => {
    if (open) {
      console.log('[RemoteControlPanel] Panel opened, peerCount:', peerCount)
      remoteConnectedWhenOpenedRef.current = peerCount > 1
    }
  }, [open, peerCount])

  // Auto-close when remote connects AFTER panel is opened
  useEffect(() => {
    if (
      open &&
      role === 'host' &&
      !remoteConnectedWhenOpenedRef.current &&
      peerCount > 1 &&
      connectionState === 'connected'
    ) {
      console.log('[RemoteControlPanel] Remote connected after panel opened, closing...')
      onClose()
    }
  }, [role, peerCount, connectionState, open, onClose])

  const handleCreate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      storeSetRelayUrl(relayUrl)
      await createSession()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }, [relayUrl, createSession, storeSetRelayUrl])

  const handleCopySessionId = useCallback(async () => {
    if (sessionId) {
      try {
        await navigator.clipboard.writeText(sessionId)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Ignore clipboard errors
      }
    }
  }, [sessionId])

  const handleDisconnect = useCallback(() => {
    closeSession()
    onClose()
  }, [closeSession, onClose])

  // Generate join URL for QR code
  const joinUrl = hasSession
    ? relayUrl.replace('ws://', 'http://').replace('wss://', 'https://') + `/join/${sessionId}`
    : null

  const mobileUrl = hasSession ? `${window.location.origin}/?session=${sessionId}` : null

  return (
    <BrandDialog open={open} onOpenChange={onClose} modal={false}>
      <BrandDialogContent
        className="!w-[480px]"
        onPointerDownOutside={(e) => {
          if (isActive) e.preventDefault()
        }}
      >
        <BrandDialogHeader>
          <h2 className="text-base font-semibold">{t('remote.title')}</h2>
          <BrandDialogClose className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </BrandDialogClose>
        </BrandDialogHeader>

        <BrandDialogBody className="gap-4">
          {/* Relay URL */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">
              {t('remote.relayServer')}
            </label>
            <BrandInput
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              placeholder="ws://localhost:3001"
              disabled={isActive}
            />
          </div>

          {/* QR Code display */}
          {hasSession ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-600">
                {t('remote.scanToConnect')}
              </label>
              <p className="mb-2 text-xs text-gray-500">{t('remote.scanHint')}</p>

              {/* QR Code */}
              <div className="flex justify-center rounded-lg border border-gray-200 bg-white p-4">
                <QRCodeCanvas value={joinUrl!} size={200} level="M" includeMargin={false} />
              </div>

              {/* Session ID with copy button */}
              <div className="mt-3 flex items-center justify-center gap-2">
                <code className="font-mono text-sm text-gray-600">{sessionId}</code>
                <BrandButton
                  iconButton
                  variant="default"
                  onClick={handleCopySessionId}
                  className="h-6 w-6"
                  title={copied ? t('remote.copied') : t('remote.copySessionId')}
                >
                  <Copy className="h-3 w-3" />
                </BrandButton>
              </div>

              {/* URLs for reference */}
              <div className="mt-2 space-y-1">
                <a
                  href={joinUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-center text-xs text-primary-600 underline hover:text-primary-700"
                >
                  {joinUrl}
                </a>
                <a
                  href={mobileUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-center text-xs text-gray-400 hover:text-gray-600"
                >
                  {t('remote.direct')}: {mobileUrl}
                </a>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-500">
              {t('remote.clickToCreate')}
            </div>
          )}

          {/* Error display */}
          {error && <p className="text-sm text-danger">{error}</p>}

          {/* Connection status (when active) */}
          {isActive && (
            <div className="flex items-center justify-center gap-2 rounded-md bg-gray-50 px-3 py-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionState === 'connected' ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              />
              <span className="text-sm text-gray-700">
                {connectionState === 'connected' ? t('remote.connected') : t('remote.connecting')}
              </span>
              {peerCount > 0 && (
                <span className="text-xs text-gray-500">
                  ({t('remote.peers', { count: peerCount })})
                </span>
              )}
            </div>
          )}
        </BrandDialogBody>

        <BrandDialogFooter>
          {isActive ? (
            <BrandButton variant="outline" onClick={handleDisconnect}>
              {t('remote.disconnect')}
            </BrandButton>
          ) : (
            <>
              <BrandButton variant="outline" onClick={onClose} disabled={loading}>
                {t('remote.cancel')}
              </BrandButton>
              <BrandButton onClick={handleCreate} disabled={loading}>
                {loading ? t('remote.connecting') : t('remote.createSession')}
              </BrandButton>
            </>
          )}
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  )
}
