/**
 * Shared image utilities for rendering AI-generated images inline.
 * Used by AssistantTurnBubble and MessageBubble.
 */

/** Convert a data: URI to a Blob for preview/download */
export function dataUriToBlob(dataUri: string, mimeType: string): Blob {
  const base64 = dataUri.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

/** Download a base64 image to the user's device */
export function downloadImage(base64Data: string, mimeType: string, filename: string): void {
  const ext = mimeType.split('/')[1] || 'png'
  const blob = dataUriToBlob(`data:${mimeType};base64,${base64Data}`, mimeType)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
