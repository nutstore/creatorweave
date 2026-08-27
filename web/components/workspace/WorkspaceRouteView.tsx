'use client'

import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useProjectStore } from '@/store/project.store'
import { useConversationStore } from '@/store/conversation.store'
import { useWorkspaceRouteSync } from '@/hooks/useWorkspaceRouteSync'
import { projectWorkspacePath, projectsPath, newDraftPath } from '@/lib/route-paths'

/**
 * WorkspaceRouteView — the real view for all three workspace URL shapes:
 *
 *   /projects/:projectId                       (bare)
 *   /projects/:projectId/workspace             (legacy singular — HTTP 308 → bare)
 *   /projects/:projectId/workspaces/:workspaceId  (canonical)
 *
 * Each page file is a thin client shell that dynamically loads this view
 * (browser-only module graph: monaco via WorkspaceLayout etc.). Next owns
 * URL matching; this component only syncs URL params → stores (ported from
 * the legacy WorkspaceRoute.syncFromRoute) and renders WorkspaceLayout.
 *
 * React 18 note: next/navigation's useParams() returns params synchronously
 * (no Promise unwrapping needed — React.use() is React-19-only and must not
 * be used here).
 */
export default function WorkspaceRouteView() {
  const router = useRouter()
  const params = useParams<{ projectId: string; workspaceId?: string }>()
  const isNewDraft = useSearchParams().get('new') === '1'

  // Next's App Router already decodes URI components in route params.
  const projectId = params.projectId ?? ''
  const workspaceId = params.workspaceId ?? undefined

  useWorkspaceRouteSync(projectId, workspaceId)

  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeConversationTitle = useConversationStore((s) => {
    const { activeConversationId, conversations } = s
    if (!activeConversationId) return undefined
    return conversations.find((c) => c.id === activeConversationId)?.title
  })

  const activeProject = projects.find((project) => project.id === activeProjectId)

  return (
    <WorkspaceLayout
      onBackToProjects={() => router.replace(projectsPath())}
      projectName={activeProject?.name}
      conversationName={activeConversationTitle}
      onSwitchProject={async (targetProjectId: string) => {
        router.push(projectWorkspacePath(targetProjectId))
      }}
      onCreateProject={() => router.push(projectsPath())}
      onManageProjects={() => router.push(projectsPath())}
      onSelectWorkspace={(wsId: string) => {
        router.push(projectWorkspacePath(projectId, wsId))
      }}
      onDraftConversationCreated={(wsId: string) => {
        // First message sent from the draft (WelcomeScreen on bare URL):
        // replace, not push, so the draft state leaves no history entry.
        router.replace(projectWorkspacePath(projectId, wsId))
      }}
      onNewDraft={() => {
        // "New conversation": enter draft state (bare URL + ?new=1, no
        // conversation created until the first message is sent). No-op if
        // already in draft.
        if (params.workspaceId) {
          router.replace(projectWorkspacePath(projectId))
        } else if (!isNewDraft) {
          router.replace(newDraftPath(projectId))
        }
      }}
    />
  )
}
