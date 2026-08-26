/** Build the in-app route used when opening an agent completion notification. */
export function buildConversationNotificationRoute(projectId: string, conversationId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(conversationId)}`
}

/** Build the canonical pathname URL used by Service Worker `clients.openWindow`. */
export function buildConversationNotificationUrl(projectId: string, conversationId: string): string {
  return buildConversationNotificationRoute(projectId, conversationId)
}
