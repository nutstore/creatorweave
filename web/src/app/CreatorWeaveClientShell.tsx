'use client'

import { useEffect } from 'react'
import App from '@/App'
import { registerServiceWorker } from '@/pwa/register-service-worker'
import { RootErrorBoundary } from '@/components/error/RootErrorBoundary'
import { APP_BUILD_ID, IS_DEVELOPMENT } from '@/app-build'

export default function CreatorWeaveClientShell() {
  useEffect(() => {
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
      <App />
    </RootErrorBoundary>
  )
}
