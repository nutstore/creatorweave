/**
 * Flow Store — Zustand store for visual workflow state.
 *
 * Two layers:
 * - Templates: project-level reusable definitions (persisted to SQLite via
 *   FlowTemplateRepository). Loaded lazily per project.
 * - Instances: per-conversation working copies (in-memory only, the
 *   conversation store is responsible for persisting flow_instance_json).
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { getFlowTemplateRepository } from '@/sqlite/repositories/flow-template.repository'
import { getConversationRepository } from '@/sqlite/repositories/conversation.repository'
import type { FlowTemplate, FlowInstance, FlowNode, FlowEdge, FlowRunResult, FlowNodeRunResult } from '@/agent/flow/types'
import { createEmptyTemplate, generateNodeId } from '@/agent/flow/types'

// ---------------------------------------------------------------------------
// Module-level AbortController — survives component unmount
// ---------------------------------------------------------------------------

/** The active flow run's abort controller. Stored outside the store because
 * it's a non-serializable object. Survives component unmount so that closing
 * and reopening the canvas panel keeps the run alive. */
let activeRunAbortController: AbortController | null = null

function persistInstance(instance: FlowInstance | null): void {
  if (!instance) return
  const snapshot = JSON.parse(JSON.stringify(instance)) as FlowInstance
  void getConversationRepository().saveFlowInstance(snapshot.conversationId, snapshot).catch((error) => {
    console.error('[FlowStore] Failed to persist flow instance:', error)
  })
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface FlowState {
  // ── Templates ──
  /** All templates for the active project */
  templates: FlowTemplate[]
  /** Whether templates have been loaded for the current project */
  templatesLoaded: boolean
  templatesLoading: boolean
  templatesError: string | null

  // ── Active instance (per-conversation) ──
  /** The active conversation's flow instance (null = no flow in this conversation) */
  activeInstance: FlowInstance | null

  // ── Panel visibility (entry lives in the TopBar; auto-opens when AI builds a flow) ──
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void

  // ── Template actions ──
  loadTemplates: (projectId: string) => Promise<void>
  createTemplate: (projectId: string, name?: string, nodes?: FlowNode[], edges?: FlowEdge[]) => Promise<FlowTemplate>
  saveTemplate: (template: FlowTemplate) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  renameTemplate: (id: string, name: string) => Promise<void>
  duplicateTemplate: (id: string) => Promise<FlowTemplate | null>
  getTemplateById: (id: string) => FlowTemplate | null

  // ── Instance actions ──
  /** Initialize an empty instance for a conversation (built from scratch) */
  initInstance: (conversationId: string) => FlowInstance
  /** Create an instance from a template */
  createInstanceFromTemplate: (conversationId: string, templateId: string) => FlowInstance | null
  /** Load an existing instance (from conversation.flowInstanceJson) */
  loadInstance: (instance: FlowInstance) => void
  /** Load the persisted working copy for one conversation. */
  loadInstanceForConversation: (conversationId: string) => Promise<FlowInstance | null>
  /** Clear the active instance */
  clearInstance: () => void

  // ── Node operations (operate on activeInstance) ──
  addNode: (kind: FlowNode['kind'], label: string, position: { x: number; y: number }, config: FlowNode['config']) => string | null
  updateNode: (nodeId: string, patch: Partial<FlowNode>) => void
  removeNode: (nodeId: string) => void
  connectNodes: (from: string, to: string, opts?: { isLoop?: boolean; conditionLabel?: string }) => void
  removeEdge: (from: string, to: string) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void

  // ── Run state (survives component unmount) ──
  isRunning: boolean
  runResult: FlowRunResult | null
  nodeStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed'>
  /** Per-node results accumulated during a run (incl. trace). Updated in real-time
   * as each node completes, so the UI can show trace before the whole flow finishes. */
  nodeResults: FlowNodeRunResult[]

  // ── Utility ──
  clearError: () => void
  setRunState: (state: { isRunning?: boolean; runResult?: FlowRunResult | null; nodeStatuses?: Record<string, 'pending' | 'running' | 'completed' | 'failed'>; nodeResults?: FlowNodeRunResult[] }) => void
  resetRun: () => void
  /** Add or replace a node result in the real-time results array. */
  upsertNodeResult: (result: FlowNodeRunResult) => void
}

type FlowStateWithImmer = FlowState & {
  setState: (partial: Partial<FlowState>) => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFlowStore = create<FlowStateWithImmer>()(
  immer((set, get) => ({
    templates: [],
    templatesLoaded: false,
    templatesLoading: false,
    templatesError: null,
    activeInstance: null,
    panelOpen: false,
    isRunning: false,
    runResult: null,
    nodeStatuses: {},
    nodeResults: [],

    setState: set,

    // ========================================================================
    // Template actions
    // ========================================================================

    loadTemplates: async (projectId: string) => {
      const state = get()
      if (state.templatesLoading) return
      set({ templatesLoading: true, templatesError: null })
      try {
        const repo = getFlowTemplateRepository()
        const templates = await repo.findByProject(projectId)
        set({ templates, templatesLoaded: true, templatesLoading: false })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error('[FlowStore] loadTemplates error:', error)
        set({ templatesLoading: false, templatesError: msg })
      }
    },

    createTemplate: async (projectId, name, nodes, edges) => {
      const template = createEmptyTemplate(projectId, name)
      if (nodes) template.nodes = nodes
      if (edges) template.edges = edges
      const repo = getFlowTemplateRepository()
      await repo.save(template)
      set((state) => {
        state.templates.unshift(template)
      })
      return template
    },

    saveTemplate: async (template) => {
      const repo = getFlowTemplateRepository()
      const updated = { ...template, updatedAt: Date.now() }
      await repo.save(updated)
      set((state) => {
        const idx = state.templates.findIndex((t) => t.id === updated.id)
        if (idx >= 0) state.templates[idx] = updated
        else state.templates.unshift(updated)
        state.templates.sort((a, b) => b.updatedAt - a.updatedAt)
      })
    },

    deleteTemplate: async (id) => {
      const repo = getFlowTemplateRepository()
      await repo.delete(id)
      set((state) => {
        state.templates = state.templates.filter((t) => t.id !== id)
      })
    },

    renameTemplate: async (id, name) => {
      const repo = getFlowTemplateRepository()
      await repo.rename(id, name)
      set((state) => {
        const t = state.templates.find((t) => t.id === id)
        if (t) {
          t.name = name
          t.updatedAt = Date.now()
        }
      })
    },

    duplicateTemplate: async (id) => {
      const original = get().templates.find((t) => t.id === id)
      if (!original) return null
      const now = Date.now()
      const copy: FlowTemplate = {
        ...original,
        id: `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        name: `${original.name} (副本)`,
        createdAt: now,
        updatedAt: now,
      }
      await get().saveTemplate(copy)
      return copy
    },

    getTemplateById: (id) => {
      return get().templates.find((t) => t.id === id) ?? null
    },

    // ========================================================================
    // Instance actions
    // ========================================================================

    initInstance: (conversationId) => {
      const instance: FlowInstance = {
        conversationId,
        templateId: null,
        nodes: [],
        edges: [],
        entryNodeId: undefined,
        lastRunAt: null,
        lastRunStatus: 'idle',
      }
      set({ activeInstance: instance })
      persistInstance(instance)
      return instance
    },

    createInstanceFromTemplate: (conversationId, templateId) => {
      const template = get().templates.find((t) => t.id === templateId)
      if (!template) return null
      const instance: FlowInstance = {
        conversationId,
        templateId,
        nodes: JSON.parse(JSON.stringify(template.nodes)),
        edges: JSON.parse(JSON.stringify(template.edges)),
        entryNodeId: template.entryNodeId,
        lastRunAt: null,
        lastRunStatus: 'idle',
      }
      set({ activeInstance: instance })
      persistInstance(instance)
      return instance
    },

    loadInstance: (instance) => {
      set({ activeInstance: instance })
    },

    loadInstanceForConversation: async (conversationId) => {
      const instance = await getConversationRepository().loadFlowInstance(conversationId)
      if (instance && instance.conversationId === conversationId) {
        set({ activeInstance: instance })
        return instance
      }
      return null
    },

    clearInstance: () => {
      set({ activeInstance: null })
    },

    setPanelOpen: (open) => {
      set({ panelOpen: open })
    },

    // ========================================================================
    // Node operations
    // ========================================================================

    addNode: (kind, label, position, config) => {
      const inst = get().activeInstance
      if (!inst) {
        console.warn('[FlowStore] No active instance — call initInstance first')
        return null
      }
      const id = generateNodeId()
      const node: FlowNode = { id, kind, label, position, config }
      set((state) => {
        state.activeInstance?.nodes.push(node)
      })
      persistInstance(get().activeInstance)
      return id
    },

    updateNode: (nodeId, patch) => {
      set((state) => {
        const inst = state.activeInstance
        if (!inst) return
        const node = inst.nodes.find((n) => n.id === nodeId)
        if (node) {
          Object.assign(node, patch)
        }
      })
      persistInstance(get().activeInstance)
    },

    removeNode: (nodeId) => {
      set((state) => {
        const inst = state.activeInstance
        if (!inst) return
        inst.nodes = inst.nodes.filter((n) => n.id !== nodeId)
        inst.edges = inst.edges.filter((e) => e.from !== nodeId && e.to !== nodeId)
      })
      persistInstance(get().activeInstance)
    },

    connectNodes: (from, to, opts) => {
      set((state) => {
        const inst = state.activeInstance
        if (!inst) return
        // Avoid duplicate edges
        const exists = inst.edges.some((e) => e.from === from && e.to === to)
        if (exists) return
        const source = inst.nodes.find((node) => node.id === from)
        const rules = source?.kind === 'router'
          ? (source.config as { rules?: Array<{ label: string }> }).rules ?? []
          : []
        const usedLabels = new Set(inst.edges.filter((edge) => edge.from === from).map((edge) => edge.conditionLabel))
        const conditionLabel = opts?.conditionLabel ?? rules.find((rule) => !usedLabels.has(rule.label))?.label
        inst.edges.push({ from, to, isLoop: opts?.isLoop, conditionLabel })
      })
      persistInstance(get().activeInstance)
    },

    removeEdge: (from, to) => {
      set((state) => {
        const inst = state.activeInstance
        if (!inst) return
        inst.edges = inst.edges.filter((e) => !(e.from === from && e.to === to))
      })
      persistInstance(get().activeInstance)
    },

    updateNodePosition: (nodeId, position) => {
      set((state) => {
        const inst = state.activeInstance
        if (!inst) return
        const node = inst.nodes.find((n) => n.id === nodeId)
        if (node) node.position = position
      })
      persistInstance(get().activeInstance)
    },

    // ========================================================================
    // Utility
    // ========================================================================

    clearError: () => {
      set({ templatesError: null })
    },

    setRunState: (runState) => {
      set((state) => {
        if (runState.isRunning !== undefined) state.isRunning = runState.isRunning
        if (runState.runResult !== undefined) state.runResult = runState.runResult
        if (runState.nodeStatuses !== undefined) state.nodeStatuses = runState.nodeStatuses
        if (runState.nodeResults !== undefined) state.nodeResults = runState.nodeResults
      })
    },

    resetRun: () => {
      set({ runResult: null, nodeStatuses: {}, isRunning: false, nodeResults: [] })
    },

    upsertNodeResult: (nodeResult) => {
      set((state) => {
        const idx = state.nodeResults.findIndex((r) => r.nodeId === nodeResult.nodeId)
        if (idx >= 0) {
          state.nodeResults[idx] = nodeResult
        } else {
          state.nodeResults.push(nodeResult)
        }
      })
    },
  }))
)

// ---------------------------------------------------------------------------
// Run abort controller — exported for FlowRunOverlay's useFlowRun hook
// ---------------------------------------------------------------------------

export function getActiveRunAbortController(): AbortController | null {
  return activeRunAbortController
}

export function setActiveRunAbortController(controller: AbortController | null): void {
  activeRunAbortController = controller
}

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const useActiveFlowInstance = () =>
  useFlowStore((s) => s.activeInstance)

export const useFlowTemplates = () =>
  useFlowStore((s) => s.templates)
