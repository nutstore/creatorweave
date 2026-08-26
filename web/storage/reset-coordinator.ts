const RESET_CONTROL_CHANNEL = 'storage-reset-control'
const RESET_STALE_TIMEOUT_MS = 60_000

type ResetControlMessage = {
  type: 'begin' | 'end'
  sourceId: string
  token: string
  timestamp: number
}

const localSourceId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `reset-source-${Date.now()}-${Math.random().toString(36).slice(2)}`

let localResetToken: string | null = null
let localResetStartedAt: number | null = null
const remoteResetTokens = new Map<string, number>()
const listeners = new Set<() => void>()

let controlChannel: BroadcastChannel | null = null

function emitStateChange() {
  listeners.forEach((listener) => listener())
}

function pruneStaleResetTokens(now = Date.now()): boolean {
  let changed = false

  if (
    localResetToken !== null &&
    localResetStartedAt !== null &&
    now - localResetStartedAt > RESET_STALE_TIMEOUT_MS
  ) {
    console.warn(
      `[ResetCoordinator] Clearing stale local reset token after ${RESET_STALE_TIMEOUT_MS}ms timeout`
    )
    localResetToken = null
    localResetStartedAt = null
    changed = true
  }

  for (const [token, startedAt] of remoteResetTokens.entries()) {
    if (now - startedAt > RESET_STALE_TIMEOUT_MS) {
      remoteResetTokens.delete(token)
      changed = true
    }
  }

  return changed
}

function ensureControlChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null
  }

  if (controlChannel) {
    return controlChannel
  }

  controlChannel = new BroadcastChannel(RESET_CONTROL_CHANNEL)
  controlChannel.onmessage = (event: MessageEvent<ResetControlMessage>) => {
    const data = event.data
    if (!data || data.sourceId === localSourceId) {
      return
    }

    if (data.type === 'begin') {
      remoteResetTokens.set(data.token, data.timestamp || Date.now())
      emitStateChange()
      return
    }

    remoteResetTokens.delete(data.token)
    emitStateChange()
  }

  return controlChannel
}

export function broadcastResetState(kind: 'begin' | 'end', token: string): void {
  const channel = ensureControlChannel()
  if (!channel) {
    return
  }

  const message: ResetControlMessage = {
    type: kind,
    sourceId: localSourceId,
    token,
    timestamp: Date.now(),
  }
  channel.postMessage(message)
}

export function beginReset(): { token: string } {
  if (pruneStaleResetTokens()) {
    emitStateChange()
  }

  if (localResetToken) {
    return { token: localResetToken }
  }

  const token = `${localSourceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  localResetToken = token
  localResetStartedAt = Date.now()
  ensureControlChannel()
  broadcastResetState('begin', token)
  emitStateChange()
  return { token }
}

export function endReset(token: string): void {
  if (!localResetToken || localResetToken !== token) {
    return
  }

  localResetToken = null
  localResetStartedAt = null
  broadcastResetState('end', token)
  emitStateChange()
}

export function forceClearResetState(): void {
  const localToken = localResetToken
  localResetToken = null
  localResetStartedAt = null
  remoteResetTokens.clear()

  if (localToken) {
    broadcastResetState('end', localToken)
  }
  emitStateChange()
}

export function isResetInProgress(): boolean {
  if (pruneStaleResetTokens()) {
    emitStateChange()
  }

  return localResetToken !== null || remoteResetTokens.size > 0
}

export async function waitForIdle(timeoutMs = 5000): Promise<void> {
  if (!isResetInProgress()) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const startedAt = Date.now()

    const checkDone = () => {
      if (!isResetInProgress()) {
        listeners.delete(checkDone)
        resolve()
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        listeners.delete(checkDone)
        reject(new Error(`Timed out waiting for reset idle after ${timeoutMs}ms`))
      }
    }

    listeners.add(checkDone)
    checkDone()
  })
}

export const __test__ = {
  resetForTests() {
    localResetToken = null
    localResetStartedAt = null
    remoteResetTokens.clear()
    listeners.clear()
    if (controlChannel) {
      controlChannel.close()
      controlChannel = null
    }
  },
  setRemoteTokenForTests(token: string, startedAt: number) {
    remoteResetTokens.set(token, startedAt)
  },
  setLocalTokenForTests(token: string, startedAt: number) {
    localResetToken = token
    localResetStartedAt = startedAt
  },
}
