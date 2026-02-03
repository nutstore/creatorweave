import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Design spec: padding [10, 14], cornerRadius: 8
const inputVariants = cva(
  "flex w-full rounded-lg border bg-transparent px-[14px] py-[10px] text-sm transition-colors placeholder:text-gray-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      state: {
        default: "border-gray-200 bg-transparent focus-visible:border-primary-600 focus-visible:shadow-[0_0_6px_rgba(13,148,136,0.13)]",
        error: "border-[1.5px] border-danger-solid bg-danger-bg focus-visible:border-danger-solid focus-visible:shadow-none",
        filled: "border-gray-200 bg-transparent",
        disabled: "bg-gray-100 border-gray-200 text-muted placeholder:text-muted",
      },
    },
    defaultVariants: {
      state: "default",
    },
  }
)

export interface BrandInputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  label?: string
  error?: string
}

const BrandInput = React.forwardRef<HTMLInputElement, BrandInputProps>(
  ({ className, state, label, error, id, disabled, ...props }, ref) => {
    const inputId = id || `input-${React.useId()}`
    // Determine actual state based on props
    const inputState = disabled ? "disabled" : error ? "error" : state || "default"

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-primary leading-tight"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          className={cn(inputVariants({ state: inputState }), className)}
          ref={ref}
          disabled={disabled}
          {...props}
        />
        {error && !disabled && (
          <span className="text-[12px] text-danger leading-tight">{error}</span>
        )}
      </div>
    )
  }
)
BrandInput.displayName = "BrandInput"

export { BrandInput, inputVariants }
