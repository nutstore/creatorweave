/**
 * WASM Tool Executor - executes new ABI WASM tools through the Agent.
 *
 * Handles plugins that export get_tool_schema() and execute_tool(),
 * converting their schema to ToolDefinition and executing them with
 * permission checks.
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'
import type { WasmToolSchema, WasmToolOutput, PluginInstance } from '@/types/plugin'
import { getPluginLoader } from '@/services/plugin-loader.service'
import { getPermissionLayer } from '@/security/permission-layer'

/**
 * Convert a WasmToolSchema to an OpenAI-compatible ToolDefinition.
 */
export function wasmToolSchemaToDefinition(schema: WasmToolSchema): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: `wasm_tool_${schema.name}`,
      description: `[WASM Tool] ${schema.description}`,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(schema.parameters.properties).map(([key, prop]) => [
            key,
            {
              type: prop.type,
              description: prop.description,
              enum: prop.enum,
              items: prop.items
                ? { type: prop.items.type, description: prop.items.description }
                : undefined,
              default: prop.default,
            },
          ])
        ),
        required: schema.parameters.required,
      },
    },
  }
}

/**
 * Create a ToolExecutor for a WASM tool plugin.
 *
 * The executor sends EXECUTE_TOOL messages to the plugin worker
 * and returns the result.
 */
export function createWasmToolExecutor(pluginId: string): ToolExecutor {
  return async (args: Record<string, unknown>, _context: ToolContext): Promise<string> => {
    const loader = getPluginLoader()
    const instance = loader.getPlugin(pluginId)
    if (!instance) {
      return JSON.stringify({ error: `Plugin not loaded: ${pluginId}` })
    }
    if (!instance.worker) {
      return JSON.stringify({ error: `Plugin worker not available: ${pluginId}` })
    }

    // Check file path permissions if args contain paths
    const permLayer = getPermissionLayer()
    for (const [key, value] of Object.entries(args)) {
      if (
        typeof value === 'string' &&
        (key.toLowerCase().includes('path') || key.toLowerCase().includes('file'))
      ) {
        const readCheck = permLayer.checkRead(pluginId, value)
        if (!readCheck.allowed) {
          return JSON.stringify({ error: readCheck.reason })
        }
      }
    }

    // Build tool input
    const toolInput = JSON.stringify({
      args,
      working_dir: null,
    })

    // Execute via worker
    try {
      const output = await executeToolViaWorker(instance, toolInput)
      if (output.success) {
        return output.result
      } else {
        return JSON.stringify({ error: output.error || 'Tool execution failed' })
      }
    } catch (error) {
      return JSON.stringify({
        error: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
}

/**
 * Send EXECUTE_TOOL message to worker and await response.
 */
function executeToolViaWorker(
  instance: PluginInstance,
  inputJson: string
): Promise<WasmToolOutput> {
  return new Promise((resolve, reject) => {
    if (!instance.worker) {
      reject(new Error('No worker available'))
      return
    }

    const timeout = setTimeout(() => {
      reject(new Error('Tool execution timeout (30s)'))
    }, 30_000)

    const handler = (event: MessageEvent) => {
      const response = event.data
      if (response.type === 'RESULT' && response.payload?.toolOutput) {
        clearTimeout(timeout)
        instance.worker?.removeEventListener('message', handler)
        resolve(response.payload.toolOutput as WasmToolOutput)
      } else if (response.type === 'ERROR') {
        clearTimeout(timeout)
        instance.worker?.removeEventListener('message', handler)
        reject(new Error(response.error || 'Unknown worker error'))
      }
    }

    instance.worker.addEventListener('message', handler)
    instance.worker.postMessage({
      type: 'EXECUTE_TOOL',
      payload: { input: inputJson },
    })
  })
}

/**
 * Query a plugin worker for its tool schema.
 */
export function getToolSchemaFromWorker(instance: PluginInstance): Promise<WasmToolSchema | null> {
  return new Promise((resolve, reject) => {
    if (!instance.worker) {
      reject(new Error('No worker available'))
      return
    }

    const timeout = setTimeout(() => {
      resolve(null) // Timeout means not tool-capable
    }, 5_000)

    const handler = (event: MessageEvent) => {
      const response = event.data
      if (response.type === 'RESULT' && response.payload?.isToolCapable !== undefined) {
        clearTimeout(timeout)
        instance.worker?.removeEventListener('message', handler)
        if (response.payload.isToolCapable && response.payload.toolSchema) {
          resolve(response.payload.toolSchema as WasmToolSchema)
        } else {
          resolve(null)
        }
      } else if (response.type === 'ERROR') {
        clearTimeout(timeout)
        instance.worker?.removeEventListener('message', handler)
        resolve(null)
      }
    }

    instance.worker.addEventListener('message', handler)
    instance.worker.postMessage({ type: 'GET_TOOL_SCHEMA' })
  })
}
