'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { registerServiceWorker } from '@/pwa/register-service-worker'
import { RootErrorBoundary } from '@/components/error/RootErrorBoundary'
import { APP_BUILD_ID, IS_DEVELOPMENT } from '@/app-build'

const App = dynamic(() => import('@/WorkspaceApp'), { ssr: false, loading: () => null })

export default function ClientAppShell() {
  // The app is browser-only (OPFS, web workers, monaco-editor...). Render
  // <App/> only after mount so the SSR/prerender pass never even *evaluates*
  // the client module graph. `dynamic(..., { ssr: false })` alone is not
  // enough: Next can still invoke the load function during prerendering,
  // which would crash the build with
  // "window is not defined" from monaco-editor's module scope.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    document.documentElement.dataset.creatorweave = 'true'
    void import('@/agent/workspace-assistant-context')
    if (IS_DEVELOPMENT) void import('react-grab')

    registerServiceWorker({
      buildId: APP_BUILD_ID,
      onUpdateAvailable: () => window.dispatchEvent(new CustomEvent('sw-update-available')),
    })
  }, [])

  return (
    <RootErrorBoundary>
      {mounted ? <App /> : null}
    </RootErrorBoundary>
  )
}
