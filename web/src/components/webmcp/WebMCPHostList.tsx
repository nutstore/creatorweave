import { Globe, Layers3, ShieldCheck, ShieldOff } from 'lucide-react'
import type { WebMCPHostCatalog, WebMCPToolGroupCatalog } from '@/webmcp'

interface WebMCPHostListProps {
  t: (key: string) => string
  hosts: WebMCPHostCatalog[]
  enabledByHost: Record<string, boolean>
  enabledByGroup: Record<string, boolean>
}

function summarizeTabs(group: WebMCPToolGroupCatalog): string {
  return group.tabs
    .slice(0, 2)
    .map((tab) => {
      if (tab.title.trim()) return tab.title.trim()
      try {
        return new URL(tab.url).pathname || tab.url
      } catch {
        return tab.url
      }
    })
    .join(' · ')
}

/**
 * Read-only authorization badge.
 * The switches live ONLY in the extension popup — the extension-side store
 * (chrome.storage.local) is the single source of truth and the background
 * invoke gate enforces it. The web app renders the mirrored state and
 * points users to the popup for management.
 */
function AuthBadge({ t, enabled }: { t: (key: string) => string; enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex flex-none items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
      <ShieldCheck className="h-3 w-3" />
      {t('settings.webMCPAuthAllowed')}
    </span>
  ) : (
    <span className="inline-flex flex-none items-center gap-1 rounded-full border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
      <ShieldOff className="h-3 w-3" />
      {t('settings.webMCPAuthBlocked')}
    </span>
  )
}

export function WebMCPHostList({
  t,
  hosts,
  enabledByHost,
  enabledByGroup,
}: WebMCPHostListProps) {
  if (hosts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-tertiary dark:border-neutral-700">
        {t('settings.webMCPNoHosts')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-700 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
        {t('settings.webMCPManageInExtension')}
      </div>
      {hosts.map((host) => {
        const hostAllowed = enabledByHost[host.hostname] !== false
        const totalTools = host.groups.reduce((sum, group) => sum + group.registeredTools.length, 0)
        const totalTabs = host.groups.reduce((sum, group) => sum + group.tabs.length, 0)
        return (
          <div
            key={host.hostname}
            className={
              'rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800' +
              (hostAllowed ? '' : ' opacity-60')
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary-600" />
                  <p className="truncate font-mono text-sm text-secondary dark:text-foreground">
                    {host.hostname}
                  </p>
                </div>
                <p className="mt-1 text-xs text-tertiary">
                  {t('settings.webMCPHostSummary')
                    .replace('{groups}', String(host.groups.length))
                    .replace('{tools}', String(totalTools))
                    .replace('{tabs}', String(totalTabs))}
                </p>
              </div>
              <AuthBadge t={t} enabled={hostAllowed} />
            </div>

            <div className="mt-3 space-y-2">
              {host.groups.map((group) => {
                const groupAllowed = hostAllowed && enabledByGroup[group.groupKey] !== false
                return (
                  <div
                    key={group.groupKey}
                    className={
                      'rounded-lg border border-neutral-200 bg-muted/40 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/40' +
                      (groupAllowed ? '' : ' opacity-60')
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Layers3 className="mt-0.5 h-4 w-4 text-primary-600" />
                          <p className="truncate text-sm font-medium text-secondary">
                            {group.displayName}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-tertiary">
                          {t('settings.webMCPGroupSummary')
                            .replace('{tools}', String(group.registeredTools.length))
                            .replace('{tabs}', String(group.tabs.length))}
                        </p>
                      </div>
                      <AuthBadge t={t} enabled={groupAllowed} />
                    </div>

                    <div className="mt-2 rounded bg-white/80 px-2 py-1.5 text-[11px] text-tertiary dark:bg-neutral-950/40">
                      {group.registeredTools
                        .slice(0, 5)
                        .map((tool) => tool.name)
                        .join(' · ')}
                      {group.registeredTools.length > 5 ? ` +${group.registeredTools.length - 5}` : ''}
                    </div>

                    {group.tabs.length > 0 && (
                      <div className="mt-2 text-[11px] text-tertiary">
                        {t('settings.webMCPTabPreview').replace('{tabs}', summarizeTabs(group))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
