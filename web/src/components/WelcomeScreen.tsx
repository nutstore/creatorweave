/**
 * WelcomeScreen - Clean onboarding screen with rich text input
 *
 * Uses AgentRichInput (same as workspace bottom input) for consistent UX.
 * File attachments are stored in useAssetStore and carried over when
 * the conversation starts.
 *
 * When no API key is configured, shows a model setup card instead of a
 * disabled input — guiding users to either login with 坚果云 AI or
 * configure their own API Key.
 */

import { useState, useCallback, useEffect } from 'react'
import { Send, FolderOpen, Sparkles, KeyRound, ChevronRight, Shield, Loader2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/store/settings.store'
import { useFolderAccessStore } from '@/store/folder-access.store'
import { useAssetStore } from '@/store/asset.store'
import { useT } from '@/i18n'
import { AgentRichInput, type AgentRichInputValue, type AgentInfo } from './agent/AgentRichInput'
import type { FileMentionItem } from './agent/FileMentionExtension'
import { useGatewayLogin, isLLMGatewayConfigured } from '@/hooks/useGatewayLogin'
import { DeviceCodeFlowDialog } from './agent/DeviceCodeFlowDialog'
import { PageScreenshotCropDialog } from './agent/PageScreenshotCropDialog'
import type { SettingsTab } from '@/components/settings/SettingsDialog'
import { supportsImageInput } from '@/agent/llm/pi-ai-model-resolver'
import { captureTab, isPageActionAvailable } from '@/agent/tools/page-action-bridge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@creatorweave/ui'

interface WelcomeScreenProps {
  onStartConversation: (text: string) => void
  /** Open the settings dialog, optionally jumping to a specific tab
   *  (e.g. 'llm' for API key configuration). */
  onOpenSettings?: (tab?: SettingsTab) => void
  /** Called after gateway login succeeds so parent can trigger onboarding */
  onGatewayLoginSuccess?: () => void
}

export function WelcomeScreen({ onStartConversation, onOpenSettings, onGatewayLoginSuccess }: WelcomeScreenProps) {
  const [inputValue, setInputValue] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false)
  const hasApiKey = useSettingsStore((s) => s.hasApiKey)
  // `hasApiKeyLoaded` distinguishes "we know there's no API key" from
  // "we haven't checked yet (default false)". Without this gate the setup
  // card would flash briefly during the initial async check before
  // `hasApiKey` is reconciled with the SQLite-backed truth.
  const hasApiKeyLoaded = useSettingsStore((s) => s.hasApiKeyLoaded)
  const checkHasApiKey = useSettingsStore((s) => s.checkHasApiKey)
  const modelName = useSettingsStore((s) => s.modelName)
  // Folder state lives in useFolderAccessStore (single source of truth shared
  // with TopBar's FolderSelector + WorkspaceLayout's FolderTipBubble). Using
  // useAgentStore.directoryHandle here was a dead write — nobody else read
  // it, so the button click was silently dropped.
  const folderRoots = useFolderAccessStore((s) => s.roots)
  const addRoot = useFolderAccessStore((s) => s.addRoot)
  const t = useT()
  const gatewayAvailable = isLLMGatewayConfigured()
  const supportsVision = supportsImageInput(modelName)
  const canCaptureScreenshot = supportsVision && isPageActionAvailable()
  const screenshotLabel = !supportsVision
    ? t('agent.vision.unsupported')
    : canCaptureScreenshot
      ? t('agent.vision.capture')
      : t('agent.vision.supported')

  // Self-trigger the API-key check on mount. We can't rely on TopBar's
  // `useHasApiKey()` hook to do it for us, because that hook may run on
  // a later tick (or not at all if TopBar isn't mounted yet). The check
  // itself is idempotent — it caches results in `apiKeyCache`.
  useEffect(() => {
    void checkHasApiKey().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[WelcomeScreen] checkHasApiKey failed:', err)
    })
  }, [checkHasApiKey])

  const { authState, isRunning: isGatewayLoginRunning, login: gatewayLogin, reset: resetGatewayLogin } = useGatewayLogin()

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    // Do NOT increment resetToken here — that would trigger clearAll() on
    // pending assets. Since the welcome screen unmounts immediately after
    // starting a conversation, the assets are preserved in useAssetStore
    // and picked up by useInitialMessage in ConversationView.
    onStartConversation(text)
    setInputValue('')
  }, [inputValue, onStartConversation])

  const handleSelectFolder = useCallback(async () => {
    try {
      await addRoot()
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }, [addRoot])

  const handleInputChange = useCallback(
    ({ text }: AgentRichInputValue) => {
      setInputValue(text)
    },
    [],
  )

  const handleCaptureScreenshot = useCallback(async () => {
    if (!canCaptureScreenshot || isCapturingScreenshot) return
    setIsCapturingScreenshot(true)
    try {
      const result = await captureTab('png')
      if (!result.ok || !result.dataUrl) {
        throw new Error(result.error || t('agent.pageScreenshot.captureFailed'))
      }
      setScreenshotDataUrl(result.dataUrl)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agent.pageScreenshot.captureFailed'))
    } finally {
      setIsCapturingScreenshot(false)
    }
  }, [canCaptureScreenshot, isCapturingScreenshot, t])

  const handleScreenshotConfirm = useCallback((file: File) => {
    useAssetStore.getState().addFiles([file])
    setScreenshotDataUrl(null)
  }, [])

  // Minimal file search handler — returns empty for welcome screen
  // (file search requires an active conversation workspace)
  const handleSearchFiles = useCallback(
    async (_query: string): Promise<FileMentionItem[]> => [],
    [],
  )

  // ── Render state machine ─────────────────────────────────────────────
  // Three exclusive states:
  //   - loading   : checkHasApiKey is in-flight; show a small spinner.
  //   - setupCard : check complete and there is no API key → show the
  //                 gateway-login / API-key options.
  //   - input     : check complete and an API key is configured → show
  //                 the rich input.
  const isLoading = !hasApiKeyLoaded
  const showSetupCard = hasApiKeyLoaded && !hasApiKey

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-4 dark:bg-neutral-950">
      <div className="w-full max-w-2xl">
        {/* Logo & Tagline */}
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50/80 shadow-sm">
            <Sparkles className="h-6 w-6 text-primary-600" />
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-neutral-900 dark:text-neutral-100">
            {t('welcome.title')}
          </h1>
          <p className="text-base text-neutral-500 dark:text-neutral-400">{t('welcome.tagline')}</p>
        </div>

        {isLoading ? (
          /* ── Loading state — check is still in-flight ── */
          <div
            role="status"
            aria-live="polite"
            className="flex h-32 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Loader2 className="h-4 w-4 animate-spin text-neutral-400 dark:text-neutral-500" />
            <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">
              {t('welcome.checkingConfig')}
            </span>
          </div>
        ) : showSetupCard ? (
          /* ── Model Setup Card ── */
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50 text-left dark:border-amber-800/50 dark:bg-amber-950/10">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-amber-200/60 px-4 py-3 dark:border-amber-800/40">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {t('welcome.setupCardTitle')}
              </p>
            </div>

            {/* Option A: 坚果云 AI login (only when gateway configured) */}
            {gatewayAvailable && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await gatewayLogin()
                  if (ok) onGatewayLoginSuccess?.()
                }}
                disabled={isGatewayLoginRunning}
                className="flex w-full items-center gap-3 border-b border-amber-200/60 px-4 py-3.5 text-left transition-colors hover:bg-white/60 disabled:opacity-60 dark:border-amber-800/40 dark:hover:bg-neutral-900/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/40">
                  <Shield className="h-[18px] w-[18px] text-primary-600 dark:text-primary-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {t('welcome.setupGatewayTitle')}
                    </span>
                    <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {t('welcome.setupGatewayRecommend')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {t('welcome.setupGatewayDesc')}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
              </button>
            )}

            {/* Option B: Configure API Key */}
            <button
              type="button"
              onClick={() => onOpenSettings?.('llm')}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/60 dark:hover:bg-neutral-900/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                <KeyRound className="h-[18px] w-[18px] text-neutral-600 dark:text-neutral-400" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {t('welcome.setupApiKeyTitle')}
                </span>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {t('welcome.setupApiKeyDesc')}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
            </button>
          </div>
        ) : (
          /* ── Active input (API key configured) ── */
          <div className="relative mb-6" data-tour="welcome-input">
            <AgentRichInput
              placeholder={t('welcome.placeholder')}
              ariaLabel={t('conversation.input.ariaLabel')}
              agents={[]}
              onSearchFiles={handleSearchFiles}
              activeAgentId={null}
              allAgents={[]}
              onSetActiveAgent={async () => {}}
              onCreateAgent={async (_id: string): Promise<AgentInfo | null> => null}
              onDeleteAgent={async () => false}
              onChange={handleInputChange}
              onSubmit={handleSubmit}
            />
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="absolute bottom-4 right-14 z-10 inline-flex">
                    <button
                      type="button"
                      aria-label={screenshotLabel}
                      disabled={!canCaptureScreenshot || isCapturingScreenshot}
                      onClick={() => void handleCaptureScreenshot()}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed ${
                        supportsVision
                          ? 'border-primary-200 bg-primary-50 text-primary-600 dark:border-primary-800/70 dark:bg-primary-950/40 dark:text-primary-300'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600'
                      }`}
                    >
                      {isCapturingScreenshot
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>{screenshotLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className="absolute bottom-4 right-4 z-10 rounded-xl bg-primary-600 p-2 text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-30 disabled:hover:bg-primary-600"
              title={t('welcome.send')}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
      )}

      {screenshotDataUrl && (
        <PageScreenshotCropDialog
          imageDataUrl={screenshotDataUrl}
          onConfirm={handleScreenshotConfirm}
          onCancel={() => setScreenshotDataUrl(null)}
        />
      )}

      {/* Optional file context — placed directly after the primary input. */}
      {showSetupCard ? null : hasApiKey && folderRoots.length === 0 && (
          <div className="mt-5 flex flex-col items-center">
            <button
              type="button"
              onClick={handleSelectFolder}
              data-tour="welcome-open-folder"
              className="flex h-9 items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/70 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100/70 dark:border-primary-800/70 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-950/50"
            >
              <FolderOpen className="h-4 w-4" />
              {t('onboarding.steps.files.title')}
            </button>
            <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {t('agent.folderTip.description')}
            </p>
          </div>
        )}

      {/* Local-first privacy hint is supporting information, not the primary action. */}
      {!isLoading && (
        <p className="mt-7 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          {t('welcome.setupLocalFirstHint')}
        </p>
      )}

      </div>

      {/* Device Code Flow Dialog */}
      <DeviceCodeFlowDialog
        open={!!authState}
        authState={authState}
        onClose={resetGatewayLogin}
      />
    </div>
  )
}
