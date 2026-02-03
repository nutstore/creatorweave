import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

export interface BrandProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  size?: "xs" | "sm" | "md" | "lg"
  rounded?: "sm" | "md" | "full"
}

const sizeClasses = {
  xs: "h-1.5", // 6px - design spec
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
}

const roundedClasses = {
  sm: "rounded-sm", // 3px - design spec
  md: "rounded-md",
  full: "rounded-full",
}

const BrandProgress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  BrandProgressProps
>(({ className, size = "xs", rounded = "sm", value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative w-full overflow-hidden bg-gray-200",
      sizeClasses[size],
      roundedClasses[rounded],
      className
    )}
    {...props}
  >
    {value !== undefined && value !== null ? (
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary-600 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    ) : (
      <div className="h-full w-full animate-pulse bg-gray-300" />
    )}
  </ProgressPrimitive.Root>
))
BrandProgress.displayName = ProgressPrimitive.Root.displayName

export { BrandProgress }
