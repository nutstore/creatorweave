import { useCallback, useEffect, useRef, useState } from 'react'
import { Crop, Loader2, X } from 'lucide-react'
import { captureDataUrlAsFile } from '@/agent/tools/page-action-bridge'
import { useT } from '@/i18n'

type CropRect = { x: number; y: number; width: number; height: number }

interface PageScreenshotCropDialogProps {
  imageDataUrl: string
  onConfirm: (file: File) => void
  onCancel: () => void
}

function pointForEvent(event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  }
}

function cropFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): CropRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

async function cropImage(image: HTMLImageElement, crop: CropRect): Promise<File> {
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  const width = Math.max(1, Math.round(sourceWidth * crop.width))
  const height = Math.max(1, Math.round(sourceHeight * crop.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create screenshot crop')

  context.drawImage(
    image,
    Math.round(sourceWidth * crop.x),
    Math.round(sourceHeight * crop.y),
    width,
    height,
    0,
    0,
    width,
    height,
  )

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Unable to encode screenshot crop')
  return new File([blob], `page-screenshot-${Date.now()}.png`, { type: 'image/png' })
}

export function PageScreenshotCropDialog({ imageDataUrl, onConfirm, onCancel }: PageScreenshotCropDialogProps) {
  const t = useT()
  const imageRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 })
  const [hasUserCrop, setHasUserCrop] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSaving, onCancel])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointForEvent(event)
    dragStartRef.current = point
    setCrop({ x: point.x, y: point.y, width: 0, height: 0 })
    setHasUserCrop(true)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start) return
    setCrop(cropFromPoints(start, pointForEvent(event)))
  }, [])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start) return
    dragStartRef.current = null
    const nextCrop = cropFromPoints(start, pointForEvent(event))
    // A click is not a meaningful crop; keep the original screenshot.
    if (nextCrop.width < 0.02 || nextCrop.height < 0.02) {
      setCrop({ x: 0, y: 0, width: 1, height: 1 })
      setHasUserCrop(false)
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    const image = imageRef.current
    if (!image || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const file = hasUserCrop
        ? await cropImage(image, crop)
        : await captureDataUrlAsFile(imageDataUrl, `page-screenshot-${Date.now()}.png`)
      onConfirm(file)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('agent.pageScreenshot.cropFailed'))
    } finally {
      setIsSaving(false)
    }
  }, [crop, hasUserCrop, imageDataUrl, isSaving, onConfirm, t])

  const cropStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm">
      <section className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5 text-foreground">
          <div className="flex items-center gap-2.5">
            <Crop className="h-4 w-4 text-primary-700" />
            <div>
              <h2 className="text-sm font-semibold">{t('agent.pageScreenshot.title')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('agent.pageScreenshot.description')}</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={isSaving} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label={t('agent.pageScreenshot.cancelAria')}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[68vh] overflow-auto bg-black p-3 sm:p-5">
          <div
            className="relative mx-auto w-fit touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img ref={imageRef} src={imageDataUrl} alt="当前页面截图" draggable={false} className="block max-h-[60vh] max-w-full" />
            {hasUserCrop && (
              <div className="pointer-events-none absolute border-2 border-primary-100 shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]" style={cropStyle} />
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          {error && <p className="mr-auto text-xs text-destructive">{error}</p>}
          <button type="button" onClick={onCancel} disabled={isSaving} className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void handleConfirm()} disabled={isSaving} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-700 disabled:opacity-50">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('agent.pageScreenshot.insert')}
          </button>
        </footer>
      </section>
    </div>
  )
}
