import type { WebMCPBridge } from './types'

export function getWebMCPBridge(): WebMCPBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as unknown as { __agentWeb?: Partial<WebMCPBridge> }).__agentWeb
  if (!bridge?.ready) return null
  if (typeof bridge.webMCPDiscover !== 'function') return null
  if (typeof bridge.webMCPInvoke !== 'function') return null
  if (typeof bridge.webMCPPluginDownloadStream !== 'function') return null
  if (typeof bridge.webMCPPluginDownloadFinalize !== 'function') return null
  return bridge as WebMCPBridge
}

export function isWebMCPBridgeAvailable(): boolean {
  return getWebMCPBridge() !== null
}
