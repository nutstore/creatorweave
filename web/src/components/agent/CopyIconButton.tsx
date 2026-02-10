/**
 * CopyIconButton - Icon-only copy button with visual feedback.
 *
 * Shows a copy icon that changes to a checkmark briefly after successful copy.
 * Designed for tool call panels where users want quick copying of parameters
 * and results for debugging and sharing.
 */

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyIconButtonProps {
  /** Content to copy to clipboard */
  content: string
  /** Optional CSS class name */
  className?: string
  /** Button title/tooltip, defaults to "复制" */
  title?: string
  /** Icon size class, defaults to "w-3 h-3" */
  iconSize?: string
}

export function CopyIconButton({
  content,
  className,
  title = '复制',
  iconSize = 'w-3 h-3',
}: CopyIconButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors ${className || ''}`}
      title={copied ? '已复制' : title}
      aria-label={copied ? '已复制' : title}
    >
      {copied ? (
        <Check className={iconSize} />
      ) : (
        <Copy className={iconSize} />
      )}
    </button>
  )
}
