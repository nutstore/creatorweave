import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-2xl border bg-card text-card-foreground",
  {
    variants: {
      variant: {
        metric: "p-6 gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.024)]",
        content: "overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.024)]",
        info: "p-6 gap-4 shadow-[0_4px_16px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.024)]",
      },
    },
    defaultVariants: {
      variant: "metric",
    },
  }
)

export interface BrandCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const BrandCard = React.forwardRef<HTMLDivElement, BrandCardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
)
BrandCard.displayName = "BrandCard"

const BrandCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1", className)}
    {...props}
  />
))
BrandCardHeader.displayName = "BrandCardHeader"

const BrandCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-display font-medium leading-none", className)}
    {...props}
  />
))
BrandCardTitle.displayName = "BrandCardTitle"

const BrandCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-secondary", className)}
    {...props}
  />
))
BrandCardDescription.displayName = "BrandCardDescription"

const BrandCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
))
BrandCardContent.displayName = "BrandCardContent"

const BrandCardMetric = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-3xl font-display font-medium", className)}
    {...props}
  />
))
BrandCardMetric.displayName = "BrandCardMetric"

const BrandCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-end py-3 px-5 border-t border-gray-200", className)}
    {...props}
  />
))
BrandCardFooter.displayName = "BrandCardFooter"

export {
  BrandCard,
  BrandCardHeader,
  BrandCardTitle,
  BrandCardDescription,
  BrandCardContent,
  BrandCardMetric,
  BrandCardFooter,
  cardVariants,
}
