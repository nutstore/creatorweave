import * as React from "react"
import { MonitorSmartphone, X, Unplug, Lock, Copy } from "lucide-react"
import {
  BrandDialog,
  BrandDialogClose,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
} from "../modals/dialog"
import { BrandInput } from "../inputs/input"

export interface RemoteDialogProps {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Relay server URL */
  relayUrl?: string
  /** Callback when relay URL changes */
  onRelayUrlChange?: (url: string) => void
  /** Session ID for QR code connection */
  sessionId?: string
  /** Callback when session ID is copied */
  onCopySessionId?: () => void
  /** Connection status */
  connected?: boolean
  /** Number of connected devices */
  connectedDevices?: number
  /** Callback when disconnect is clicked */
  onDisconnect?: () => void
  /** QR Code URL or data */
  qrCodeUrl?: string
}

const RemoteDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BrandDialogContent> & RemoteDialogProps
>(({
  className,
  relayUrl,
  onRelayUrlChange,
  sessionId = "a7f3-b2c1",
  onCopySessionId,
  connected = true,
  connectedDevices = 1,
  onDisconnect,
  qrCodeUrl,
  ...props
}, ref) => {
  return (
    <BrandDialogContent ref={ref} className="max-w-[448px] rounded-xl p-0 gap-0" {...props}>
      {/* Header */}
      <BrandDialogHeader className="h-14 px-6 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <MonitorSmartphone className="h-[18px] w-[18px] text-primary-600" />
          <BrandDialogTitle className="text-base font-semibold text-primary">远程控制</BrandDialogTitle>
        </div>
        <BrandDialogClose className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </BrandDialogClose>
      </BrandDialogHeader>

      {/* Body */}
      <div className="px-6 py-6 space-y-5">
        {/* Relay Server */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-primary">Relay 服务器</label>
          <BrandInput
            value={relayUrl}
            onChange={(e) => onRelayUrlChange?.(e.target.value)}
            placeholder="wss://relay.example.com"
            className="h-10"
          />
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-[200px] h-[200px] rounded-xl bg-tertiary border border-gray-200">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="QR Code" className="w-[160px] h-[160px]" />
            ) : (
              <div className="w-[160px] h-[160px] bg-neutral-900 rounded-md flex items-center justify-center p-4">
                <div className="grid grid-cols-5 gap-1 w-full h-full">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-sm ${Math.random() > 0.5 ? 'bg-white' : 'bg-transparent'}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scan hint */}
        <p className="text-center text-sm text-tertiary">使用手机扫描二维码加入会话</p>

        {/* Session ID */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-tertiary">Session ID:</span>
          <div className="flex items-center gap-2">
            <code className="text-xs font-semibold text-primary font-mono">{sessionId}</code>
            <button
              onClick={onCopySessionId}
              className="text-tertiary hover:text-primary transition-colors"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Connection Status */}
        {connected ? (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-success-bg border border-success-200">
            <div className="h-2 w-2 rounded-full bg-success-500" />
            <span className="text-sm font-medium text-success-foreground">已连接</span>
            <span className="text-xs text-success-foreground">{connectedDevices} 个设备</span>
            <Lock className="h-3 w-3 text-success-foreground" />
            <span className="text-xs text-success-foreground">E2E 加密</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-gray-100 border border-gray-200">
            <div className="h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-sm font-medium text-gray-600">未连接</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="h-16 px-6 border-t border-gray-200 flex items-center justify-end">
        <button
          onClick={onDisconnect}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-danger-bg text-danger border border-danger-border hover:opacity-90 transition-opacity"
        >
          <Unplug className="h-[14px] w-[14px]" />
          <span className="text-sm font-medium">断开连接</span>
        </button>
      </div>
    </BrandDialogContent>
  )
})
RemoteDialogContent.displayName = "RemoteDialogContent"

const RemoteDialog = React.forwardRef<
  React.ElementRef<typeof BrandDialog>,
  React.ComponentPropsWithoutRef<typeof BrandDialog> & RemoteDialogProps
>(({ open, onOpenChange, ...props }, ref) => {
  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <RemoteDialogContent ref={ref} {...props} />
    </BrandDialog>
  )
})
RemoteDialog.displayName = "RemoteDialog"

export { RemoteDialog, RemoteDialogContent }
