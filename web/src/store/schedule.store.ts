/**
 * Schedule Store — lightweight Zustand store that caches schedule-to-workspace
 * mapping for UI consumption (sidebar badges, project-level drawer).
 *
 * The authoritative data lives in OPFS JSON files (schedule-storage.ts).
 * This store is a read cache that can be refreshed on demand.
 */

import { create } from 'zustand'
import { loadAllSchedules, type Schedule } from '@/services/schedule-storage'

interface ScheduleState {
  /** All schedules across all projects */
  schedules: Schedule[]
  /** Map: workspaceId → count of enabled schedules */
  workspaceScheduleCount: Map<string, number>
  /** Loading flag */
  loading: boolean
  /** Last refresh timestamp */
  lastRefreshAt: number

  /** Reload all schedules from OPFS and rebuild the workspace count map */
  refresh: () => Promise<void>
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  schedules: [],
  workspaceScheduleCount: new Map(),
  loading: false,
  lastRefreshAt: 0,

  refresh: async () => {
    set({ loading: true })
    try {
      const schedules = await loadAllSchedules()
      const workspaceScheduleCount = new Map<string, number>()
      for (const s of schedules) {
        // Count ALL schedules (enabled or not) — badge means "has schedule"
        const cur = workspaceScheduleCount.get(s.workspaceId) ?? 0
        workspaceScheduleCount.set(s.workspaceId, cur + 1)
      }
      set({ schedules, workspaceScheduleCount, loading: false, lastRefreshAt: Date.now() })
    } catch {
      set({ loading: false })
    }
  },
}))
