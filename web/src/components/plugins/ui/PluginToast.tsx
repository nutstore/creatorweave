/**
 * PluginToast - Toast notification wrapper using sonner
 * Used when plugins call CreatorWeave.notify.toast()
 *
 * This provides a compatibility layer that wraps sonner's toast API
 * to match the existing plugin API interface.
 */

import { toast } from 'sonner'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
}

// Map our toast types to sonner types
const sonnerTypeMap: Record<ToastType, 'success' | 'error' | 'warning' | 'info'> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
}

/**
 * Show a toast notification
 * @param message - The message to display
 * @param type - The type of toast (info, success, warning, error)
 * @returns toast ID that can be used to dismiss the toast
 */
export function showToast(message: string, type: ToastType = 'info'): string {
  const id = toast[sonnerTypeMap[type]](message)
  return String(id)
}

/**
 * Dismiss a toast by ID
 * @param id - The toast ID to dismiss
 */
export function closeToast(id: string): void {
  toast.dismiss(id)
}

/**
 * Dismiss all toasts
 */
export function closeAllToasts(): void {
  toast.dismiss()
}
