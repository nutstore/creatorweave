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
  src?: string
  /** Alt text for the image */
  alt?: string
  /** Close callback */
  onClose: () => void
  /** Custom backdrop class (default: dark blur overlay). Use e.g. 'bg-white/90' for diagrams. */
  backdropClassName?: string
  /** Custom class for the img element (e.g. 'bg-white' for transparent SVGs). */
  imgClassName?: string
  /**
   * When provided, renders arbitrary children instead of an <img>.
   * Use for content that can't be loaded via an <img> data URI reliably
   * (e.g. SVGs with <foreignObject> — browsers don't render those when the
   * SVG is loaded as an image). Keeps the same max-size + close behavior.
   */
  children?: React.ReactNode
  /** Class for the content wrapper when using children (default: max-size + center). */
  contentClassName?: string
}

export function Lightbox({ src, alt, onClose, backdropClassName, imgClassName, children, contentClassName }: LightboxProps) {
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
      className={backdropClassName || 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm'}
      style={backdropClassName ? { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* Close hint */}
      <div className="absolute top-4 right-4 rounded-md bg-black/10 px-3 py-1.5 text-xs text-neutral-500 backdrop-blur-sm">
        ESC 或点击空白处关闭
      </div>
      {children ? (
        <div
          className={contentClassName || 'max-h-[90vh] max-w-[90vw] overflow-auto rounded-md shadow-2xl'}
          onClick={handleImageClick}
        >
          {children}
        </div>
      ) : (
        <img
          src={src as string}
          alt={alt || 'Preview'}
          className={imgClassName
            ? `max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl ${imgClassName}`
            : 'max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl'}
          onClick={handleImageClick}
        />
      )}
    </div>
  )
}
