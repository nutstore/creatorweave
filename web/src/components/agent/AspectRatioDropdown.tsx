/**
 * AspectRatioDropdown — compact dropdown for selecting image generation aspect ratio.
 *
 * Shows the current ratio (e.g. "1:1") as a small button.
 * Click to open a popover with all available ratios.
 *
 * Uses Popover + BrandButton for consistent styling with ModelQuickSwitch.
 */

import { useState } from 'react'
import { Ratio, ChevronDown } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { Popover, PopoverContent, PopoverTrigger, BrandButton } from '@creatorweave/ui'
import { useHasImageModels } from './ImageModelDropdown'
import { useT } from '@/i18n'

const RATIOS = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
] as const

export function AspectRatioDropdown() {
  const imageGenAspectRatio = useSettingsStore((s) => s.imageGenAspectRatio)
  const setImageGenAspectRatio = useSettingsStore((s) => s.setImageGenAspectRatio)
  const [open, setOpen] = useState(false)
  const t = useT()

  // Hide if current provider has no image models
  if (!useHasImageModels()) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BrandButton variant="outline" className="h-8 justify-between gap-1.5 px-2.5 text-xs">
          <span className="flex items-center gap-1.5">
            <Ratio className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">{imageGenAspectRatio || '1:1'}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </BrandButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-0">
        <div className="p-1.5">
          <div className="mb-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-tertiary">
            {t('settings.imageGen.aspectRatio') || 'Aspect Ratio'}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {RATIOS.map(({ value, label }) => (
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
                    : 'text-secondary hover:bg-muted'
                }`}
              >
                <span className="font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 border-t border-border/60 px-2 py-1 text-[10px] text-tertiary">
            {t('settings.imageGen.arHint') || 'Use --ar 16:9 to override'}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
