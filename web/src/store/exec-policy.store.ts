/**
 * ExecPolicy Store — manages the command execution policy.
 *
 * Loads/saves the policy via Native Host (get_execpolicy / set_execpolicy).
 * The policy determines which commands are auto-executed, which require
 * user approval (prompt), and which are forbidden.
 *
 * Rules format matches ~/.creatorweave/execpolicy.json:
 *   { rules: [{ command, args?, decision }], default: "prompt" }
 */

import { create } from 'zustand'

export type ExecDecision = 'auto' | 'prompt' | 'forbidden'

export interface ExecPolicyRule {
  command: string
  args?: string[]
  decision: ExecDecision
}

export interface ExecPolicy {
  rules: ExecPolicyRule[]
  default: ExecDecision
}

interface ExecPolicyState {
  policy: ExecPolicy | null
  loading: boolean
  saving: boolean
  error: string | null

  /** Load policy from Native Host */
  loadPolicy: () => Promise<void>

  /** Save policy to Native Host */
  savePolicy: (policy: ExecPolicy) => Promise<boolean>

  /** Update a single rule's decision by index */
  updateRuleDecision: (index: number, decision: ExecDecision) => void

  /** Add a new rule */
  addRule: (command: string, decision: ExecDecision, args?: string[]) => void

  /** Remove a rule by index */
  removeRule: (index: number) => void

  /** Move a rule up/down */
  moveRule: (index: number, direction: 'up' | 'down') => void
}

async function callNativeHost(action: string, params?: Record<string, unknown>): Promise<any> {
  const w = window as unknown as { __agentWeb?: { nativeHostCall?: (p: Record<string, unknown>) => Promise<any> } }
  if (!w.__agentWeb?.nativeHostCall) {
    throw new Error('Native Host not available')
  }
  return w.__agentWeb.nativeHostCall({ action, ...params })
}

export const useExecPolicyStore = create<ExecPolicyState>((set, get) => ({
  policy: null,
  loading: false,
  saving: false,
  error: null,

  loadPolicy: async () => {
    set({ loading: true, error: null })
    try {
      const resp = await callNativeHost('get_execpolicy')
      if (resp?.ok && resp.policy) {
        set({ policy: resp.policy, loading: false })
      } else {
        set({ error: resp?.error || 'Failed to load policy', loading: false })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  savePolicy: async (policy) => {
    set({ saving: true, error: null })
    try {
      const resp = await callNativeHost('set_execpolicy', { policy })
      if (resp?.ok) {
        set({ policy, saving: false })
        return true
      } else {
        set({ error: resp?.error || 'Failed to save policy', saving: false })
        return false
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), saving: false })
      return false
    }
  },

  updateRuleDecision: (index, decision) => {
    const policy = get().policy
    if (!policy) return
    const rules = [...policy.rules]
    rules[index] = { ...rules[index], decision }
    set({ policy: { ...policy, rules } })
  },

  addRule: (command, decision, args) => {
    const policy = get().policy
    if (!policy || !command.trim()) return
    const newRule: ExecPolicyRule = { command: command.trim(), decision }
    if (args && args.length > 0) newRule.args = args
    set({ policy: { ...policy, rules: [...policy.rules, newRule] } })
  },

  removeRule: (index) => {
    const policy = get().policy
    if (!policy) return
    const rules = policy.rules.filter((_, i) => i !== index)
    set({ policy: { ...policy, rules } })
  },

  moveRule: (index, direction) => {
    const policy = get().policy
    if (!policy) return
    const rules = [...policy.rules]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= rules.length) return
    ;[rules[index], rules[targetIndex]] = [rules[targetIndex], rules[index]]
    set({ policy: { ...policy, rules } })
  },
}))
