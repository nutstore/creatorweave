/**
 * Canvas tools — let the AI agent create and modify visual workflows.
 *
 * Tool family:
 * - canvas_create   → create a new workflow (initializes a FlowInstance)
 * - canvas_add_node → add a node to the active workflow
 * - canvas_connect  → connect two nodes
 * - canvas_update   → update node config
 * - canvas_remove   → remove a node
 * - canvas_run      → execute the workflow
 *
 * All tools operate on the FlowStore's activeInstance, which the UI
 * (FlowEditor) renders in real time.
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { toolOkJson, toolErrorJson } from './tool-envelope'
import { useFlowStore } from '@/store/flow.store'
import type { FlowNodeKind, FlowNodeConfig } from '@/agent/flow/types'

// ---------------------------------------------------------------------------
// canvas_create — create a new workflow
// ---------------------------------------------------------------------------

const canvasCreateDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_create',
    description: [
      'Create a new visual workflow (flow board). Initializes an empty canvas that the user can see.',
      'Use this when the user asks to build/set up a workflow.',
      'After creating, use canvas_add_node to add nodes and canvas_connect to connect them.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Workflow name (e.g. "每日总结", "内容润色")',
        },
      },
      required: ['name'],
    },
  },
}

const canvasCreateExecutor: ToolExecutor = async (args, context) => {
  const name = (args.name as string)?.trim()
  if (!name) return toolErrorJson('canvas_create', 'invalid_args', 'name is required')

  const store = useFlowStore.getState()
  // Use the workspace/conversation ID from the tool context
  const conversationId = context.workspaceId ?? store.activeInstance?.conversationId ?? 'canvas_session'
  store.initInstance(conversationId)
  // Show the canvas panel at creation time (not via a reactive auto-open effect,
  // which would incorrectly fire on project/conversation switch when stale nodes remain).
  store.setPanelOpen(true)

  return toolOkJson('canvas_create', {
    name,
    conversationId,
    nodeCount: 0,
  })
}

// ---------------------------------------------------------------------------
// canvas_add_node — add a node
// ---------------------------------------------------------------------------

const canvasAddNodeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_add_node',
    description: [
      'Add a node to the active workflow canvas.',
      '',
      'Node kinds:',
      '- input: data source. config: inputType (file|text|today), path (for file, supports {{date}}), value (for text)',
      '- tool: call a tool. config: toolName (read|web_search|run_python|edit|...), args (parameters)',
      '- llm: AI reasoning (full agent — can use all tools by default). config: prompt (supports {{input}} for upstream data)',
      '- review: quality gate. config: criteria, minScore (default 80). Fails → auto retry upstream via loop edge',
      '- output: data sink. config: path (write file, supports {{date}}). Leave empty for result card',
      '- router: conditional branching. config: rules [{label, expr, targetLabel?}]. Evaluates rules top-to-bottom, activates the FIRST matching branch. expr supports {{var}} refs and JS comparison operators. Use `true` for catch-all/else.',
      '',
      'label: short display name for the node.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['input', 'tool', 'llm', 'review', 'output', 'router'],
          description: 'Node type',
        },
        label: {
          type: 'string',
          description: 'Display name (e.g. "读取日记", "总结要点")',
        },
        config: {
          type: 'object',
          description: 'Kind-specific configuration. See tool description for each kind\'s config fields.',
        },
      },
      required: ['kind', 'label'],
    },
  },
}

const canvasAddNodeExecutor: ToolExecutor = async (args) => {
  const store = useFlowStore.getState()
  if (!store.activeInstance) {
    return toolErrorJson('canvas_add_node', 'no_active_workflow', 'No active workflow. Call canvas_create first.')
  }

  const kind = args.kind as FlowNodeKind
  const label = (args.label as string)?.trim() || kind
  const config = (args.config as FlowNodeConfig) ?? getDefaultConfig(kind)

  // Auto-position: stagger new nodes
  const nodeCount = store.activeInstance.nodes.length
  const x = 60 + nodeCount * 300
  const y = 120 + (nodeCount % 3) * 140

  const nodeId = store.addNode(kind, label, { x, y }, config)
  if (!nodeId) {
    return toolErrorJson('canvas_add_node', 'add_failed', 'Failed to add node')
  }

  return toolOkJson('canvas_add_node', {
    nodeId,
    kind,
    label,
    totalNodes: store.activeInstance.nodes.length,
  })
}

// ---------------------------------------------------------------------------
// canvas_connect — connect two nodes
// ---------------------------------------------------------------------------

const canvasConnectDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_connect',
    description: [
      'Connect two nodes with a data-flow edge. Data flows from → to.',
      'For review-loop (retry): set isLoop=true to create a back-edge that triggers re-execution when review fails.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source node id (returned by canvas_add_node)' },
        to: { type: 'string', description: 'Target node id' },
        isLoop: {
          type: 'boolean',
          description: 'If true, this is a review-loop back-edge (e.g. review → llm for retry). Default false.',
        },
        conditionLabel: {
          type: 'string',
          description: 'Router rule label for this branch. Required when connecting from a router with multiple rules.',
        },
      },
      required: ['from', 'to'],
    },
  },
}

const canvasConnectExecutor: ToolExecutor = async (args) => {
  const store = useFlowStore.getState()
  if (!store.activeInstance) {
    return toolErrorJson('canvas_connect', 'no_active_workflow', 'No active workflow.')
  }

  const from = args.from as string
  const to = args.to as string
  const isLoop = args.isLoop === true
  const conditionLabel = typeof args.conditionLabel === 'string' ? args.conditionLabel.trim() || undefined : undefined

  // Validate node existence
  const nodes = store.activeInstance.nodes
  if (!nodes.some((n) => n.id === from)) {
    return toolErrorJson('canvas_connect', 'node_not_found', `Source node "${from}" not found`)
  }
  if (!nodes.some((n) => n.id === to)) {
    return toolErrorJson('canvas_connect', 'node_not_found', `Target node "${to}" not found`)
  }

  store.connectNodes(from, to, { isLoop, conditionLabel })

  return toolOkJson('canvas_connect', { from, to, isLoop, conditionLabel })
}

// ---------------------------------------------------------------------------
// canvas_update — update node config
// ---------------------------------------------------------------------------

const canvasUpdateDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_update',
    description: [
      'Update a node\'s label, configuration, or retry count. Only the fields you provide will be changed.',
      '',
      'You can target a node by nodeId OR by its current label (label match is case-insensitive).',
      '',
      'Config fields by node kind:',
      '- llm: prompt, outputFormat (text|json), jsonSchema',
      '- input: inputType (file|text|today), path, value',
      '- tool: toolName, args',
      '- review: criteria, minScore',
      '- output: path',
      '',
      'Examples:',
      '- canvas_update({ label: "总结", config: { prompt: "Extract 3 key points" } })',
      '- canvas_update({ label: "评审", config: { minScore: 90 } })',
      '- canvas_update({ label: "写入文件", config: { path: "Output/report.md" } })',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node id (from canvas_add_node or canvas_get). Optional if label is provided.' },
        label: { type: 'string', description: 'Match node by current label (case-insensitive). Use this if you don\'t know the nodeId.' },
        config: { type: 'object', description: 'Partial config update (merged with existing config)' },
        retry: { type: 'number', description: 'Max retry count for this node (default 1)' },
        newLabel: { type: 'string', description: 'New display label to rename the node' },
      },
    },
  },
}

const canvasUpdateExecutor: ToolExecutor = async (args) => {
  const store = useFlowStore.getState()
  if (!store.activeInstance) {
    return toolErrorJson('canvas_update', 'no_active_workflow', 'No active workflow.')
  }

  // Resolve node: by nodeId or by label match
  let node: { id: string; label: string; config: FlowNodeConfig; retry?: number } | undefined
  const nodeId = args.nodeId as string | undefined
  const labelMatch = args.label as string | undefined

  if (nodeId) {
    node = store.activeInstance.nodes.find((n) => n.id === nodeId)
  } else if (labelMatch) {
    const lower = labelMatch.toLowerCase()
    node = store.activeInstance.nodes.find((n) => n.label.toLowerCase() === lower)
      ?? store.activeInstance.nodes.find((n) => n.label.toLowerCase().includes(lower))
  }

  if (!node) {
    return toolErrorJson('canvas_update', 'node_not_found', `Node not found. ${nodeId ? `id="${nodeId}"` : `label="${labelMatch}"`}`)
  }

  const patch: Record<string, unknown> = {}

  // Rename
  if (args.newLabel) {
    patch.label = args.newLabel as string
  }

  // Config merge
  if (args.config) {
    patch.config = { ...node.config, ...(args.config as Record<string, unknown>) } as FlowNodeConfig
  }

  // Retry count
  if (typeof args.retry === 'number') {
    patch.retry = args.retry
  }

  store.updateNode(node.id, patch as never)

  return toolOkJson('canvas_update', {
    nodeId: node.id,
    label: patch.label ?? node.label,
    updated: Object.keys(patch),
  })
}

// ---------------------------------------------------------------------------
// canvas_remove — remove a node
// ---------------------------------------------------------------------------

const canvasRemoveDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_remove',
    description: 'Remove a node and all its connections from the workflow.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node id to remove' },
      },
      required: ['nodeId'],
    },
  },
}

const canvasRemoveExecutor: ToolExecutor = async (args) => {
  const store = useFlowStore.getState()
  if (!store.activeInstance) {
    return toolErrorJson('canvas_remove', 'no_active_workflow', 'No active workflow.')
  }

  const nodeId = args.nodeId as string
  store.removeNode(nodeId)

  return toolOkJson('canvas_remove', { nodeId, remainingNodes: store.activeInstance.nodes.length })
}

// ---------------------------------------------------------------------------
// canvas_disconnect — remove an edge between two nodes
// ---------------------------------------------------------------------------

const canvasDisconnectDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_disconnect',
    description: 'Remove the edge (connection) between two nodes. Use this to restructure the workflow without deleting nodes.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source node id' },
        to: { type: 'string', description: 'Target node id' },
      },
      required: ['from', 'to'],
    },
  },
}

const canvasDisconnectExecutor: ToolExecutor = async (args) => {
  const store = useFlowStore.getState()
  if (!store.activeInstance) {
    return toolErrorJson('canvas_disconnect', 'no_active_workflow', 'No active workflow.')
  }

  const from = args.from as string
  const to = args.to as string

  // Check edge exists
  const exists = store.activeInstance.edges.some((e) => e.from === from && e.to === to)
  if (!exists) {
    return toolErrorJson('canvas_disconnect', 'edge_not_found', `No edge from "${from}" to "${to}".`)
  }

  store.removeEdge(from, to)

  return toolOkJson('canvas_disconnect', { from, to, remainingEdges: store.activeInstance.edges.length })
}

// ---------------------------------------------------------------------------
// canvas_run — execute the workflow
// ---------------------------------------------------------------------------

const canvasRunDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_run',
    description: 'Execute the active workflow. Nodes run in topological order, data flows along edges.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

const canvasRunExecutor: ToolExecutor = async (_args) => {
  const store = useFlowStore.getState()
  if (!store.activeInstance) {
    return toolErrorJson('canvas_run', 'no_active_workflow', 'No active workflow.')
  }
  if (store.activeInstance.nodes.length === 0) {
    return toolErrorJson('canvas_run', 'empty_workflow', 'Workflow has no nodes.')
  }

  // Delegate to the engine — the UI's run button is the primary entry point.
  // For tool-based execution, we return a summary instructing the user.
  return toolOkJson('canvas_run', {
    message: 'Workflow is ready to run. Click the Run button in the canvas editor to execute it.',
    nodeCount: store.activeInstance.nodes.length,
    edgeCount: store.activeInstance.edges.length,
  })
}

// ---------------------------------------------------------------------------
// canvas_get — inspect current workflow state (read-only)
// ---------------------------------------------------------------------------

const canvasGetDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'canvas_get',
    description: [
      'Get the current state of the active workflow canvas (read-only).',
      'Returns all nodes (with config) and edges, plus a layered execution-order summary.',
      'Use this to inspect what the canvas looks like before modifying it.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        verbose: {
          type: 'boolean',
          description: 'If true, include full node configs in the output. Default false (summary only).',
        },
      },
    },
  },
}

const canvasGetExecutor: ToolExecutor = async (args) => {
  const store = useFlowStore.getState()
  const inst = store.activeInstance
  if (!inst) {
    return toolErrorJson('canvas_get', 'no_active_workflow', 'No active workflow.')
  }

  const verbose = args.verbose === true

  // Compute layered execution order for a quick structural overview
  const layers = computeLayeredOrder(inst.nodes, inst.edges)

  return toolOkJson('canvas_get', {
    conversationId: inst.conversationId,
    templateId: inst.templateId,
    nodeCount: inst.nodes.length,
    edgeCount: inst.edges.length,
    loopEdgeCount: inst.edges.filter((e) => e.isLoop).length,
    nodes: inst.nodes.map((n) =>
      verbose
        ? { id: n.id, kind: n.kind, label: n.label, config: n.config }
        : { id: n.id, kind: n.kind, label: n.label }
    ),
    edges: inst.edges.map((e) => ({ from: e.from, to: e.to, isLoop: e.isLoop ?? false })),
    executionLayers: layers,
  })
}

/**
 * Compute layered topological execution order (ignoring loop edges).
 * Returns array of layers, each layer = array of {id, label, kind}.
 */
function computeLayeredOrder(
  nodes: { id: string; kind: string; label: string }[],
  edges: { from: string; to: string; isLoop?: boolean }[]
): Array<Array<{ id: string; label: string; kind: string }>> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const inDegree = new Map<string, number>()
  const outNbr = new Map<string, string[]>()
  for (const n of nodes) {
    inDegree.set(n.id, 0)
    outNbr.set(n.id, [])
  }
  for (const e of edges) {
    if (e.isLoop) continue
    if (!inDegree.has(e.to)) continue
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
    outNbr.get(e.from)?.push(e.to)
  }

  const layers: Array<Array<{ id: string; label: string; kind: string }>> = []
  let current = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  if (current.length === 0) current = nodes.map((n) => n.id)

  const placed = new Set<string>()
  while (current.length > 0) {
    const layer = current
      .map((id) => nodeMap.get(id))
      .filter((n): n is { id: string; kind: string; label: string } => !!n)
      .map((n) => ({ id: n.id, label: n.label, kind: n.kind }))
    layers.push(layer)
    for (const id of current) placed.add(id)

    const next: string[] = []
    for (const id of current) {
      for (const nbr of outNbr.get(id) ?? []) {
        const d = (inDegree.get(nbr) ?? 0) - 1
        inDegree.set(nbr, d)
        if (d === 0 && !placed.has(nbr)) next.push(nbr)
      }
    }
    current = next
  }
  return layers
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const canvasToolDefinitions = [
  { definition: canvasCreateDefinition, executor: canvasCreateExecutor },
  { definition: canvasAddNodeDefinition, executor: canvasAddNodeExecutor },
  { definition: canvasConnectDefinition, executor: canvasConnectExecutor },
  { definition: canvasUpdateDefinition, executor: canvasUpdateExecutor },
  { definition: canvasRemoveDefinition, executor: canvasRemoveExecutor },
  { definition: canvasDisconnectDefinition, executor: canvasDisconnectExecutor },
  { definition: canvasGetDefinition, executor: canvasGetExecutor },
  { definition: canvasRunDefinition, executor: canvasRunExecutor },
]

export const canvasPromptDoc: ToolPromptDoc = {
  category: 'workflow',
  section: '### Visual Workflow (Canvas)',
  lines: [
    '- `canvas_create(name)` — Create a new visual workflow canvas',
    '- `canvas_add_node(kind, label, config)` — Add a node. kind: input|tool|llm|review|output|router',
    '- `canvas_connect(from, to, {isLoop})` — Connect nodes. isLoop for review retry',
    '- `canvas_update({nodeId?, label?, config?, retry?, newLabel?})` — Update node. Can match by label instead of id',
    '- `canvas_remove(nodeId)` — Remove node',
    '- `canvas_disconnect(from, to)` — Remove an edge (connection) between two nodes',
    '- `canvas_get({verbose?})` — Inspect current workflow state (read-only)',
    '- `canvas_run()` — Execute the workflow',
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultConfig(kind: FlowNodeKind): FlowNodeConfig {
  switch (kind) {
    case 'input':
      return { inputType: 'file', path: 'Daily/{{date}}.md' }
    case 'tool':
      return { toolName: 'read', args: {} }
    case 'llm':
      return { prompt: '' }
    case 'review':
      return { criteria: '符合质量要求', minScore: 80 }
    case 'output':
      return { path: 'Output/{{date}}.md' }
    case 'router':
      return { rules: [{ label: '默认', expr: 'true' }] }
  }
}
