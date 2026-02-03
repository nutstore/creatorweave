import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Design spec: h-10 (40px), padding [10, 20], cornerRadius: 8, gap 8px
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-600 text-white shadow-[0_1px_3px_0_rgba(13,148,136,0.3)] hover:bg-primary-700 font-semibold",
        secondary:
          "bg-primary-50 text-primary-600 border border-gray-200 hover:bg-primary-100 font-semibold",
        outline:
          "bg-transparent border border-gray-200 text-primary hover:bg-gray-50 font-medium",
        ghost: "gap-1.5 bg-transparent text-tertiary hover:bg-gray-100 hover:text-primary font-medium",
        danger:
          "bg-danger-bg text-danger border border-danger-border hover:opacity-90 font-semibold",
      },
      size: {
        default: "h-10 px-5 text-sm",
        ghost: "h-10 px-4 text-sm", // Ghost has smaller horizontal padding
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

// Design spec: 32x32, cornerRadius: 6
const iconButtonVariants = cva(
  "inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-gray-200 text-gray-700 hover:bg-gray-50",
        primary:
          "bg-primary-50 text-primary-600 border border-primary-600 hover:bg-primary-100",
        danger:
          "bg-danger-bg text-danger border border-danger-border hover:opacity-90",
        ghost: "text-tertiary hover:bg-gray-100",
        disabled:
          "bg-gray-100 text-muted cursor-not-allowed",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BrandButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "variant"> {
  asChild?: boolean
  iconButton?: boolean
  variant?: VariantProps<typeof buttonVariants>["variant"] | VariantProps<typeof iconButtonVariants>["variant"]
}

const BrandButton = React.forwardRef<HTMLButtonElement, BrandButtonProps>(
  ({ className, variant, iconButton, ...props }, ref) => {
  if (iconButton) {
    return (
      <button
        className={cn(
          "h-8 w-8 rounded-md p-0",
          iconButtonVariants({ variant: variant as VariantProps<typeof iconButtonVariants>["variant"] }),
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }

  // Ghost variant uses special size
  const isGhost = variant === "ghost"
  const size = isGhost ? "ghost" : "default"

  return (
    <button
      className={cn(
        "rounded-lg",
        buttonVariants({ variant: variant as VariantProps<typeof buttonVariants>["variant"], size })
      , className)}
      ref={ref}
      {...props}
    />
  )
})
BrandButton.displayName = "BrandButton"

export { BrandButton, buttonVariants, iconButtonVariants }
