import { useEffect, useState } from 'react'
import { isSupported } from '@/services/fsAccess.service'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useAgentStore } from '@/store/agent.store'
import { attemptReconnect } from '@/store/remote.store'
import { useSessionStore } from '@/store/session.store'

function App() {
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)
  const restoreDirectoryHandle = useAgentStore((s) => s.restoreDirectoryHandle)
  const initializeSessions = useSessionStore((s) => s.initialize)

  useEffect(() => {
    setIsSupportedBrowser(isSupported())
    restoreDirectoryHandle()
    // Initialize OPFS session store
    initializeSessions().catch((err) => {
      console.error('[App] Failed to initialize session store:', err)
    })
    // Attempt to reconnect to previous remote session
    attemptReconnect()
  }, [restoreDirectoryHandle, initializeSessions])

  if (!isSupportedBrowser) {
    return <UnsupportedBrowser />
  }

  return <WorkspaceLayout />
}

export default App
