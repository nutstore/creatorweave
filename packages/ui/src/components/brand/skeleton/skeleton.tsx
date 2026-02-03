import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const skeletonVariants = cva("animate-pulse bg-gray-100", {
  variants: {
    size: {
      sm: "h-2",
      default: "h-3", // 12px - design spec
      md: "h-4",
      lg: "h-6",
    },
    rounded: {
      sm: "rounded-sm",
      default: "rounded-md", // 6px - design spec
      md: "rounded-lg",
      full: "rounded-full",
    },
  },
  defaultVariants: {
    size: "default",
    rounded: "default",
  },
})

export interface BrandSkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  asChild?: boolean
}

const BrandSkeleton = React.forwardRef<HTMLDivElement, BrandSkeletonProps>(
  ({ className, size, rounded, asChild = false, ...props }, ref) => {
    if (asChild) {
      return (
        <span ref={ref} className={cn(skeletonVariants({ size, rounded }), className)} {...props} />
      )
    }

    return (
      <div ref={ref} className={cn(skeletonVariants({ size, rounded }), className)} {...props} />
    )
  }
)
BrandSkeleton.displayName = "BrandSkeleton"

export { BrandSkeleton, skeletonVariants }
