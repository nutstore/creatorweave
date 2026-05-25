import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/i18n'
import { useWebMCPStore } from '@/webmcp'
import {
  applyWebMCPGlobalToggle,
  applyWebMCPHostToggle,
  isWebMCPBridgeAvailable,
  refreshWebMCPTools,
} from '@/webmcp'
import { useSettingsStore } from '@/store/settings.store'
import { WebMCPGlobalToggleCard } from './WebMCPGlobalToggleCard'
import { WebMCPHostList } from './WebMCPHostList'
import { WebMCPSetupGuideCard } from './WebMCPSetupGuideCard'

export function WebMCPSettings() {
  const t = useT()
  const catalogByHost = useWebMCPStore((state) => state.catalogByHost)
  const enabledByHost = useWebMCPStore((state) => state.enabledByHost)
  const lastScanAt = useWebMCPStore((state) => state.lastScanAt)
  const globalEnabled = useSettingsStore((state) => state.enableWebMCP)
  const [refreshing, setRefreshing] = useState(false)
  const [togglingGlobal, setTogglingGlobal] = useState(false)
  const [togglingHost, setTogglingHost] = useState<string | null>(null)

  const bridgeAvailable = isWebMCPBridgeAvailable()

  const hosts = useMemo(
    () =>
      Object.values(catalogByHost).sort((a, b) =>
        a.hostname.localeCompare(b.hostname)
      ),
    [catalogByHost]
  )

  const handleRefresh = async () => {
    if (!globalEnabled) {
      toast.error(t('settings.webMCPDisabled'))
      return
    }
    if (!bridgeAvailable) {
      toast.error(t('settings.webMCPBridgeUnavailable'))
      return
    }

    setRefreshing(true)
    try {
      const count = await refreshWebMCPTools()
      toast.success(
        t('settings.webMCPRefreshSuccess').replace('{count}', String(count))
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(t('settings.webMCPRefreshFailed') + `: ${message}`)
    } finally {
      setRefreshing(false)
    }
  }

  const handleToggleGlobal = async (enabled: boolean) => {
    setTogglingGlobal(true)
    try {
      const count = await applyWebMCPGlobalToggle(enabled)
      if (enabled) {
        toast.success(
          t('settings.webMCPRefreshSuccess').replace('{count}', String(count))
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(t('settings.webMCPToggleFailed') + `: ${message}`)
    } finally {
      setTogglingGlobal(false)
    }
  }

  const handleToggleHost = async (hostname: string, enabled: boolean) => {
    if (!globalEnabled) return
    setTogglingHost(hostname)
    try {
      await applyWebMCPHostToggle(hostname, enabled)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(t('settings.webMCPToggleFailed') + `: ${message}`)
    } finally {
      setTogglingHost(null)
    }
  }

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="space-y-4 py-1">
      <p className="text-xs text-tertiary">{t('settings.webMCPDescription')}</p>

      <WebMCPGlobalToggleCard
        t={t}
        globalEnabled={globalEnabled}
        togglingGlobal={togglingGlobal}
        bridgeAvailable={bridgeAvailable}
        lastScanAt={lastScanAt}
        refreshing={refreshing}
        onToggleGlobal={handleToggleGlobal}
        onRefresh={handleRefresh}
        formatTime={formatTime}
      />

      <WebMCPSetupGuideCard t={t} />

      <WebMCPHostList
        t={t}
        hosts={hosts}
        enabledByHost={enabledByHost}
        togglingHost={togglingHost}
        globalEnabled={globalEnabled && !togglingGlobal}
        onToggleHost={handleToggleHost}
      />
    </div>
  )
}
