import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const textareaVariants = cva(
  "flex w-full rounded-lg border bg-transparent px-[14px] py-[10px] text-sm transition-colors placeholder:text-gray-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-neutral-500",
  {
    variants: {
      state: {
        default:
          "border-gray-200 bg-transparent focus-visible:border-primary-600 focus-visible:shadow-[0_0_6px_rgba(13,148,136,0.13)] dark:border-neutral-700 dark:bg-neutral-900",
        error:
          "border-[1.5px] border-danger-solid bg-danger-bg focus-visible:border-danger-solid focus-visible:shadow-none dark:bg-danger-bg/40",
        filled:
          "border-gray-200 bg-transparent dark:border-neutral-700 dark:bg-neutral-900",
        disabled:
          "border-gray-200 bg-gray-100 text-muted placeholder:text-muted dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:placeholder:text-neutral-500",
      },
    },
    defaultVariants: {
      state: "default",
    },
  }
)

export interface BrandTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  label?: string
  error?: string
}

const BrandTextarea = React.forwardRef<HTMLTextAreaElement, BrandTextareaProps>(
  ({ className, state, label, error, id, disabled, ...props }, ref) => {
    const textareaId = id || `textarea-${React.useId()}`
    const textareaState = disabled ? "disabled" : error ? "error" : state || "default"

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[13px] font-medium text-primary leading-tight"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(textareaVariants({ state: textareaState }), className)}
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
BrandTextarea.displayName = "BrandTextarea"

export { BrandTextarea, textareaVariants }
