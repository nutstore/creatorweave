interface RouteWorkspaceSyncInput {
  routeWorkspaceId: string
  activeConversationId: string | null
  switchingWorkspaceId: string | null
}

/**
 * Decide whether route-driven workspace sync should force conversation activation.
 *
 * When user clicks another workspace, `activeConversationId` can change before URL/state
 * converge. If route still points to the previous workspace while a switch is in-flight,
 * applying the stale route would roll back the user's selection.
 */
export function shouldApplyRouteWorkspaceToConversation(input: RouteWorkspaceSyncInput): boolean {
  const { routeWorkspaceId, activeConversationId, switchingWorkspaceId } = input

  if (!routeWorkspaceId) return false
  if (activeConversationId === routeWorkspaceId) return false

  // Route is stale while switching to another workspace: skip forcing rollback.
  if (switchingWorkspaceId && switchingWorkspaceId !== routeWorkspaceId) {
    return false
  }

  return true
}
