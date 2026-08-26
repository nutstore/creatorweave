import { create } from 'zustand'

interface PageActionSessionState {
  pageActionYolo: boolean
  setPageActionYolo: (pageActionYolo: boolean) => void
}

/** Page-action state that is deliberately reset whenever the web app reloads. */
export const usePageActionSessionStore = create<PageActionSessionState>((set) => ({
  pageActionYolo: false,
  setPageActionYolo: (pageActionYolo) => set({ pageActionYolo }),
}))
