/**
 * TTSQueueIndicator — shows auto-play TTS state with stop/clear controls.
 *
 * Appears above the composer when the TTS queue is active (playing or has queued items).
 * Only visible for the active workspace.
 *
 * States:
 * - idle + queue empty → hidden
 * - playing → "🔊 Playing..." + [⏹ Stop]
 * - playing + queued → "🔊 Playing (2 queued)" + [⏹ Stop] [✕ Clear]
 * - idle + queued items (edge case) → briefly visible then auto-plays
 */

import { memo, useEffect, useState } from 'react'
import { Volume2, Square, X } from 'lucide-react'
import { ttsQueue, type TTSQueueState } from './tts-queue'
import { useSettingsStore } from '@/store/settings.store'
import { useT } from '@/i18n'

export const TTSQueueIndicator = memo(function TTSQueueIndicator() {
  const t = useT()
  const enableTTS = useSettingsStore((s) => s.enableTTS)
  const autoPlayTTS = useSettingsStore((s) => s.autoPlayTTS)

  const [queueInfo, setQueueInfo] = useState<{ state: TTSQueueState; queueLength: number }>({
    state: 'idle',
    queueLength: 0,
  })

  useEffect(() => {
    // Poll queue state — lightweight, runs only when visible
    const interval = setInterval(() => {
      const { state, queueLength } = ttsQueue.getState()
      setQueueInfo({ state, queueLength })
    }, 300)
    return () => clearInterval(interval)
  }, [])

  // Don't render if TTS auto-play is disabled or queue is empty+idle
  if (!enableTTS || !autoPlayTTS) return null
  if (queueInfo.state === 'idle' && queueInfo.queueLength === 0) return null

  const isPlaying = queueInfo.state === 'playing'
  const hasQueued = queueInfo.queueLength > 0

  return (
    <div className="mx-auto flex max-w-3xl items-center gap-2 pb-1.5">
      <div
        className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        role="status"
        aria-live="polite"
      >
        {/* Playing indicator with pulse animation */}
        <span className="flex items-center gap-1.5">
          <Volume2 className={`h-3.5 w-3.5 ${isPlaying ? 'animate-pulse text-blue-500' : 'text-neutral-400'}`} />
          <span className="font-medium">
            {isPlaying
              ? hasQueued
                ? t('agent.ttsQueue.playingWithQueue', { count: queueInfo.queueLength })
                : t('agent.ttsQueue.playing')
              : queueInfo.queueLength > 0
                ? t('agent.ttsQueue.queued', { count: queueInfo.queueLength })
                : ''}
          </span>
        </span>

        {/* Stop button — stops current playback + clears remaining queue */}
        <button
          type="button"
          onClick={() => ttsQueue.flush()}
          className="ml-1 inline-flex items-center gap-1 rounded-md bg-neutral-200 px-2 py-0.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
          title={t('agent.ttsQueue.stop')}
          aria-label={t('agent.ttsQueue.stop')}
        >
          <Square className="h-2.5 w-2.5 fill-current" />
          Stop
        </button>

        {/* Clear queue button — only when there are queued items beyond current */}
        {hasQueued && (
          <button
            type="button"
            onClick={() => ttsQueue.flush()}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            title={t('agent.ttsQueue.clear')}
            aria-label={t('agent.ttsQueue.clear')}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
})
