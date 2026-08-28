'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { registerServiceWorker } from '@/pwa/register-service-worker'
import { RootErrorBoundary } from '@/components/error/RootErrorBoundary'
import { APP_BUILD_ID, IS_DEVELOPMENT } from '@/app-build'
// Side effect import is deliberately eager: the module synchronously captures
// side-panel launch query parameters before child route effects can redirect
// `/` to `/projects`. A useEffect import is too late under the App Router.
import '@/agent/workspace-assistant-context'

// The whole app is browser-only (OPFS, web workers, monaco-editor...). Load it
// via dynamic(ssr:false) so the server/prerender pass never evaluates the
// client module graph, and additionally gate on `mounted` — `ssr:false` alone
// is not enough: Next can still invoke the load function during prerendering,
// which would crash the build with "window is not defined" from monaco's
// module scope (see the original shell/ClientAppShell.tsx notes).
const AppBootstrap = dynamic(() => import('@/components/AppBootstrap'), {
  ssr: false,
  loading: () => null,
})

/**
 * (app) route-group layout — client-only shell for every storage-gated page.
 *
 * Owns: service-worker registration, workspace-assistant context module
 * preload, and the mounted gate that keeps monaco & friends out of the
 * server bundle. During the router migration, the legacy hand-rolled router
 * (WorkspaceApp + HashRouter) renders inside this gate; pages migrate out
 * one by one.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    document.documentElement.dataset.creatorweave = 'true'
    if (IS_DEVELOPMENT) void import('react-grab')

    registerServiceWorker({
      buildId: APP_BUILD_ID,
      onUpdateAvailable: () => window.dispatchEvent(new CustomEvent('sw-update-available')),
    })
  }, [])

  return (
    <RootErrorBoundary>
      {mounted ? <AppBootstrap>{children}</AppBootstrap> : null}
    </RootErrorBoundary>
  )
}
