import { isWebMCPBridgeAvailable } from './bridge-client'
import { refreshWebMCPTools, unregisterAllWebMCPTools } from './manager'
import { useSettingsStore } from '@/store/settings.store'

const DEFAULT_SYNC_INTERVAL_MS = 15000

export function startWebMCPSyncLoop(intervalMs = DEFAULT_SYNC_INTERVAL_MS): () => void {
  let stopped = false
  let timer: number | null = null

  const sync = async (force: boolean) => {
    if (stopped) return
    if (!useSettingsStore.getState().enableWebMCP) return
    if (!isWebMCPBridgeAvailable()) return

    try {
      await refreshWebMCPTools()
    } catch (error) {
      if (force) {
        console.warn('[WebMCP] Initial sync failed:', error)
      }
    }
  }

  void sync(true)
  timer = window.setInterval(() => {
    void sync(false)
  }, intervalMs)

  let previousEnabled = useSettingsStore.getState().enableWebMCP
  const unsubscribeSettings = useSettingsStore.subscribe((state) => {
    if (stopped) return
    if (state.enableWebMCP === previousEnabled) return
    previousEnabled = state.enableWebMCP
    if (!state.enableWebMCP) {
      void unregisterAllWebMCPTools().catch((error) => {
        console.warn('[WebMCP] Failed to unregister tools after global toggle off:', error)
      })
      return
    }
    if (!isWebMCPBridgeAvailable()) return
    void refreshWebMCPTools().catch((error) => {
      console.warn('[WebMCP] Failed to refresh tools after global toggle on:', error)
    })
  })

  return () => {
    stopped = true
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
    unsubscribeSettings()
  }
}
