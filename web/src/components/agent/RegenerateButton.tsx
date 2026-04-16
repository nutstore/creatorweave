/**
 * RegenerateButton - Button to resend user message
 */

import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/i18n'

interface RegenerateButtonProps {
  /** User message ID */
  userMessageId: string
  /** User message content (for confirmation prompt) */
  messageContent: string
  /** Conversation ID */
  conversationId: string
  /** Callback to trigger regeneration */
  onRegenerate: (userMessageId: string) => void
  /** Callback to cancel current streaming output */
  onCancel?: () => void
  /** Disabled state */
  disabled?: boolean
  /** Whether is currently streaming output */
  isRunning?: boolean
}

export function RegenerateButton({
  userMessageId,
  onRegenerate,
  onCancel,
  disabled = false,
  isRunning = false,
}: RegenerateButtonProps) {
  const t = useT()
  const handleClick = () => {
    if (isRunning) {
      onCancel?.()
      setTimeout(() => {
        onRegenerate(userMessageId)
      }, 100)
    } else {
      toast.warning(t('conversation.regenerateConfirmMessage'), {
        action: {
          label: t('conversation.regenerateConfirmAction'),
          onClick: () => onRegenerate(userMessageId),
        },
        cancel: {
          label: t('conversation.regenerateCancelAction'),
          onClick: () => {},
        },
        duration: 5000,
      })
    }
  }

  return (
    <button
      type="button"
      className="inline-flex items-center rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
      disabled={disabled}
      onClick={handleClick}
      title={isRunning ? t('conversation.stopAndResend') : t('conversation.resend')}
      aria-label={isRunning ? t('conversation.stopAndResendMessage') : t('conversation.resendMessage')}
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </button>
  )
}
