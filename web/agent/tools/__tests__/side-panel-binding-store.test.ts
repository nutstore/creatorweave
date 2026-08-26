import { describe, expect, it } from 'vitest'
import { SidePanelBindingStore } from '../../../../browser-extension/lib/side-panel-binding-store'

describe('side-panel binding store', () => {
  it('recovers a binding from extension storage after a worker restart', async () => {
    let persisted: Record<string, { tabId: number }> = {}
    const storage = {
      get: async () => persisted,
      set: async (next: Record<string, { tabId: number }>) => { persisted = next },
    }

    const firstWorker = new SidePanelBindingStore(storage)
    await firstWorker.remember('7e30f3b0-d790-4d42-9e05-8f3d38e90be4', 12)

    const restartedWorker = new SidePanelBindingStore(storage)
    await expect(restartedWorker.resolve('7e30f3b0-d790-4d42-9e05-8f3d38e90be4')).resolves.toEqual({ tabId: 12 })
  })
})
