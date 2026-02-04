/**
 * Brand Dialog Components
 *
 * Modal/Dialog components with z-index layering.
 * Overlay: z-overlay (1000), Content: z-modal (1001)
 *
 * @see /docs/z-index-layering-spec.md for layering system details
 */

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const BrandDialog = DialogPrimitive.Root

const BrandDialogTrigger = DialogPrimitive.Trigger

const BrandDialogPortal = DialogPrimitive.Portal

const BrandDialogClose = DialogPrimitive.Close

const BrandDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-overlay bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
BrandDialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const BrandDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <BrandDialogPortal>
    <BrandDialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-modal w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-xl border border-gray-200 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.024)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </BrandDialogPortal>
))
BrandDialogContent.displayName = DialogPrimitive.Content.displayName

const BrandDialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-14 items-center justify-between px-5 border-b border-gray-200",
      className
    )}
    {...props}
  />
))
BrandDialogHeader.displayName = "BrandDialogHeader"

const BrandDialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-2 px-5 py-4", className)}
    {...props}
  />
))
BrandDialogBody.displayName = "BrandDialogBody"

const BrandDialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-16 items-center justify-end gap-3 px-5 border-t border-gray-200",
      className
    )}
    {...props}
  />
))
BrandDialogFooter.displayName = "BrandDialogFooter"

const BrandDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold", className)}
    {...props}
  />
))
BrandDialogTitle.displayName = DialogPrimitive.Title.displayName

const BrandDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-secondary", className)}
    {...props}
  />
))
BrandDialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  BrandDialog,
  BrandDialogPortal,
  BrandDialogOverlay,
  BrandDialogClose,
  BrandDialogTrigger,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogBody,
  BrandDialogFooter,
  BrandDialogTitle,
  BrandDialogDescription,
}
