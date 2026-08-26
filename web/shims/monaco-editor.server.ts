/**
 * Server-side stub for monaco-editor in the Next runtime build.
 *
 * monaco-editor reads `window` at module scope (vs/base/browser/window.js),
 * so evaluating it in Node throws `window is not defined`. During server
 * compilation, Next evaluates the client module graph in the SSR bundle,
 * including components loaded via `dynamic(..., { ssr: false })`.
 * next.config.mjs rewrites every `monaco-editor` request
 * (bare specifier and deep ESM worker paths) to this stub for server bundles
 * only; the client bundle keeps the real package.
 *
 * The only runtime use of the monaco namespace on the affected paths is
 * `loader.config({ monaco })` from @monaco-editor/react, which merely stores
 * the reference and is never exercised server-side. All other uses are
 * TypeScript types, which are erased at compile time.
 */

const monacoStub: Record<string, unknown> = {}

export default monacoStub
export const editor = monacoStub
export const languages = monacoStub
export const Uri = monacoStub
export const KeyMod = monacoStub
export const KeyCode = monacoStub
export const MarkerSeverity = monacoStub
export const Emitter = monacoStub
export const Disposable = monacoStub
