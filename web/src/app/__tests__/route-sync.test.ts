import { describe, expect, it } from 'vitest'
import { shouldApplyRouteWorkspaceToConversation } from '../route-sync'

describe('shouldApplyRouteWorkspaceToConversation', () => {
  it('should not roll back to stale route workspace while switching to another workspace', () => {
    const shouldApply = shouldApplyRouteWorkspaceToConversation({
      routeWorkspaceId: 'ws-old',
      activeConversationId: 'ws-new',
      switchingWorkspaceId: 'ws-new',
    })

    expect(shouldApply).toBe(false)
  })

  it('should apply route workspace when no switch is in progress', () => {
    const shouldApply = shouldApplyRouteWorkspaceToConversation({
      routeWorkspaceId: 'ws-a',
      activeConversationId: 'ws-b',
      switchingWorkspaceId: null,
    })

    expect(shouldApply).toBe(true)
  })

  it('should not apply when route already matches active conversation', () => {
    const shouldApply = shouldApplyRouteWorkspaceToConversation({
      routeWorkspaceId: 'ws-a',
      activeConversationId: 'ws-a',
      switchingWorkspaceId: null,
    })

    expect(shouldApply).toBe(false)
  })
})
