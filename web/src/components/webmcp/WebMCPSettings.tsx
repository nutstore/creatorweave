import { useMemo, useState } from 'react'
import { Globe, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { BrandButton, BrandSwitch } from '@creatorweave/ui'
import { useT } from '@/i18n'
import { useWebMCPStore } from '@/webmcp'
import { applyWebMCPHostToggle, isWebMCPBridgeAvailable, refreshWebMCPTools } from '@/webmcp'

export function WebMCPSettings() {
  const t = useT()
  const catalogByHost = useWebMCPStore((state) => state.catalogByHost)
  const enabledByHost = useWebMCPStore((state) => state.enabledByHost)
  const lastScanAt = useWebMCPStore((state) => state.lastScanAt)
  const [refreshing, setRefreshing] = useState(false)
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

  const handleToggleHost = async (hostname: string, enabled: boolean) => {
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

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
        <div>
          <p className="text-sm font-medium text-secondary dark:text-neutral-200">
            {bridgeAvailable ? t('settings.webMCPConnected') : t('settings.webMCPDisconnected')}
          </p>
          <p className="mt-0.5 text-xs text-tertiary">
            {lastScanAt
              ? t('settings.webMCPLastScan').replace('{time}', formatTime(lastScanAt))
              : t('settings.webMCPNeverScanned')}
          </p>
        </div>
        <BrandButton
          variant="outline"
          className="h-8 gap-2 text-xs"
          onClick={handleRefresh}
          disabled={refreshing || !bridgeAvailable}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {t('settings.webMCPRefresh')}
        </BrandButton>
      </div>

      {hosts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-tertiary dark:border-neutral-700">
          {t('settings.webMCPNoHosts')}
        </div>
      ) : (
        <div className="space-y-2">
          {hosts.map((host) => {
            const checked = enabledByHost[host.hostname] !== false
            return (
              <div
                key={host.hostname}
                className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary-600" />
                      <p className="truncate font-mono text-sm text-secondary dark:text-neutral-200">
                        {host.hostname}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-tertiary">
                      {t('settings.webMCPHostSummary')
                        .replace('{tools}', String(host.tools.length))
                        .replace('{tabs}', String(host.tabs.length))}
                    </p>
                  </div>
                  <BrandSwitch
                    checked={checked}
                    disabled={togglingHost === host.hostname}
                    onCheckedChange={(value) => handleToggleHost(host.hostname, value)}
                  />
                </div>

                <div className="mt-2 rounded bg-muted px-2 py-1.5 text-[11px] text-tertiary dark:bg-neutral-900/40">
                  {host.tools
                    .slice(0, 5)
                    .map((tool) => tool.fullName)
                    .join(' · ')}
                  {host.tools.length > 5 ? ` +${host.tools.length - 5}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

