import { Globe } from 'lucide-react'
import { BrandSwitch } from '@creatorweave/ui'
import type { WebMCPHostCatalog } from '@/webmcp'

interface WebMCPHostListProps {
  t: (key: string) => string
  hosts: WebMCPHostCatalog[]
  enabledByHost: Record<string, boolean>
  togglingHost: string | null
  globalEnabled: boolean
  onToggleHost: (hostname: string, enabled: boolean) => void
}

export function WebMCPHostList({
  t,
  hosts,
  enabledByHost,
  togglingHost,
  globalEnabled,
  onToggleHost,
}: WebMCPHostListProps) {
  if (hosts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-tertiary dark:border-neutral-700">
        {t('settings.webMCPNoHosts')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {!globalEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {t('settings.webMCPHostControlsDisabled')}
        </div>
      )}
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
                disabled={!globalEnabled || togglingHost === host.hostname}
                onCheckedChange={(value) => onToggleHost(host.hostname, value)}
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
  )
}
