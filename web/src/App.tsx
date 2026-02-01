import { useEffect, useState } from 'react'
import { isSupported } from '@/services/fsAccess.service'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useAgentStore } from '@/store/agent.store'
import { attemptReconnect } from '@/store/remote.store'

function App() {
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)
  const restoreDirectoryHandle = useAgentStore((s) => s.restoreDirectoryHandle)

  useEffect(() => {
    setIsSupportedBrowser(isSupported())
    restoreDirectoryHandle()
    // Attempt to reconnect to previous remote session
    attemptReconnect()
  }, [restoreDirectoryHandle])

  if (!isSupportedBrowser) {
    return <UnsupportedBrowser />
  }

  return <WorkspaceLayout />
}

export default App
