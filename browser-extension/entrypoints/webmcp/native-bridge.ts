// ============================================================
// WebMCP native bridge — long-lived connectNative port that keeps
// the cw-native-host "webmcp_bridge" daemon alive, and routes its
// relayed requests to the existing WebMCP discovery/invoke stack.
//
// Why a separate module: background.ts is already ~2.1k lines. The
// bridge has its own lifecycle (MV3 SW restarts, port keepalive,
// crash-reconnect) that deserves isolation + unit tests.
//
// Message flow (see native-host/src/actions/webmcp_bridge.rs):
//   host → ext : { type: 'webmcp_bridge_ready', port, pid, binaryPath }
//   host → ext : { type: 'webmcp_bridge_request', reqId, kind, tool?, args? }
//   ext  → host: { type: 'webmcp_bridge_response', reqId, ok, tools?|result?, error? }
//   ext  → host: { type: 'webmcp_bridge_ping' } (keepalive)
//
// Security model (matches the rest of WebMCP):
//   - The bridge is OPT-IN: it only starts when the user enables it in the
//     popup (storage.local key below). Default off.
//   - Loopback only; no token (per product decision 2026-08-21).
//   - Per-host / per-group authorization is enforced in invokeWebMCPTool
//     and at discovery time (disabled sites do not exist for Codex either).
// ============================================================

import type { WebMCPDiscoveredTool } from './types'

const NATIVE_HOST_NAME = 'com.creatorweave.nativehost'
export const BRIDGE_ENABLED_STORAGE_KEY = 'webmcp_bridge_enabled'

/** Keepalive cadence — well under Chrome's 5-minute idle port GC. */
const KEEPALIVE_INTERVAL_MS = 60_000
/** Backoff after a crash/disconnect before we try connectNative again. */
const RECONNECT_BACKOFF_MS = 5_000

interface BridgeStatus {
  running: boolean
  port?: number
  pid?: number
  binaryPath?: string
  lastError?: string
}

type StatusListener = (status: BridgeStatus) => void

class WebMCPNativeBridge {
  private port: chrome.runtime.Port | null = null
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private status: BridgeStatus = { running: false }
  private listeners = new Set<StatusListener>()
  /** Injected for tests. */
  private deps: {
    invokeTool: (request: { fullToolName: string; args?: Record<string, unknown> }) => Promise<{ ok: boolean; error?: string; errorCode?: string; result?: unknown }>
    listTools: () => Promise<WebMCPDiscoveredTool[]>
  }

  constructor(deps: WebMCPNativeBridgeDeps) {
    this.deps = deps
  }

  getStatus(): BridgeStatus {
    return { ...this.status }
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener)
    listener(this.getStatus())
    return () => this.listeners.delete(listener)
  }

  private setStatus(patch: Partial<BridgeStatus>): void {
    this.status = { ...this.status, ...patch }
    for (const listener of this.listeners) {
      try {
        listener(this.getStatus())
      } catch {
        // listener errors must not break the bridge loop
      }
    }
  }

  /** Start the daemon (idempotent). Returns the ready status or throws. */
  async start(): Promise<BridgeStatus> {
    if (this.port) return this.getStatus()

    const enabled = await this.isEnabled()
    if (!enabled) {
      throw new Error('WebMCP bridge is disabled — enable it in the EO2Weave popup first')
    }

    return new Promise<BridgeStatus>((resolve, reject) => {
      let settled = false
      let port: chrome.runtime.Port
      try {
        port = chrome.runtime.connectNative(NATIVE_HOST_NAME)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      this.port = port

      const fail = (error: string) => {
        if (settled) return
        settled = true
        this.cleanupPort()
        this.setStatus({ running: false, lastError: error })
        reject(new Error(error))
      }

      // Startup timeout: connectNative succeeds even when the host binary
      // is missing (error arrives as port disconnect).
      const startupTimer = setTimeout(() => {
        fail(`Native host did not send webmcp_bridge_ready within 10s`)
      }, 10_000)

      port.onMessage.addListener((message: any) => {
        if (!message || typeof message !== 'object') return
        switch (message.type) {
          case 'webmcp_bridge_ready':
            if (settled) return
            settled = true
            clearTimeout(startupTimer)
            this.setStatus({
              running: true,
              port: typeof message.port === 'number' ? message.port : undefined,
              pid: typeof message.pid === 'number' ? message.pid : undefined,
              binaryPath: typeof message.binaryPath === 'string' ? message.binaryPath : undefined,
              lastError: undefined,
            })
            this.startKeepalive()
            resolve(this.getStatus())
            break
          case 'webmcp_bridge_error':
            fail(String(message.error || 'native webmcp_bridge failed'))
            break
          case 'webmcp_bridge_request':
            void this.handleRequest(message)
            break
          case 'webmcp_bridge_pong':
            break // keepalive echo — nothing to do
          default:
            break
        }
      })

      port.onDisconnect.addListener(() => {
        clearTimeout(startupTimer)
        const lastError = chrome.runtime.lastError?.message
        this.cleanupPort()
        const wasRunning = this.status.running
        this.setStatus({ running: false, port: undefined, pid: undefined, lastError: lastError || undefined })
        if (!settled) {
          settled = true
          reject(new Error(lastError || 'Native host disconnected before becoming ready'))
          return
        }
        // Auto-reconnect only if the user still wants the bridge and the
        // daemon had actually come up once (crash recovery, not error loop).
        if (wasRunning) {
          void this.scheduleReconnect()
        }
      })

      // Kick off the daemon AFTER listeners are attached: main.rs dispatches
      // on the FIRST NM message — without this handshake the host blocks in
      // read_message and never reaches the webmcp_bridge branch (root cause
      // of "toggle won't turn on").
      try {
        port.postMessage({ action: 'webmcp_bridge', stream: true })
      } catch (error) {
        fail(`failed to send webmcp_bridge start: ${String(error)}`)
        return
      }
    })
  }

  stop(): void {
    this.clearReconnect()
    if (this.port) {
      this.cleanupPort()
      this.setStatus({ running: false, port: undefined, pid: undefined })
    }
  }

  private async scheduleReconnect(): Promise<void> {
    const enabled = await this.isEnabled()
    if (!enabled) return
    this.clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.start().catch(() => {
        // start() already recorded the error; retry on next popup action
        // or keepalive cycle. Avoid tight loops: only retry if enabled.
        void this.scheduleReconnect()
      })
    }, RECONNECT_BACKOFF_MS)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive()
    this.keepaliveTimer = setInterval(() => {
      if (!this.port) {
        this.stopKeepalive()
        return
      }
      try {
        this.port.postMessage({ type: 'webmcp_bridge_ping' })
      } catch {
        // Port died — onDisconnect will handle reconnection.
        this.stopKeepalive()
      }
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  private cleanupPort(): void {
    this.stopKeepalive()
    if (this.port) {
      try {
        this.port.disconnect()
      } catch {
        // already disconnected
      }
      this.port = null
    }
    // NOTE: relayed requests are answered inline in handleRequest — the
    // Rust side owns per-request timeouts (socket read timeout 70s), so
    // there is no pending map to fail here.
  }

  private postResponse(payload: Record<string, unknown>): boolean {
    if (!this.port) return false
    try {
      this.port.postMessage(payload)
      return true
    } catch {
      return false
    }
  }

  /** Handle one relayed request from the daemon (list / call). */
  private async handleRequest(message: {
    reqId?: unknown
    kind?: unknown
    tool?: unknown
    args?: unknown
  }): Promise<void> {
    const reqId = typeof message.reqId === 'string' ? message.reqId : ''
    if (!reqId) return
    const kind = typeof message.kind === 'string' ? message.kind : ''

    if (kind === 'list') {
      try {
        const tools = await this.deps.listTools()
        this.postResponse({
          type: 'webmcp_bridge_response',
          reqId,
          ok: true,
          tools: tools.map((tool) => ({
            name: tool.fullName,
            description: tool.description || tool.name,
            inputSchema: tool.inputSchema,
          })),
        })
      } catch (error: any) {
        this.postResponse({
          type: 'webmcp_bridge_response',
          reqId,
          ok: false,
          error: String(error?.message || error),
        })
      }
      return
    }

    if (kind === 'call') {
      const fullToolName = typeof message.tool === 'string' ? message.tool : ''
      const args =
        message.args && typeof message.args === 'object' && !Array.isArray(message.args)
          ? (message.args as Record<string, unknown>)
          : {}
      try {
        const response = await this.deps.invokeTool({ fullToolName, args })
        if (response.ok) {
          this.postResponse({
            type: 'webmcp_bridge_response',
            reqId,
            ok: true,
            result: response.result ?? null,
          })
        } else {
          this.postResponse({
            type: 'webmcp_bridge_response',
            reqId,
            ok: false,
            error: response.error || response.errorCode || 'tool call failed',
            errorCode: response.errorCode,
          })
        }
      } catch (error: any) {
        this.postResponse({
          type: 'webmcp_bridge_response',
          reqId,
          ok: false,
          error: String(error?.message || error),
        })
      }
      return
    }

    this.postResponse({
      type: 'webmcp_bridge_response',
      reqId,
      ok: false,
      error: `unknown bridge request kind: ${kind || '(empty)'}`,
    })
  }

  async isEnabled(): Promise<boolean> {
    try {
      const stored = await chrome.storage.local.get(BRIDGE_ENABLED_STORAGE_KEY)
      return stored[BRIDGE_ENABLED_STORAGE_KEY] === true
    } catch {
      return false
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await chrome.storage.local.set({ [BRIDGE_ENABLED_STORAGE_KEY]: enabled })
    if (enabled) {
      await this.start().catch(() => {
        // error recorded in status; popup surfaces it
      })
    } else {
      this.stop()
    }
  }

  /** Called from background startup: resume the daemon if it was enabled. */
  async resumeIfEnabled(): Promise<void> {
    if (await this.isEnabled()) {
      await this.start().catch(() => {})
    }
  }
}

/** Injectable dependency surface (keeps the class unit-testable). */
export interface WebMCPNativeBridgeDeps {
  invokeTool: (request: {
    fullToolName: string
    args?: Record<string, unknown>
  }) => Promise<{ ok: boolean; error?: string; errorCode?: string; result?: unknown }>
  listTools: () => Promise<WebMCPDiscoveredTool[]>
}

export type { WebMCPNativeBridge }

// ── singleton wiring (background only) ──

let bridgeInstance: WebMCPNativeBridge | null = null

export function getWebMCPNativeBridge(deps: WebMCPNativeBridgeDeps): WebMCPNativeBridge {
  if (!bridgeInstance) {
    bridgeInstance = new WebMCPNativeBridge(deps)
  }
  return bridgeInstance
}

export function resetWebMCPNativeBridgeForTests(): void {
  bridgeInstance?.stop()
  bridgeInstance = null
}
