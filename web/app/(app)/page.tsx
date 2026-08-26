'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/store/project.store'
import { projectWorkspacePath, projectsPath } from '@/lib/route-paths'

/**
 * Root page (`/`). The legacy client router's catch-all redirected `/` to
 * `/projects`; this page reproduces that plus the first-run auto-redirect
 * into the auto-created default project (previously in AppReady).
 */
export default function RootPage() {
  const router = useRouter()
  const initialized = useProjectStore((s) => s.initialized)
  const projects = useProjectStore((s) => s.projects)

  // Auto-navigate to default project for first-time users ──────────
  // When a brand-new user's default project was auto-created during init,
  // redirect them into it immediately instead of landing on the empty
  // ProjectHome list. Uses a session-level flag so it only fires once
  // per browser session (avoids hijacking navigation for returning users).
  //
  // An empty project list with initialized=true is a transitional state
  // (e.g. re-init after clear-local-data): the legacy AppReady only ever
  // ran this logic against fully-loaded data, so we return and wait for the
  // effect to re-run when the list arrives — never act on the empty list.
  useEffect(() => {
    if (!initialized) return
    if (projects.length === 0) return
    const JUST_REDIRECTED_KEY = 'creatorweave:auto-default-redirected'
    if (sessionStorage.getItem(JUST_REDIRECTED_KEY)) {
      // First-run redirect already happened this session (or user is a
      // returning user) — fall through to the default projects redirect.
      router.replace(projectsPath())
      return
    }
    const autoCreated = localStorage.getItem('creatorweave:auto-default-project-created')
    if (!autoCreated) {
      router.replace(projectsPath())
      return
    }
    if (projects.length !== 1) {
      router.replace(projectsPath())
      return
    }
    const targetProject = projects[0]
    if (!targetProject) {
      router.replace(projectsPath())
      return
    }
    sessionStorage.setItem(JUST_REDIRECTED_KEY, '1')
    router.replace(projectWorkspacePath(targetProject.id))
  }, [initialized, projects, router])

  return null
}
