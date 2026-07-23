export type SidePanelBinding = { tabId: number }

export interface SidePanelBindingPersistence {
  get(): Promise<Record<string, SidePanelBinding>>
  set(bindings: Record<string, SidePanelBinding>): Promise<void>
}

/** Persists extension-owned side-panel bindings across MV3 worker restarts. */
export class SidePanelBindingStore {
  private readonly memory = new Map<string, SidePanelBinding>()

  constructor(private readonly persistence: SidePanelBindingPersistence) {}

  async remember(bindingId: string, tabId: number): Promise<void> {
    const bindings = await this.persistence.get()
    bindings[bindingId] = { tabId }
    this.memory.set(bindingId, { tabId })
    await this.persistence.set(bindings)
  }

  async resolve(bindingId: string): Promise<SidePanelBinding | null> {
    const cached = this.memory.get(bindingId)
    if (cached) return cached
    const binding = (await this.persistence.get())[bindingId] ?? null
    if (binding) this.memory.set(bindingId, binding)
    return binding
  }
}
