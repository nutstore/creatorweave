import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Module mocks ──
// The binding id comes from the side-panel context module; the bridge is a
// global. Both are controlled per-test below.
const getSidePanelBindingIdMock = vi.fn<() => string | null>(() => null)

vi.mock('@/agent/workspace-assistant-context', () => ({
  getSidePanelBindingId: () => getSidePanelBindingIdMock(),
}))

import {
  dismissRecipePrompt,
  enableRecipeAndReload,
  getPendingRecipePrompt,
  isRecipePromptDismissed,
  resetRecipePromptDismissals,
  type RecipePromptStatus,
} from '../sidepanel-recipe-prompt'

type AgentWebShape = {
  recipeCheckStatus?: (binding: string) => Promise<RecipePromptStatus>
  recipeEnable?: (binding: string, recipeId: string) => Promise<{ ok?: boolean; error?: string }>
}

function setAgentWeb(agentWeb: AgentWebShape | undefined): void {
  ;(globalThis as { __agentWeb?: AgentWebShape }).__agentWeb = agentWeb
}

function okStatus(overrides: Partial<RecipePromptStatus> = {}): RecipePromptStatus {
  return {
    ok: true,
    applicable: true,
    enabled: false,
    recipe: {
      id: 'jmessage-world',
      displayName: 'JMessage — Epstein iMessage Archive',
      description: 'Search and read iMessage threads.',
      glyph: '💬',
      hostname: 'jmail.world',
      toolCount: 3,
    },
    ...overrides,
  }
}

describe('getPendingRecipePrompt', () => {
  beforeEach(() => {
    getSidePanelBindingIdMock.mockReturnValue(null)
    setAgentWeb(undefined)
    resetRecipePromptDismissals()
  })

  it('returns null when not in side-panel mode (no binding)', async () => {
    const result = await getPendingRecipePrompt()
    expect(result).toBeNull()
  })

  it('returns null when the extension bridge is unavailable', async () => {
    getSidePanelBindingIdMock.mockReturnValue('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b')
    const result = await getPendingRecipePrompt()
    expect(result).toBeNull()
  })

  it('returns null when no recipe matches the bound tab (applicable: false)', async () => {
    getSidePanelBindingIdMock.mockReturnValue('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b')
    setAgentWeb({
      recipeCheckStatus: vi.fn().mockResolvedValue({ ok: true, applicable: false }),
    })
    const result = await getPendingRecipePrompt()
    expect(result).toBeNull()
  })

  it('returns null when the bridge reports a failure (ok: false)', async () => {
    getSidePanelBindingIdMock.mockReturnValue('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b')
    setAgentWeb({
      recipeCheckStatus: vi.fn().mockResolvedValue({ ok: false, applicable: false, errorCode: 'UNAUTHORIZED_TARGET' }),
    })
    const result = await getPendingRecipePrompt()
    expect(result).toBeNull()
  })

  it('returns null when the recipe is already enabled extension-side', async () => {
    getSidePanelBindingIdMock.mockReturnValue('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b')
    setAgentWeb({
      recipeCheckStatus: vi.fn().mockResolvedValue(okStatus({ enabled: true })),
    })
    const result = await getPendingRecipePrompt()
    expect(result).toBeNull()
  })

  it('returns the recipe when applicable, unenabled and not dismissed', async () => {
    const binding = '7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b'
    getSidePanelBindingIdMock.mockReturnValue(binding)
    const checkStatus = vi.fn().mockResolvedValue(okStatus())
    setAgentWeb({ recipeCheckStatus: checkStatus })

    const result = await getPendingRecipePrompt()
    expect(checkStatus).toHaveBeenCalledWith(binding)
    expect(result).not.toBeNull()
    expect(result?.applicable).toBe(true)
    expect(result?.recipe?.id).toBe('jmessage-world')
    expect(result?.enabled).toBe(false)
  })

  it('returns null while the 30-day dismissal cooldown is active, and again afterwards', async () => {
    getSidePanelBindingIdMock.mockReturnValue('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b')
    setAgentWeb({
      recipeCheckStatus: vi.fn().mockResolvedValue(okStatus()),
    })

    dismissRecipePrompt('jmessage-world')
    expect(await getPendingRecipePrompt()).toBeNull()

    // Simulate cooldown expiry: backdate the dismissal past 30 days.
    const raw = localStorage.getItem('cw_sidepanel_recipe_dismissed_v1')!
    const map = JSON.parse(raw) as Record<string, number>
    map['jmessage-world'] = Date.now() - 31 * 24 * 60 * 60 * 1000
    localStorage.setItem('cw_sidepanel_recipe_dismissed_v1', JSON.stringify(map))

    expect(isRecipePromptDismissed('jmessage-world')).toBe(false)
    const result = await getPendingRecipePrompt()
    expect(result?.recipe?.id).toBe('jmessage-world')
  })

  it('resolves null when the bridge probe rejects (never throws)', async () => {
    getSidePanelBindingIdMock.mockReturnValue('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b')
    setAgentWeb({
      recipeCheckStatus: vi.fn().mockRejectedValue(new Error('bridge gone')),
    })
    const result = await getPendingRecipePrompt()
    expect(result).toBeNull()
  })
})

describe('enableRecipeAndReload', () => {
  beforeEach(() => {
    getSidePanelBindingIdMock.mockReturnValue('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b')
    setAgentWeb(undefined)
  })

  it('passes binding + recipeId to the bridge and returns true on ok', async () => {
    const recipeEnable = vi.fn().mockResolvedValue({ ok: true, recipeId: 'jmessage-world', reloaded: true })
    setAgentWeb({ recipeEnable })
    const result = await enableRecipeAndReload('jmessage-world')
    expect(recipeEnable).toHaveBeenCalledWith('7b0a2c66-6b1d-4a2e-9f0c-1c2d3e4f5a6b', 'jmessage-world')
    expect(result).toBe(true)
  })

  it('returns false when the bridge answers ok: false', async () => {
    setAgentWeb({ recipeEnable: vi.fn().mockResolvedValue({ ok: false, error: 'RECIPE_MISMATCH' }) })
    expect(await enableRecipeAndReload('jmessage-world')).toBe(false)
  })

  it('returns false without a binding (non-side-panel context)', async () => {
    getSidePanelBindingIdMock.mockReturnValue(null)
    setAgentWeb({ recipeEnable: vi.fn() })
    expect(await enableRecipeAndReload('jmessage-world')).toBe(false)
  })

  it('returns false when the bridge method is missing (stale extension)', async () => {
    setAgentWeb({})
    expect(await enableRecipeAndReload('jmessage-world')).toBe(false)
  })
})
