/**
 * AspectRatioDropdown — compact dropdown for selecting image generation aspect ratio.
 *
 * Shows the current ratio (e.g. "1:1") as a small button.
 * Click to open a popover with all available ratios.
 */

import { useState, useRef, useEffect } from 'react'
import { Ratio } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'

const RATIOS = [
  { value: '1:1', label: '1:1', desc: '正方形' },
  { value: '16:9', label: '16:9', desc: '宽屏' },
  { value: '9:16', label: '9:16', desc: '竖屏' },
  { value: '4:3', label: '4:3', desc: '横版' },
  { value: '3:4', label: '3:4', desc: '竖版' },
  { value: '3:2', label: '3:2', desc: '照片' },
  { value: '2:3', label: '2:3', desc: '海报' },
] as const

export function AspectRatioDropdown() {
  const imageGenAspectRatio = useSettingsStore((s) => s.imageGenAspectRatio)
  const setImageGenAspectRatio = useSettingsStore((s) => s.setImageGenAspectRatio)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        title="图片宽高比"
      >
        <Ratio className="h-3.5 w-3.5" />
        <span className="font-medium">{imageGenAspectRatio || '1:1'}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-48 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          <div className="mb-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
            图片宽高比
          </div>
          <div className="grid grid-cols-2 gap-1">
            {RATIOS.map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setImageGenAspectRatio(value)
                  setOpen(false)
                }}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  imageGenAspectRatio === value
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-neutral-400 dark:text-neutral-500">{desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 border-t border-neutral-100 px-2 py-1 text-[10px] text-neutral-400 dark:border-neutral-700">
            也可用 <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-700">--ar 16:9</code> 临时指定
          </div>
        </div>
      )}
    </div>
  )
}
