/**
 * Trusted Source Store — ONE global switch: "trust external tools by default".
 *
 * 2026-09-02 history (two rounds of user feedback, then a deliberate
 * simplification):
 * 1. Per-call approval prompts for already-authorized sources (WebMCP pages
 *    enabled in the extension popup, hand-entered MCP servers) were annoying.
 * 2. A per-source "always trust" list was added, then a global default-trust
 *    switch — but combining them (default + per-source overrides) made the
 *    per-site switch confusing ("单个站点的那个信任开关，现在就不好用了").
 * 3. Final model: ONLY the global switch. When ON (the default), tools from
 *    every discovered MCP server / WebMCP page run without the approval
 *    modal in plan AND act mode. When OFF, every call prompts again.
 *
 * Hard invariant kept across every iteration: tools annotated
 * `untrustedContentHint` NEVER qualify — the prompt-injection surface keeps
 * its human gate regardless of this switch. Forbidden tools are still denied
 * first (enforced in policy-engine). Only settings UI mutates this store;
 * the LLM has no tool that touches it.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ToolSourceKind = 'webmcp' | 'mcp'

interface TrustedSourceState {
  /**
   * Trust every discovered external source without per-call approval
   * prompts. ON by default (2026-09-02 user decision).
   */
  defaultTrustExternal: boolean

  setDefaultTrustExternal: (on: boolean) => void
}

export const useTrustedSourceStore = create<TrustedSourceState>()(
  persist(
    (set) => ({
      defaultTrustExternal: true,

      setDefaultTrustExternal: (on) => set({ defaultTrustExternal: on }),
    }),
    {
      name: 'creatorweave-trusted-source-store',
      // Only the global switch is meaningful now. Older releases persisted a
      // per-source list — partialize keeps that stale data out of storage.
      partialize: (state) => ({ defaultTrustExternal: state.defaultTrustExternal }),
    }
  )
)

/**
 * Engine-facing read: is this tool's origin trusted?
 *
 * `kind` / `sourceId` identify the origin (WebMCP hostname / MCP serverId).
 * They are part of the signature so the call sites in external-tool-bridge
 * stay future-proof, but under the global-only model the origin itself does
 * not affect the answer — EXCEPT for untrusted-content tools, which never
 * qualify: the annotation exists precisely because the page content cannot
 * be trusted, so the human gate on the injection surface is unconditional.
 */
export function isToolSourceTrusted(
  _kind: ToolSourceKind,
  _sourceId: string | null | undefined,
  opts?: { untrustedContent?: boolean }
): boolean {
  if (opts?.untrustedContent) return false
  return useTrustedSourceStore.getState().defaultTrustExternal
}
