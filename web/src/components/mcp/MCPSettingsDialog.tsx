/**
 * MCP Settings Dialog - Standalone dialog for MCP server configuration
 */

import { forwardRef } from 'react'
import { Server, X } from 'lucide-react'
import {
  BrandDialog,
  BrandDialogClose,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
} from '@browser-fs-analyzer/ui'
import { MCPSettings } from './MCPSettings'

interface MCPSettingsDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
}

const MCPSettingsDialogContent = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BrandDialogContent>
>(({ className, ...props }, ref) => {
  return (
    <BrandDialogContent ref={ref} className="max-h-[85vh] w-[800px]" showOverlay={true} {...props}>
      <BrandDialogHeader>
        <div className="flex items-center gap-2.5">
          <Server className="h-[18px] w-[18px] text-primary-600" />
          <BrandDialogTitle>MCP 服务配置</BrandDialogTitle>
        </div>
        <BrandDialogClose asChild>
          <button className="text-tertiary transition-colors hover:text-primary">
            <X className="h-5 w-5" />
          </button>
        </BrandDialogClose>
      </BrandDialogHeader>

      <BrandDialogBody className="overflow-hidden">
        <div className="h-[calc(85vh-140px)] overflow-y-auto">
          <MCPSettings />
        </div>
      </BrandDialogBody>
    </BrandDialogContent>
  )
})
MCPSettingsDialogContent.displayName = 'MCPSettingsDialogContent'

const MCPSettingsDialog = forwardRef<
  React.ElementRef<typeof BrandDialog>,
  React.ComponentPropsWithoutRef<typeof BrandDialog> & MCPSettingsDialogProps
>(({ open, onOpenChange, ...props }, ref) => {
  return (
    <BrandDialog open={open} onOpenChange={onOpenChange} {...props}>
      <MCPSettingsDialogContent ref={ref as React.RefObject<HTMLDivElement>} />
    </BrandDialog>
  )
})
MCPSettingsDialog.displayName = 'MCPSettingsDialog'

export { MCPSettingsDialog, MCPSettingsDialogContent }
