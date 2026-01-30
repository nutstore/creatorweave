/* tslint:disable */
/* eslint-disable */

/**
 * File analyzer
 *
 * Maintains file size statistics and provides accumulation and query functions
 */
export class FileAnalyzer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a single file size
     *
     * # Arguments
     * * `size` - File size in bytes
     */
    add_file(size: bigint): void;
    /**
     * Add file sizes in batch
     *
     * # Arguments
     * * `sizes` - Array of file sizes in bytes
     */
    add_files(sizes: BigUint64Array): void;
    /**
     * Get average file size
     *
     * # Returns
     * Average file size in bytes
     */
    get_average(): number;
    /**
     * Get file count
     *
     * # Returns
     * File count
     */
    get_count(): bigint;
    /**
     * Get total size
     *
     * # Returns
     * Total size in bytes
     */
    get_total(): bigint;
    /**
     * Create a new file analyzer
     */
    constructor();
    /**
     * Reset analyzer state
     */
    reset(): void;
}

/**
 * Utility function: Calculate the average of file sizes
 *
 * # Arguments
 * * `sizes` - Array of file sizes in bytes
 *
 * # Returns
 * Average file size in bytes, or 0 if array is empty
 */
export function calculate_average_size(sizes: BigUint64Array): number;

/**
 * Utility function: Calculate the sum of file sizes
 *
 * # Arguments
 * * `sizes` - Array of file sizes in bytes
 *
 * # Returns
 * Total size in bytes
 */
export function calculate_total_size(sizes: BigUint64Array): bigint;

export function init(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_fileanalyzer_free: (a: number, b: number) => void;
    readonly fileanalyzer_new: () => number;
    readonly fileanalyzer_add_file: (a: number, b: bigint) => void;
    readonly fileanalyzer_add_files: (a: number, b: number, c: number) => void;
    readonly fileanalyzer_get_total: (a: number) => bigint;
    readonly fileanalyzer_get_count: (a: number) => bigint;
    readonly fileanalyzer_get_average: (a: number) => number;
    readonly fileanalyzer_reset: (a: number) => void;
    readonly calculate_total_size: (a: number, b: number) => bigint;
    readonly calculate_average_size: (a: number, b: number) => number;
    readonly init: () => void;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
