/**
 * ConversationEmptyState — placeholder when no messages exist.
 */

import { MessageSquare } from 'lucide-react'
import { useT } from '@/i18n'

export function ConversationEmptyState() {
  const t = useT()

  return (
    <div className="flex h-full items-center justify-center">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-xl shadow-primary-500/20">
            <MessageSquare className="h-8 w-8 text-white" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t('conversation.empty.title')}
          </h3>
          <p className="max-w-md text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t('conversation.empty.description')}
          </p>
        </div>
      </div>
    </div>
  )
}
