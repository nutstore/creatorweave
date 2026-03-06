import { useMemo } from 'react'
import { getPreviewUrlFromLocation } from '@/services/webcontainer/preview-route'

export function WebContainerStandalonePreview() {
  const previewUrl = useMemo(() => getPreviewUrlFromLocation(window.location), [])

  return (
    <div className="h-screen min-w-0 bg-neutral-950">
      {previewUrl ? (
        <iframe
          title="webcontainer-standalone-preview"
          src={previewUrl}
          className="h-full w-full min-w-0 border-0"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-neutral-300">
          Missing preview URL. Re-open preview from the main workspace.
        </div>
      )}
    </div>
  )
}
