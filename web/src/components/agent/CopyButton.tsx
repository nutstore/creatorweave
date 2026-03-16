/**
 * CopyButton - a small copy-to-clipboard button with visual feedback.
 *
 * Shows a copy icon that changes to a checkmark briefly after successful copy.
 */

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  /** Content to copy to clipboard */
  content: string
  /** Optional CSS class name */
  className?: string
  /** Button title/tooltip */
  title?: string
}

export function CopyButton({ content, className, title = '复制' }: CopyButtonProps) {
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
      className={`inline-flex items-center rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 ${className || ''}`}
      title={copied ? '已复制' : title}
      aria-label={copied ? '已复制' : title}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
