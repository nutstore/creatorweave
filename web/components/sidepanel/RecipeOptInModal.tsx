'use client'

/**
 * RecipeOptInModal — one-time consent dialog when the side panel opens on a
 * site that hosts one of the extension's built-in recipes (jmail.world
 * archive / JMessage).
 *
 * Flow:
 *   1. AppBootstrap (side-panel mode, storage ready) calls
 *      `getPendingRecipePrompt()` after a short delay (let the workspace
 *      render first — the modal must not race the project route).
 *   2. If the bound upstream tab hosts an unenabled recipe AND the user has
 *      not recently dismissed it → this modal renders.
 *   3. "Enable and reload" → `enableRecipeAndReload()` flips the extension-side
 *      consent switch (chrome.storage.local, same map as the recipes.html
 *      management page) and reloads the upstream page so injection is
 *      guaranteed to take effect. Success toast explains what happened.
 *   4. "Not now" → 1-day local cooldown, no nagging on every panel open.
 *
 * The web app never persists consent itself — extension storage is the
 * single source of truth (revocable in the extension popup / recipes page).
 * This is purely an accelerator for the consent UX.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/i18n'
import {
  dismissRecipePrompt,
  enableRecipeAndReload,
  type RecipePromptInfo,
} from '@/agent/sidepanel-recipe-prompt'

export interface RecipeOptInModalProps {
  recipe: RecipePromptInfo
  onClose: () => void
}

export function RecipeOptInModal({ recipe, onClose }: RecipeOptInModalProps) {
  const t = useT()
  const [enableOnConfirm, setEnableOnConfirm] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (!enableOnConfirm) {
      // User unticked the switch → treat as an explicit "not now".
      dismissRecipePrompt(recipe.id)
      onClose()
      return
    }
    setSubmitting(true)
    const ok = await enableRecipeAndReload(recipe.id)
    setSubmitting(false)
    if (ok) {
      toast.success(t('sidePanelRecipe.enabledToast', { name: recipe.displayName }))
      onClose()
    } else {
      // Bridge failure — likely a stale extension. Do NOT record a
      // dismissal: the user explicitly wanted to ENABLE, and cooling the
      // prompt down would hide a transient failure for a whole day
      // (it also raced the extension reload in the douban host-switch
      // flow). Keep the modal open so the user can retry.
      toast.error(t('sidePanelRecipe.enableFailedToast'))
    }
  }

  const handleDismiss = () => {
    dismissRecipePrompt(recipe.id)
    onClose()
  }

  return (
    // Backdrop deliberately has no onClick (mirrors ToolAuthModal): an
    // accidental outside click must not be recorded as a consent decision.
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('sidePanelRecipe.title')}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl dark:bg-primary-50/50">
              <span aria-hidden="true">{recipe.glyph}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t('sidePanelRecipe.title')}
              </h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {recipe.hostname}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground">
            {t('sidePanelRecipe.description', { name: recipe.displayName, count: recipe.toolCount })}
          </p>
          <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">{recipe.displayName}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{recipe.description}</p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {t('sidePanelRecipe.privacyNote')}
          </p>

          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span className="text-sm text-foreground">{t('sidePanelRecipe.enableToggle')}</span>
            <Switch checked={enableOnConfirm} onCheckedChange={setEnableOnConfirm} />
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            type="button"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDismiss}
            disabled={submitting}
          >
            {t('sidePanelRecipe.notNow')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {submitting ? t('sidePanelRecipe.enabling') : t('sidePanelRecipe.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
