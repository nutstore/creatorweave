/* eslint-disable react-refresh/only-export-components */
/**
 * Onboarding Tour - first-time user walkthrough.
 *
 * Features:
 * - Multi-step tour highlighting key features
 * - Skip and "Don't show again" options
 * - Persist completion status
 * - Smooth animations
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useT, useLocale } from '@/i18n'
import { t as staticT, DEFAULT_LOCALE, type Locale } from '@creatorweave/i18n'

export interface TourStep {
  id: string
  title: string
  description: string
  target?: string // CSS selector for target element
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  action?: () => void // Action to perform when step is shown
}

interface OnboardingTourProps {
  steps?: TourStep[]
  onComplete?: () => void
  onSkip?: () => void
  autoStart?: boolean
  showAgain?: boolean
}

export function OnboardingTour({
  steps: propSteps,
  onComplete,
  onSkip,
  autoStart = false,
  showAgain = false,
}: OnboardingTourProps) {
  const t = useT()
  const [locale] = useLocale()
  const { onboardingCompleted, setOnboardingCompleted } = useWorkspacePreferencesStore()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  // Get tour steps based on current language
  const steps = useMemo(() => {
    if (propSteps) return propSteps
    return getDefaultOnboardingSteps(locale)
  }, [propSteps, locale])

  // Check if we should show the tour
  useEffect(() => {
    if (autoStart && !onboardingCompleted) {
      setIsOpen(true)
    } else if (showAgain) {
      setIsOpen(true)
    }
  }, [autoStart, onboardingCompleted, showAgain])

  // Highlight target element
  useEffect(() => {
    const step = steps[currentStepIndex]
    if (!step?.target || !isOpen) {
      // Remove all highlights
      document.querySelectorAll('[data-tour-highlight]').forEach((el) => {
        el.removeAttribute('data-tour-highlight')
        el.removeAttribute('data-tour-highlight-z-index')
      })
      return
    }

    // Remove previous highlight
    document.querySelectorAll('[data-tour-highlight]').forEach((el) => {
      el.removeAttribute('data-tour-highlight')
      el.removeAttribute('data-tour-highlight-z-index')
    })

    // Add highlight to current target
    const target = document.querySelector(step.target) as HTMLElement
    if (target) {
      target.setAttribute('data-tour-highlight', 'true')
      target.setAttribute('data-tour-highlight-z-index', target.style.zIndex)
      target.style.zIndex = '9998'
    }

    return () => {
      // Cleanup on unmount or step change
      document.querySelectorAll('[data-tour-highlight]').forEach((el) => {
        const element = el as HTMLElement
        const originalZIndex = element.getAttribute('data-tour-highlight-z-index')
        element.style.zIndex = originalZIndex || ''
        element.removeAttribute('data-tour-highlight')
        element.removeAttribute('data-tour-highlight-z-index')
      })
    }
  }, [currentStepIndex, steps, isOpen])

  const currentStep = steps[currentStepIndex]
  const isLastStep = currentStepIndex === steps.length - 1
  const isFirstStep = currentStepIndex === 0
  const stepProgressText = t('onboarding.stepProgress', {
    current: currentStepIndex + 1,
    total: steps.length,
  })

  const handleComplete = useCallback(() => {
    // Fix: Always save state when completing tour, regardless of "don't show again" checkbox
    setOnboardingCompleted(true)
    setIsOpen(false)
    setCurrentStepIndex(0)
    onComplete?.()
  }, [setOnboardingCompleted, onComplete])

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleComplete()
    } else {
      currentStep?.action?.()
      setCurrentStepIndex((prev) => prev + 1)
    }
  }, [currentStep, isLastStep, handleComplete])

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }, [isFirstStep])

  const handleSkip = useCallback(() => {
    // Fix: Always save state when skipping tour, regardless of "don't show again" checkbox
    setOnboardingCompleted(true)
    setIsOpen(false)
    setCurrentStepIndex(0)
    onSkip?.()
  }, [setOnboardingCompleted, onSkip])

  if (!isOpen || !currentStep) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9999] bg-black/50" />

      {/* Tour dialog */}
      <div className="fixed z-[10000] flex items-center justify-center p-4">
        <div className="border-subtle w-[400px] max-w-[90vw] rounded-lg border bg-white shadow-xl dark:bg-neutral-900">
          {/* Header */}
          <div className="border-subtle flex items-start justify-between border-b px-4 py-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  {currentStep.title}
                </h3>
              </div>
              <div className="mt-1 text-sm text-neutral-500">{currentStep.description}</div>
            </div>
            <button
              onClick={handleSkip}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress */}
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1 flex-1 rounded-full ${
                    index <= currentStepIndex
                      ? 'bg-primary-500'
                      : 'bg-neutral-200 dark:bg-neutral-700'
                  }`}
                />
              ))}
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              {stepProgressText === 'onboarding.stepProgress'
                ? `Step ${currentStepIndex + 1} of ${steps.length}`
                : stepProgressText}
            </div>
          </div>

          {/* Content placeholder - can be customized */}
          <div className="px-4 py-3">{/* Step content can be rendered here */}</div>

          {/* Footer */}
          <div className="border-subtle flex items-center justify-between border-t px-4 py-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
              {t('onboarding.dontShowAgain') || "Don't show again"}
            </label>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <BrandButton variant="ghost" onClick={handlePrevious}>
                  <ChevronLeft className="h-4 w-4" />
                  {t('onboarding.previous') || 'Previous'}
                </BrandButton>
              )}

              <BrandButton variant={isLastStep ? 'default' : 'primary'} onClick={handleNext}>
                {isLastStep ? (
                  <>
                    <Check className="h-4 w-4" />
                    {t('onboarding.complete') || 'Complete'}
                  </>
                ) : (
                  <>
                    {t('onboarding.next') || 'Next'}
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </BrandButton>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Static translation function (for module level)
 */
function getStepTitle(locale: Locale, step: string, fallback: string): string {
  const key = `onboarding.steps.${step}.title` as const
  const result = staticT(locale, key)
  return result === key ? fallback : result
}

function getStepDescription(locale: Locale, step: string, fallback: string): string {
  const key = `onboarding.steps.${step}.description` as const
  const result = staticT(locale, key)
  return result === key ? fallback : result
}

/**
 * Get default tour steps for a given locale
 */
export function getDefaultOnboardingSteps(locale: Locale = DEFAULT_LOCALE): TourStep[] {
  return [
    {
      id: 'welcome',
      title: getStepTitle(locale, 'welcome', 'Welcome to CreatorWeave!'),
      description: getStepDescription(locale, 'welcome', 'Let us show you around the key features.'),
      position: 'center',
    },
    {
      id: 'conversations',
      title: getStepTitle(locale, 'conversations', 'Conversations'),
      description: getStepDescription(
        locale,
        'conversations',
        'Interact with AI using natural language. Each conversation has its own workspace.'
      ),
      target: '[data-tour="conversations"]',
      position: 'right',
    },
    {
      id: 'file-tree',
      title: getStepTitle(locale, 'fileTree', 'File Browser'),
      description: getStepDescription(
        locale,
        'fileTree',
        'Browse your project files and folders. Click any file to preview its contents.'
      ),
      target: '[data-tour="file-tree"]',
      position: 'right',
    },
    {
      id: 'skills',
      title: getStepTitle(locale, 'skills', 'Skills'),
      description: getStepDescription(
        locale,
        'skills',
        'Manage and execute reusable skills for common tasks.'
      ),
      target: '[data-tour="skills"]',
      position: 'bottom',
    },
    {
      id: 'multiAgent',
      title: getStepTitle(locale, 'multiAgent', 'Multi-Agent'),
      description: getStepDescription(
        locale,
        'multiAgent',
        'Create multiple AI agents to work together on complex tasks.'
      ),
      position: 'center',
    },
    {
      id: 'tools',
      title: getStepTitle(locale, 'tools', 'Tools Panel'),
      description: getStepDescription(
        locale,
        'tools',
        'Access quick actions, reasoning visualization, and smart suggestions.'
      ),
      target: '[data-tour="tools"]',
      position: 'bottom',
    },
    {
      id: 'complete',
      title: getStepTitle(locale, 'complete', 'All Set!'),
      description: getStepDescription(
        locale,
        'complete',
        'You can always access these features from the toolbar or keyboard shortcuts.'
      ),
      position: 'center',
    },
  ]
}

/**
 * Default tour steps for first-time users (English fallback)
 */
export const DEFAULT_ONBOARDING_STEPS: TourStep[] = getDefaultOnboardingSteps('en-US')
