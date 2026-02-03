import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const radioVariants = cva(
  "aspect-square shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        md: "h-5 w-5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

export interface BrandRadioProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioVariants> {}

const BrandRadio = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  BrandRadioProps
>(({ className, size, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      radioVariants({ size }),
      "rounded-full border border-gray-200 data-[state=checked]:border-primary-600",
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="h-2.5 w-2.5 fill-primary-600" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
BrandRadio.displayName = BrandRadio.name

const BrandRadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  )
})
BrandRadioGroup.displayName = BrandRadioGroup.name

export { BrandRadio, BrandRadioGroup, radioVariants }
