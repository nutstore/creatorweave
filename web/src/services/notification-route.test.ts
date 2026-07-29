import { describe, expect, it } from 'vitest'

import { buildConversationNotificationUrl } from './notification-route'

describe('buildConversationNotificationUrl', () => {
  it('uses the plural workspace route with encoded route parameters', () => {
    expect(buildConversationNotificationUrl('project / 1', 'conversation / 2')).toBe(
      '/#/projects/project%20%2F%201/workspaces/conversation%20%2F%202'
    )
  })
})
