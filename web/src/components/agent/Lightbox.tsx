/**
 * Lightbox — shared fullscreen image overlay.
 *
 * Features:
 *   - Click backdrop to close
 *   - Escape key to close
 *   - Centered image with max dimensions
 *   - Backdrop blur + dark overlay
 *
 * Extracted from nol/Preview.tsx for reuse across:
 *   - MessageBubble (user messages)
 *   - AssistantTurnBubble (assistant generated images)
 *   - MarkdownContent (markdown images)
 *   - AssetCard (compact thumbnails)
 */

import { useEffect, useCallback } from 'react'

interface LightboxProps {
  /** Image source URL (blob URL, data URI, or external URL) */
  src: string
  /** Alt text for the image */
  alt?: string
  /** Close callback */
  onClose: () => void
}

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll while open
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [])

  const handleBackdropClick = useCallback(() => {
    onClose()
  }, [onClose])

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* Close hint */}
      <div className="absolute top-4 right-4 rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/70 backdrop-blur-sm">
        ESC 或点击空白处关闭
      </div>
      <img
        src={src}
        alt={alt || 'Preview'}
        className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl"
        onClick={handleImageClick}
      />
    </div>
  )
}
