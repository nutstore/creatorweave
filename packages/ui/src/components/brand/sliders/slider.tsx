import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

export interface BrandSliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Callback when value changes - receives array of numbers */
  onValueChange?: (value: number[]) => void
}

const BrandSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  BrandSliderProps
>(({ className, children, defaultValue, value, onValueChange, ...props }, ref) => {
  // Determine how many thumbs to render based on value/defaultValue length
  const valuesLength = value?.length ?? defaultValue?.length ?? 1

  // Normalize value to array format if needed
  const normalizedValue: number[] | undefined = React.useMemo(() => {
    if (value === undefined) return undefined
    return Array.isArray(value) ? value : [value]
  }, [value])

  // Normalize defaultValue to array format if needed
  const normalizedDefaultValue: number[] = React.useMemo(() => {
    if (defaultValue === undefined) return [50] // Default fallback
    return Array.isArray(defaultValue) ? defaultValue : [defaultValue]
  }, [defaultValue])

  // Wrap onValueChange to handle both single number and array responses
  const handleValueChange = React.useCallback(
    (values: number[]) => {
      onValueChange?.(values)
    },
    [onValueChange]
  )

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex h-5 w-full items-center", className)}
      defaultValue={normalizedDefaultValue}
      value={normalizedValue}
      onValueChange={handleValueChange}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-200">
        <SliderPrimitive.Range className="absolute h-full bg-primary-600" />
      </SliderPrimitive.Track>
      {children || Array.from({ length: valuesLength }).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block h-5 w-5 rounded-full border-2 border-primary-600 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
})
BrandSlider.displayName = SliderPrimitive.Root.displayName

export { BrandSlider }
