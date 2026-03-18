/**
 * RegenerateButton - 重新发送用户消息按钮
 */

import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

interface RegenerateButtonProps {
  /** 用户消息ID */
  userMessageId: string
  /** 用户消息内容（用于确认提示）*/
  messageContent: string
  /** 对话框ID */
  conversationId: string
  /** 触发重新生成的回调 */
  onRegenerate: (userMessageId: string) => void
  /** 禁用状态 */
  disabled?: boolean
}

export function RegenerateButton({
  userMessageId,
  onRegenerate,
  disabled = false,
}: RegenerateButtonProps) {
  const handleClick = () => {
    // 显示确认 toast
    toast.warning('确定要重新发送这条消息吗？当前回复将被替换', {
      action: {
        label: '确认',
        onClick: () => onRegenerate(userMessageId),
      },
      cancel: {
        label: '取消',
        onClick: () => {},
      },
      duration: 5000,
    })
  }

  return (
    <button
      type="button"
      className="inline-flex items-center rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
      disabled={disabled}
      onClick={handleClick}
      title="重新发送"
      aria-label="重新发送此消息"
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </button>
  )
}
