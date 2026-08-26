import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/i18n'
import {
  isWebMCPBridgeAvailable,
  refreshWebMCPCatalog,
  useWebMCPStore,
} from '@/webmcp'
import { useSettingsStore } from '@/store/settings.store'
import { useExtensionStore } from '@/store/extension.store'
import { WebMCPGlobalToggleCard } from './WebMCPGlobalToggleCard'
import { WebMCPHostList } from './WebMCPHostList'

/**
 * WebMCP settings — connection status + read-only tool list.
 *
 * The list shows discovered (authorized) WebMCP tools: the extension
 * filters unauthorized tools out of discovery responses, so whatever
 * renders here is usable by the agent right now. Authorization
 * management lives exclusively in the extension popup; this page never
 * mutates authorization state.
 */
export function WebMCPSettings() {
  const t = useT()
  const catalogByHost = useWebMCPStore((state) => state.catalogByHost)
  const lastScanAt = useWebMCPStore((state) => state.lastScanAt)
  const globalEnabled = useSettingsStore((state) => state.enableWebMCP)
  const extensionStatus = useExtensionStore((state) => state.status)
  const extensionInstalled = extensionStatus === 'installed'
  const [refreshing, setRefreshing] = useState(false)

  const bridgeAvailable = isWebMCPBridgeAvailable()

  const hosts = useMemo(
    () =>
      Object.values(catalogByHost).sort((a, b) =>
        a.hostname.localeCompare(b.hostname)
      ),
    [catalogByHost]
  )

  const handleRefresh = async () => {
    if (!bridgeAvailable) {
      toast.error(t('settings.webMCPBridgeUnavailable'))
      return
    }

    setRefreshing(true)
    try {
      const tools = await refreshWebMCPCatalog()
      const count = tools.length
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

  const handleInstallExtension = () => {
    useExtensionStore.getState().openInstallGuide()
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
      <WebMCPGlobalToggleCard
        t={t}
        globalEnabled={globalEnabled}
        togglingGlobal={false}
        bridgeAvailable={bridgeAvailable}
        extensionInstalled={extensionInstalled}
        lastScanAt={lastScanAt}
        refreshing={refreshing}
        onToggleGlobal={undefined}
        onRefresh={handleRefresh}
        onInstallExtension={handleInstallExtension}
        formatTime={formatTime}
      />

      {globalEnabled && <WebMCPHostList t={t} hosts={hosts} />}
    </div>
  )
}
