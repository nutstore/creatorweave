// ============================================================
// Supported Sites management page — toggle recipes on/off.
// Writes storage.local; the ISOLATED bridge in open tabs reacts
// via storage.onChanged and activates/deactivates instantly.
// ============================================================

import { recipes } from '../webmcp/recipes'
import { ENABLED_RECIPES_STORAGE_KEY } from '../webmcp/recipes/types'

function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key as any, substitutions) || key
}

async function getEnabled(): Promise<Record<string, { enabledAt: number }>> {
  try {
    const stored = await chrome.storage.local.get(ENABLED_RECIPES_STORAGE_KEY)
    return (stored?.[ENABLED_RECIPES_STORAGE_KEY] || {}) as Record<string, { enabledAt: number }>
  } catch {
    return {}
  }
}

async function setRecipeEnabled(recipeId: string, enabled: boolean): Promise<void> {
  const map = await getEnabled()
  if (enabled) map[recipeId] = { enabledAt: Date.now() }
  else delete map[recipeId]
  await chrome.storage.local.set({ [ENABLED_RECIPES_STORAGE_KEY]: map })
}

function buildCard(
  recipe: (typeof recipes)[number],
  enabled: boolean,
  onToggle: (next: boolean) => void,
): HTMLElement {
  const card = document.createElement('div')
  card.className = 'card' + (enabled ? '' : ' disabled')

  const glyph = document.createElement('div')
  glyph.className = 'glyph'
  glyph.textContent = recipe.glyph

  const body = document.createElement('div')
  body.className = 'body'
  const name = document.createElement('div')
  name.className = 'name'
  name.textContent = recipe.displayName
  const host = document.createElement('div')
  host.className = 'host'
  host.textContent = recipe.hostname
  const desc = document.createElement('div')
  desc.className = 'desc'
  desc.textContent = recipe.description
  body.appendChild(name)
  body.appendChild(host)
  body.appendChild(desc)

  if (recipe.tools.length > 0) {
    const tools = document.createElement('div')
    tools.className = 'tools'
    for (const tool of recipe.tools) {
      const chip = document.createElement('span')
      chip.className = 'tool-chip'
      chip.textContent = tool.name
      chip.title = tool.title
      tools.appendChild(chip)
    }
    body.appendChild(tools)
  }

  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.className = 'toggle'
  toggle.checked = enabled
  toggle.addEventListener('change', () => onToggle(toggle.checked))

  card.appendChild(glyph)
  card.appendChild(body)
  card.appendChild(toggle)
  return card
}

async function render(): Promise<void> {
  const enabled = await getEnabled()
  const installed = recipes.filter((r) => enabled[r.id])
  const available = recipes.filter((r) => !enabled[r.id])

  const installedList = document.getElementById('installedList')!
  const availableList = document.getElementById('availableList')!
  installedList.textContent = ''
  availableList.textContent = ''

  document.getElementById('installedTitle')!.textContent =
    t('recipesInstalled') + ` (${installed.length})`
  document.getElementById('availableTitle')!.textContent =
    t('recipesAvailable') + ` (${available.length})`

  if (installed.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = t('recipesEmptyInstalled')
    installedList.appendChild(empty)
  }
  if (available.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = t('recipesEmptyAvailable')
    availableList.appendChild(empty)
  }

  for (const recipe of installed) {
    installedList.appendChild(
      buildCard(recipe, true, (next) => {
        void setRecipeEnabled(recipe.id, next).then(render)
      }),
    )
  }
  for (const recipe of available) {
    availableList.appendChild(
      buildCard(recipe, false, (next) => {
        void setRecipeEnabled(recipe.id, next).then(render)
      }),
    )
  }
}

void render()
