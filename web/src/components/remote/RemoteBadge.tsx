/**
 * Remote Badge - Remote control status indicator in top navigation bar
 *
 * Layout: Status area | Action area, separated by vertical line
 * 7 states, minimal information density, visual channel for status
 * Phase 4: Added i18n support
 * Phase 5: Architecture refactoring - extracted hooks for better testability
 */

import React, { useState } from 'react'
import { useRemoteStore } from '@/store/remote.store'
import { RemoteControlPanel } from './RemoteControlPanel'
import { QrCode } from 'lucide-react'
import { useT } from '@/i18n'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { useEncryptionConfig } from '@/hooks/useEncryptionConfig'

// Test IDs for E2E testing
const TEST_IDS = {
  badge: 'remote-badge',
  inactive: 'remote-badge-inactive',
  active: 'remote-badge-active',
  connectionDot: 'remote-badge-connection-dot',
  encryptionIcon: 'remote-badge-encryption-icon',
  roleBadge: 'remote-badge-role',
  qrButton: 'remote-badge-qr-button',
  errorText: 'remote-badge-error',
  disconnectButton: 'remote-badge-disconnect',
} as const

export const RemoteBadge: React.FC = () => {
  const [panelOpen, setPanelOpen] = useState(false)
  const { role, error, encryptionError, peerCount, closeSession, clearError } = useRemoteStore()
  const t = useT()

  // Use extracted hooks
  const { connectionDotColor, isConnected } = useConnectionStatus()
  const encryptionConfig = useEncryptionConfig()

  const isActive = role !== 'none'
  const hasError = error || encryptionError

  // ========================================
  // Inactive view (role === 'none')
  // ========================================
  if (!isActive) {
    return (
      <>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          title={t('remote.title')}
          data-testid={TEST_IDS.inactive}
        >
          <span
            className={`h-2 w-2 rounded-full ${connectionDotColor}`}
            data-testid={TEST_IDS.connectionDot}
          />
          <span>{t('remote.label')}</span>
        </button>
        <RemoteControlPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      </>
    )
  }

  // ========================================
  // Active view (role !== 'none')
  // ========================================
  return (
    <>
      <div
        className="flex items-center rounded-md border px-3 py-1.5 text-xs"
        data-testid={TEST_IDS.active}
      >
        {/* ==================== Status area ==================== */}
        <div className="flex items-center gap-2 pr-3">
          {/* 1. Connection dot */}
          <span
            className={`h-2 w-2 rounded-full ${connectionDotColor}`}
            data-testid={TEST_IDS.connectionDot}
          />

          {/* 2. Encryption icon */}
          <span className={encryptionConfig.animation} data-testid={TEST_IDS.encryptionIcon}>
            <span className={encryptionConfig.color}>{encryptionConfig.icon}</span>
          </span>

          {/* 3. Remote peer count (only show when there are remote devices) */}
          {peerCount > 1 && (
            <span className="text-xs text-muted-foreground">
              {t('remote.peers', { count: peerCount - 1 })}
            </span>
          )}
        </div>

        {/* ==================== Separator ==================== */}
        <div className="mx-1 h-4 w-px bg-border" />

        {/* ==================== Action area ==================== */}
        <div className="flex items-center gap-2 pl-3">
          {/* Error state: show error text + separator + Disconnect */}
          {hasError ? (
            <>
              <button
                onClick={clearError}
                className="max-w-[120px] truncate text-xs text-red-500 hover:underline"
                title={error || encryptionError || undefined}
                data-testid={TEST_IDS.errorText}
              >
                {error || encryptionError}
              </button>
              <div className="h-4 w-px bg-border" />
              <button
                onClick={closeSession}
                className="text-xs text-red-500 transition-colors hover:bg-destructive/10"
                data-testid={TEST_IDS.disconnectButton}
              >
                {t('remote.disconnect')}
              </button>
            </>
          ) : (
            <>
              {/* QR button (shown when connected) */}
              {isConnected && (
                <button
                  onClick={() => setPanelOpen(true)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={t('remote.showQrCode')}
                  data-testid={TEST_IDS.qrButton}
                >
                  <QrCode className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Disconnect button */}
              <button
                onClick={closeSession}
                className="text-xs text-red-500 transition-colors hover:bg-destructive/10 hover:text-red-600"
                data-testid={TEST_IDS.disconnectButton}
              >
                {t('remote.disconnect')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* RemoteControlPanel dialog */}
      <RemoteControlPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  )
}
