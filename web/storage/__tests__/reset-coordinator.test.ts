import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginReset,
  endReset,
  forceClearResetState,
  isResetInProgress,
  waitForIdle,
  __test__,
} from '../reset-coordinator'

describe('reset-coordinator', () => {
  beforeEach(() => {
    __test__.resetForTests()
  })

  it('tracks reset in progress across begin/end', () => {
    expect(isResetInProgress()).toBe(false)

    const { token } = beginReset()
    expect(isResetInProgress()).toBe(true)

    endReset(token)
    expect(isResetInProgress()).toBe(false)
  })

  it('waits until reset becomes idle', async () => {
    const { token } = beginReset()

    const pending = waitForIdle(200)

    setTimeout(() => {
      endReset(token)
    }, 0)

    await expect(pending).resolves.toBeUndefined()
  })

  it('prunes stale remote reset tokens to avoid permanent blocking', () => {
    __test__.setRemoteTokenForTests('remote-stale', Date.now() - 120_000)

    expect(isResetInProgress()).toBe(false)
  })

  it('prunes stale local reset token to avoid permanent blocking', () => {
    __test__.setLocalTokenForTests('local-stale', Date.now() - 120_000)

    expect(isResetInProgress()).toBe(false)
  })

  it('force clears reset state immediately', () => {
    const { token } = beginReset()
    __test__.setRemoteTokenForTests('remote-live', Date.now())
    expect(isResetInProgress()).toBe(true)

    forceClearResetState()

    expect(isResetInProgress()).toBe(false)
    endReset(token)
  })
})
