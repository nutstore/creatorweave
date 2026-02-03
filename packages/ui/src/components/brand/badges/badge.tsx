import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        success: "bg-success-bg text-success-text border border-success-text/20",
        warning: "bg-warning-bg text-warning border border-warning/20",
        error: "bg-danger-bg text-danger border border-danger-border",
        neutral: "bg-gray-100 text-secondary",
      },
      shape: {
        default: "rounded-md",
        pill: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "neutral",
      shape: "default",
    },
  }
)

const tagVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
  {
    variants: {
      color: {
        primary: "bg-primary-50 text-primary-700 border-primary-600",
        blue: "bg-blue-50 text-blue-700 border-blue-500",
        purple: "bg-purple-50 text-purple-700 border-purple-700",
        green: "bg-green-50 text-green-700 border-green-500",
        orange: "bg-orange-50 text-orange-700 border-orange-700",
        pink: "bg-pink-50 text-pink-700 border-pink-700",
      },
    },
    defaultVariants: {
      color: "primary",
    },
  }
)

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]
type BadgeShape = VariantProps<typeof badgeVariants>["shape"]
type TagColor = VariantProps<typeof tagVariants>["color"]

export interface BrandBadgeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "color"> {
  type?: "badge" | "tag"
  variant?: BadgeVariant
  shape?: BadgeShape
  color?: TagColor
}

const BrandBadge = React.forwardRef<HTMLDivElement, BrandBadgeProps>(
  ({ className, variant, shape, color, type = "badge", ...props }, ref) => {
    if (type === "tag") {
      return (
        <div
          ref={ref}
          className={cn(tagVariants({ color }), className)}
          {...props}
        />
      )
    }
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, shape }), className)}
        {...props}
      />
    )
  }
)
BrandBadge.displayName = "BrandBadge"

export { BrandBadge, badgeVariants, tagVariants }
