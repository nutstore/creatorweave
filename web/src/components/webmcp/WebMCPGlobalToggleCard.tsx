import { RefreshCw } from 'lucide-react'
import { BrandButton, BrandSwitch } from '@creatorweave/ui'

interface WebMCPGlobalToggleCardProps {
  t: (key: string) => string
  globalEnabled: boolean
  togglingGlobal: boolean
  bridgeAvailable: boolean
  lastScanAt: number | null
  refreshing: boolean
  onToggleGlobal: (enabled: boolean) => void
  onRefresh: () => void
  formatTime: (timestamp: number) => string
}

export function WebMCPGlobalToggleCard({
  t,
  globalEnabled,
  togglingGlobal,
  bridgeAvailable,
  lastScanAt,
  refreshing,
  onToggleGlobal,
  onRefresh,
  formatTime,
}: WebMCPGlobalToggleCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-secondary dark:text-neutral-200">
            {t('settings.webMCPGlobalToggle')}
          </p>
          <p className="mt-1 text-xs text-tertiary">
            {t('settings.webMCPGlobalToggleDesc')}
          </p>
        </div>
        <BrandSwitch
          checked={globalEnabled}
          disabled={togglingGlobal}
          onCheckedChange={onToggleGlobal}
        />
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-neutral-200 bg-muted p-2.5 dark:border-neutral-700 dark:bg-neutral-900/40">
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
          onClick={onRefresh}
          disabled={togglingGlobal || refreshing || !bridgeAvailable || !globalEnabled}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {t('settings.webMCPRefresh')}
        </BrandButton>
      </div>
    </div>
  )
}
