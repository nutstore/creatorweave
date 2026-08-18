// ============================================================
// Recipe registry — all built-in recipes.
// The management page (recipes.html) reads metadata from here;
// the MAIN-world injector imports implementations lazily so a
// non-jmail page never pulls the jmail tool code into its bundle
// evaluation path (WXT bundles each content script separately,
// but a single registry module keeps the mapping explicit).
// ============================================================

import type { WebMCPRecipe } from './types'
import { jmailRecipe } from './jmail-world'

export { ENABLED_RECIPES_STORAGE_KEY } from './types'
export type { WebMCPRecipe, WebMCPRecipeTool } from './types'

export const recipes: WebMCPRecipe[] = [jmailRecipe]

export function findRecipeForHostname(hostname: string): WebMCPRecipe | undefined {
  return recipes.find((r) => r.hostname === hostname)
}
