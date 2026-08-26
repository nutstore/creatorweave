/* tslint:disable */
/* eslint-disable */

/**
 * Cleanup - no-op with wasm-bindgen automatic memory management
 */
export function cleanup(): void

/**
 * Finalize and aggregate results
 */
export function finalize(outputs_json: string): string

/**
 * Get plugin metadata - returns JSON string
 */
export function get_plugin_info(): string

/**
 * Process a file - receives JSON string, returns JSON string
 * Using String types lets wasm-bindgen handle memory automatically
 */
export function process_file(input_json: string): string

/**
 * Stream chunk - process a chunk during streaming
 */
export function stream_chunk(_chunk_json: string): string

/**
 * Stream complete - finalize streaming
 */
export function stream_complete(): string

/**
 * Stream init - initialize streaming state
 */
export function stream_init(): void

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module

export interface InitOutput {
  readonly memory: WebAssembly.Memory
  readonly get_plugin_info: (a: number) => void
  readonly process_file: (a: number, b: number, c: number) => void
  readonly finalize: (a: number, b: number, c: number) => void
  readonly cleanup: () => void
  readonly stream_chunk: (a: number, b: number, c: number) => void
  readonly stream_complete: (a: number) => void
  readonly stream_init: () => void
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number
  readonly __wbindgen_export: (a: number, b: number) => number
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number
  readonly __wbindgen_export3: (a: number, b: number, c: number) => void
}

export type SyncInitInput = BufferSource | WebAssembly.Module

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>
): Promise<InitOutput>
