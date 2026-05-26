/**
 * TTSButton - Text-to-Speech button for assistant messages.
 *
 * Uses the browser extension's Edge TTS bridge to synthesize speech.
 * Shows a speaker icon that toggles between play and stop states.
 * Only visible when TTS is enabled in experimental settings and
 * the browser extension is installed.
 */

import { useState, useCallback } from 'react'
import { Volume2, VolumeX, Loader2 } from 'lucide-react'
import removeMarkdown from 'remove-markdown'

interface TTSButtonProps {
  /** Text content to speak (may contain markdown) */
  content: string
  /** Optional CSS class name */
  className?: string
  /** Voice to use for synthesis */
  voice?: string
}

type PlaybackState = 'idle' | 'loading' | 'playing'

export function TTSButton({ content, className, voice }: TTSButtonProps) {
  const [state, setState] = useState<PlaybackState>('idle')

  const handleClick = useCallback(async () => {
    const bridge = (window as any).__agentWeb
    if (!bridge?.ttsPlay) return

    if (state === 'playing') {
      bridge.ttsStop?.()
      setState('idle')
      return
    }

    if (state === 'loading') return

    // Strip markdown before sending to TTS
    const plainText = removeMarkdown(content)

    setState('loading')
    try {
      const result = await bridge.ttsPlay(plainText, {
        voice: voice || 'zh-CN-XiaoxiaoNeural',
      })
      if (result?.ok && result?.playing) {
        setState('playing')

        const audio = (window as any).__ttsAudio as HTMLAudioElement | undefined
        if (audio) {
          const onEnd = () => {
            setState('idle')
            audio.removeEventListener('ended', onEnd)
          }
          audio.addEventListener('ended', onEnd)
        }
      } else {
        setState('idle')
      }
    } catch (err) {
      console.error('[TTSButton] Synthesis failed:', err)
      setState('idle')
    }
  }, [content, voice, state])

  const icon =
    state === 'loading' ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : state === 'playing' ? (
      <VolumeX className="h-3.5 w-3.5" />
    ) : (
      <Volume2 className="h-3.5 w-3.5" />
    )

  const title =
    state === 'loading'
      ? 'Loading...'
      : state === 'playing'
        ? 'Stop TTS'
        : 'Read aloud'

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 ${className || ''}`}
      title={title}
      aria-label={title}
    >
      {icon}
    </button>
  )
}
