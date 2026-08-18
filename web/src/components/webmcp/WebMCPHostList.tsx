import { Globe, Layers3 } from 'lucide-react'
import type { WebMCPHostCatalog, WebMCPToolGroupCatalog } from '@/webmcp'

interface WebMCPHostListProps {
  t: (key: string) => string
  hosts: WebMCPHostCatalog[]
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
 * Read-only list of discovered (authorized) WebMCP tools.
 *
 * The extension filters unauthorized tools out of discovery responses, so
 * everything rendered here is usable by the agent right now. Authorization
 * management (per-site / per-group switches) lives exclusively in the
 * extension popup — this component renders state, it never mutates it.
 */
export function WebMCPHostList({ t, hosts }: WebMCPHostListProps) {
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
        const totalTools = host.groups.reduce((sum, group) => sum + group.registeredTools.length, 0)
        const totalTabs = host.groups.reduce((sum, group) => sum + group.tabs.length, 0)
        return (
          <div
            key={host.hostname}
            className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800"
          >
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

            <div className="mt-3 space-y-2">
              {host.groups.map((group) => (
                <div
                  key={group.groupKey}
                  className="rounded-lg border border-neutral-200 bg-muted/40 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/40"
                >
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
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
