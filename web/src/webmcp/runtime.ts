import { isWebMCPBridgeAvailable } from './bridge-client'
import { refreshWebMCPTools } from './manager'

const DEFAULT_SYNC_INTERVAL_MS = 15000

export function startWebMCPSyncLoop(intervalMs = DEFAULT_SYNC_INTERVAL_MS): () => void {
  let stopped = false
  let timer: number | null = null

  const sync = async (force: boolean) => {
    if (stopped) return
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

  return () => {
    stopped = true
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

