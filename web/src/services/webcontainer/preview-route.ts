export function buildWebContainerPreviewRoute(
  previewUrl: string,
  projectId?: string | null
): string {
  const params = new URLSearchParams()
  params.set('src', previewUrl)
  if (projectId) {
    params.set('projectId', projectId)
  }
  return `/webcontainer-preview?${params.toString()}`
}

export function getPreviewUrlFromLocation(locationLike: Location): string | null {
  const params = new URLSearchParams(locationLike.search)
  const src = params.get('src')
  if (!src) return null
  return src
}

