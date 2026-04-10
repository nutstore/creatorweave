import { createWorkflowRunPlan } from './workflow-runner'
import {
  transitionWorkflowRunState,
  type WorkflowRunState,
  type WorkflowRunStatus,
} from './run-state-machine'
import { NodeOutputStore } from './node-io'
import { evaluateExpression } from './expression-eval'
import type { RubricDefinition } from './rubric'
import type { WorkflowEdge, WorkflowNode, WorkflowTemplate } from './types'

export type NodeExecutionResult =
  | {
      status: 'success'
      output?: unknown
    }
  | {
      status: 'review_failed'
      reason?: string
    }
  | {
      status: 'fatal_error'
      reason: string
    }

export interface ExecuteNodeContext {
  node: WorkflowNode
  attempt: number
  runState: WorkflowRunState
  store: NodeOutputStore
}

export interface RepairContext {
  round: number
  reason?: string
  workflow: WorkflowTemplate
  rubric: RubricDefinition
}

export interface ExecuteWorkflowRunOptions {
  workflow: WorkflowTemplate
  rubric: RubricDefinition
  executeNode: (context: ExecuteNodeContext) => Promise<NodeExecutionResult>
  repair?: (context: RepairContext) => Promise<void>
}

export interface ExecuteWorkflowRunResult {
  status: WorkflowRunStatus
  executionOrder: string[]
  executedNodeIds: string[]
  repairRound: number
  errors: string[]
}

/**
 * Build adjacency map: nodeId -> WorkflowEdge[]
 */
function buildAdjacencyMap(workflow: WorkflowTemplate): Map<string, WorkflowEdge[]> {
  const adjacency = new Map<string, WorkflowEdge[]>()
  for (const node of workflow.nodes) {
    adjacency.set(node.id, [])
  }
  for (const edge of workflow.edges) {
    const edges = adjacency.get(edge.from)
    if (edges) {
      edges.push(edge)
    }
  }
  return adjacency
}

/**
 * Evaluate condition node and return the matching branch label.
 */
function evaluateConditionNode(
  node: WorkflowNode,
  store: NodeOutputStore
): string {
  if (!node.conditionConfig) {
    throw new Error(`condition node "${node.id}" missing conditionConfig`)
  }

  const config = node.conditionConfig

  if (config.mode === 'rule') {
    // Build context from store for expression evaluation
    const ctx: Record<string, unknown> = {}
    for (const ref of node.inputRefs) {
      ctx[ref] = store.getLatest(ref)
    }

    // Evaluate each branch's condition
    for (const branch of config.branches) {
      if (branch.condition) {
        try {
          const result = evaluateExpression(branch.condition, ctx)
          if (result) {
            return branch.label
          }
        } catch (error) {
          // If expression evaluation fails, continue to next branch
          console.warn(`Failed to evaluate condition for branch ${branch.label}:`, error)
        }
      }
    }

    // Return fallback branch if no condition matched
    return config.fallbackBranch
  }

  // AI mode would be handled differently - for now use fallback
  return config.fallbackBranch
}

/**
 * Find the outgoing edge for a given branch label.
 */
function findEdgeForBranch(
  edges: WorkflowEdge[],
  branch: string
): WorkflowEdge | undefined {
  // First try exact match
  let edge = edges.find((e) => e.branch === branch)
  if (edge) return edge

  // If no exact match and there's an edge without branch (fallback)
  edge = edges.find((e) => e.branch === undefined)
  return edge
}

async function executeRegularNode(
  node: WorkflowNode,
  state: WorkflowRunState,
  store: NodeOutputStore,
  executeNode: ExecuteWorkflowRunOptions['executeNode']
): Promise<NodeExecutionResult> {
  return executeNode({
    node,
    attempt: 1,
    runState: state,
    store,
  })
}

export async function executeWorkflowRun(
  options: ExecuteWorkflowRunOptions
): Promise<ExecuteWorkflowRunResult> {
  const plan = createWorkflowRunPlan(options.workflow, options.rubric)
  if (!plan.ok) {
    return {
      status: 'failed',
      executionOrder: [],
      executedNodeIds: [],
      repairRound: 0,
      errors: plan.errors,
    }
  }

  const nodesById = new Map(options.workflow.nodes.map((node) => [node.id, node]))
  const adjacency = buildAdjacencyMap(options.workflow)
  const store = new NodeOutputStore()
  const errors: string[] = []
  const executedNodeIds: string[] = []

  let state = transitionWorkflowRunState(plan.initialRunState, { type: 'start' })

  try {
    let currentNodeId = options.workflow.entryNodeId

    while (currentNodeId) {
      const node = nodesById.get(currentNodeId)
      if (!node) {
        throw new Error(`workflow node not found: ${currentNodeId}`)
      }

      // Handle condition nodes
      if (node.kind === 'condition') {
        // Execute the condition node (allows the callback to run and update store)
        const result = await executeRegularNode(node, state, store, options.executeNode)
        executedNodeIds.push(node.id)

        if (result.status !== 'success') {
          const reason = result.status === 'fatal_error' ? result.reason : `condition node failed: ${node.id}`
          errors.push(reason)
          state = transitionWorkflowRunState(state, { type: 'fatal_error', reason })
          return {
            status: state.status,
            executionOrder: plan.executionOrder,
            executedNodeIds,
            repairRound: state.repairRound,
            errors,
          }
        }

        // Store output if available
        if (result.output !== undefined && node.outputKey) {
          store.set(node.outputKey, result.output)
        }

        // Evaluate condition to determine branch
        const branchLabel = evaluateConditionNode(node, store)

        const outgoingEdges = adjacency.get(node.id) || []
        const edge = findEdgeForBranch(outgoingEdges, branchLabel)

        if (!edge) {
          throw new Error(`no outgoing edge found for branch "${branchLabel}" from node "${node.id}"`)
        }

        // Check if this edge has loopPolicy (back-edge for loops)
        if (edge.loopPolicy) {
          const loopPolicy = edge.loopPolicy

          // Check exit condition first
          if (loopPolicy.exitCondition) {
            const ctx: Record<string, unknown> = {}
            for (const ref of node.inputRefs) {
            ctx[ref] = store.getLatest(ref)
          }
          if (node.outputKey) {
            ctx[node.outputKey] = store.getLatest(node.outputKey)
          }

          try {
            const shouldExit = evaluateExpression(loopPolicy.exitCondition, ctx)
            if (shouldExit) {
              // Exit condition met, find alternative edge or terminate
              const nonLoopEdges = outgoingEdges.filter((e) => !e.loopPolicy)
              if (nonLoopEdges.length > 0) {
                currentNodeId = nonLoopEdges[0].to
                continue
              }
              // No alternative edge, terminate workflow
              break
            }
          } catch (error) {
            console.warn(`Failed to evaluate exit condition:`, error)
          }
        }

          // Check max iterations
        if (state.currentIteration >= loopPolicy.maxIterations) {
          // Max iterations reached
          state = transitionWorkflowRunState(state, {
            type: 'loop_timeout',
            reason: `max iterations (${loopPolicy.maxIterations}) reached`,
          })
          return {
            status: state.status,
            executionOrder: plan.executionOrder,
            executedNodeIds,
            repairRound: state.repairRound,
            errors: [...errors, `max iterations (${loopPolicy.maxIterations}) reached`],
          }
        }

        // Loop back
        state = transitionWorkflowRunState(state, { type: 'loop_iteration' })
        store.advanceRound()
        currentNodeId = edge.to
        continue
      }

        // Regular edge, move to next node
        currentNodeId = edge.to
        continue
      }

      // Handle review nodes with repair loop
      if (node.kind === 'review') {
        let reviewAttempt = 0
        for (;;) {
          reviewAttempt += 1
          const result = await options.executeNode({
            node,
            attempt: reviewAttempt,
            runState: state,
            store,
          })
          executedNodeIds.push(node.id)

          if (result.status === 'success') {
            break
          }

          if (result.status === 'fatal_error') {
            errors.push(result.reason)
            state = transitionWorkflowRunState(state, { type: 'fatal_error', reason: result.reason })
            return {
              status: state.status,
              executionOrder: plan.executionOrder,
              executedNodeIds,
              repairRound: state.repairRound,
              errors,
            }
          }

          const reason = result.reason || 'review failed without reason'
          errors.push(reason)
          state = transitionWorkflowRunState(state, {
            type: 'review_failed',
          })

          if (state.status === 'needs_human') {
            return {
              status: state.status,
              executionOrder: plan.executionOrder,
              executedNodeIds,
              repairRound: state.repairRound,
              errors,
            }
          }

          if (options.repair) {
            await options.repair({
              round: state.repairRound,
              reason,
              workflow: options.workflow,
              rubric: options.rubric,
            })
          }
        }

        // Move to next node after review
        const outgoingEdges = adjacency.get(node.id) || []
        const edge = outgoingEdges[0]
        currentNodeId = edge?.to
        continue
      }

      // Handle regular nodes (plan, produce, repair, assemble)
      const result = await executeRegularNode(node, state, store, options.executeNode)
      executedNodeIds.push(node.id)

      if (result.status === 'success') {
        // Store output if available
        if (result.output !== undefined && node.outputKey) {
          store.set(node.outputKey, result.output)
        }

        // Find next node
        const outgoingEdges = adjacency.get(node.id) || []

        if (outgoingEdges.length === 0) {
          // Terminal node
          break
        }

        // Get the first edge (for non-condition nodes, we use the first edge)
        const edge = outgoingEdges[0]

        // Check if this is a back-edge with loopPolicy
        if (edge.loopPolicy) {
          const loopPolicy = edge.loopPolicy

          // Check exit condition
          if (loopPolicy.exitCondition) {
            const ctx: Record<string, unknown> = {}
            // Gather all output keys for context
            for (const ref of node.inputRefs) {
              ctx[ref] = store.getLatest(ref)
            }
            // Also add current node's output key
            if (node.outputKey) {
              ctx[node.outputKey] = store.getLatest(node.outputKey)
            }

            try {
              const shouldExit = evaluateExpression(loopPolicy.exitCondition, ctx)
              if (shouldExit) {
                // Exit condition met, don't loop back
                break
              }
            } catch (error) {
              // If evaluation fails, continue with loop
              console.warn(`Failed to evaluate exit condition:`, error)
            }
          }

          // Check max iterations
          if (state.currentIteration >= loopPolicy.maxIterations) {
            // Max iterations reached
            state = transitionWorkflowRunState(state, {
              type: 'loop_timeout',
              reason: `max iterations (${loopPolicy.maxIterations}) reached`,
            })
            return {
              status: state.status,
              executionOrder: plan.executionOrder,
              executedNodeIds,
              repairRound: state.repairRound,
              errors: [...errors, `max iterations (${loopPolicy.maxIterations}) reached`],
            }
          }

          // Loop back
          state = transitionWorkflowRunState(state, { type: 'loop_iteration' })
          store.advanceRound()
          currentNodeId = edge.to
          continue
        }

        // Regular edge, move to next node
        currentNodeId = edge.to
        continue
      }

      if (result.status === 'review_failed') {
        const reason = result.reason || `unexpected review_failed from node: ${node.id}`
        errors.push(reason)
        state = transitionWorkflowRunState(state, { type: 'fatal_error', reason })
        return {
          status: state.status,
          executionOrder: plan.executionOrder,
          executedNodeIds,
          repairRound: state.repairRound,
          errors,
        }
      }

      // fatal_error
      errors.push(result.reason)
      state = transitionWorkflowRunState(state, { type: 'fatal_error', reason: result.reason })
      return {
        status: state.status,
        executionOrder: plan.executionOrder,
        executedNodeIds,
        repairRound: state.repairRound,
        errors,
      }
    }

    state = transitionWorkflowRunState(state, { type: 'all_nodes_passed' })

    return {
      status: state.status,
      executionOrder: plan.executionOrder,
      executedNodeIds,
      repairRound: state.repairRound,
      errors,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    errors.push(reason)
    state = transitionWorkflowRunState(state, {
      type: 'fatal_error',
      reason,
    })

    return {
      status: state.status,
      executionOrder: plan.executionOrder,
      executedNodeIds,
      repairRound: state.repairRound,
      errors,
    }
  }
}
