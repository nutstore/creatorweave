import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Check, X, AlertTriangle, Info } from "lucide-react"

import { cn } from "@/lib/utils"

const toastVariants = cva(
  "relative flex w-[400px] items-center gap-3 rounded-lg border py-3 px-4 shadow-sm",
  {
    variants: {
      variant: {
        success: "bg-success-50 border-success-200 text-success-text",
        error: "bg-danger-50 border-danger-200 text-danger-border",
        warning: "bg-warning-50 border-warning-200 text-warning",
        info: "bg-blue-50 border-blue-200 text-blue-800",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

export interface BrandToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  title?: string
  icon?: boolean
}

const toastIconWrappers = {
  success: "bg-success-bg text-success",
  error: "bg-danger-bg text-danger-border",
  warning: "bg-warning-bg text-warning",
  info: "bg-blue-100 text-blue-600",
}

const toastIcons = {
  success: <Check className="h-4 w-4" />,
  error: <X className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
}

const BrandToast = React.forwardRef<HTMLDivElement, BrandToastProps>(
  ({ className, variant = "info", title, icon = true, children, ...props }, ref) => {
    // Use non-null assertion since variant has a default value
    const toastVariant = variant!

    return (
      <div
        ref={ref}
        className={cn(toastVariants({ variant }), className)}
        {...props}
      >
        {icon && (
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-full", toastIconWrappers[toastVariant])}>
            {toastIcons[toastVariant]}
          </div>
        )}
        <div className="flex flex-col gap-0.5 flex-1">
          {title && <p className="text-sm font-semibold">{title}</p>}
          {children && <p className="text-sm opacity-90">{children}</p>}
        </div>
      </div>
    )
  }
)
BrandToast.displayName = "BrandToast"

export { BrandToast, toastVariants }
