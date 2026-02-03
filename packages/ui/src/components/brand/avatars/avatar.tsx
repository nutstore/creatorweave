import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// ========== Size Variants ==========
// Design spec: XS 24px, SM 32px, MD 40px, LG 48px, XL 64px
const avatarSizes = cva(
  "relative flex shrink-0 overflow-hidden rounded-full",
  {
    variants: {
      size: {
        xs: "h-6 w-6 text-xs",      // 24px
        sm: "h-8 w-8 text-sm",      // 32px
        md: "h-10 w-10 text-base",  // 40px
        lg: "h-12 w-12 text-lg",    // 48px
        xl: "h-16 w-16 text-xl",    // 64px
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

const fallbackColors = cva(
  "flex h-full w-full items-center justify-center rounded-full font-medium",
  {
    variants: {
      variant: {
        primary: "bg-primary-600 text-white",
        gray: "bg-gray-200 text-gray-600",
        success: "bg-success-bg text-success",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
)

// ========== Status Indicator Sizes ==========
const statusSizes = {
  xs: "h-2 w-2",   // 8px
  sm: "h-2.5 w-2.5",  // 10px
  md: "h-3 w-3",   // 12px
  lg: "h-3 w-3",   // 12px
  xl: "h-3.5 w-3.5", // 14px
}

const statusColors = {
  online: "bg-success-bg border-2 border-white",
  busy: "bg-danger-bg border-2 border-white",
  offline: "bg-gray-300 border-2 border-white",
}

// ========== Types ==========
export interface BrandAvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarSizes> {
  /** Avatar image source */
  src?: string
  /** Alt text for image */
  alt?: string
  /** Fallback text (usually initials) */
  fallback?: string
  /** Status indicator */
  status?: "online" | "busy" | "offline"
  /** Color variant for fallback */
  variant?: "primary" | "gray" | "success"
}

export interface BrandAvatarGroupProps {
  /** Avatar components to display */
  children: React.ReactNode
  /** Maximum number of avatars to show before "+N" */
  max?: number
  /** Spacing between avatars (negative for stacking) */
  spacing?: "none" | "sm" | "md" | "lg"
  /** Size of avatars in group */
  size?: BrandAvatarProps["size"]
  /** Total count (for showing +N) */
  total?: number
  /** Additional className */
  className?: string
}

// ========== Avatar Root ==========
const BrandAvatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  BrandAvatarProps
>(({ className, size, src, alt, fallback, status, variant = "primary", ...props }, ref) => {
  return (
    <div className="relative inline-flex">
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(avatarSizes({ size }), className)}
        {...props}
      >
        <AvatarPrimitive.Image
          src={src}
          alt={alt}
          className="aspect-square h-full w-full object-cover"
        />
        <AvatarPrimitive.Fallback
          className={cn(fallbackColors({ variant }))}
        >
          {fallback}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>

      {/* Status Indicator */}
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full",
            statusSizes[size || "md"],
            statusColors[status]
          )}
        />
      )}
    </div>
  )
})
BrandAvatar.displayName = "BrandAvatar"

// ========== Avatar Group ==========
const BrandAvatarGroup = React.forwardRef<
  HTMLDivElement,
  BrandAvatarGroupProps
>(({ children, max = 5, spacing = "md", size = "md", total, className }, ref) => {
  const spacingClasses = {
    none: "",
    sm: "-space-x-1",
    md: "-space-x-2",
    lg: "-space-x-3",
  }

  const avatars = React.Children.toArray(children)
  const visibleAvatars = max ? avatars.slice(0, max) : avatars
  const remainingCount = total ? total - visibleAvatars.length : avatars.length - visibleAvatars.length

  return (
    <div
      ref={ref}
      className={cn("flex items-center", spacingClasses[spacing], className)}
    >
      {visibleAvatars.map((avatar, i) => (
        <div key={i} className="inline-flex">
          {avatar}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-600 font-medium ring-2 ring-white",
            avatarSizes({ size })
          )}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  )
})
BrandAvatarGroup.displayName = "BrandAvatarGroup"

// ========== Exports ==========
export { BrandAvatar, BrandAvatarGroup, avatarSizes, fallbackColors }
