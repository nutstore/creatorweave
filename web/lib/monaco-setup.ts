/**
 * Monaco language worker configuration for Next/Webpack.
 *
 * `new Worker(new URL(..., import.meta.url))` is understood by both Next's
 * webpack compiler and the browser at runtime, without Vite's `?worker`
 * resource-query transform.
 */
const createEditorWorker = () => new Worker(
  new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url),
  { type: 'module' }
)
const createJsonWorker = () => new Worker(
  new URL('monaco-editor/esm/vs/language/json/json.worker', import.meta.url),
  { type: 'module' }
)
const createCssWorker = () => new Worker(
  new URL('monaco-editor/esm/vs/language/css/css.worker', import.meta.url),
  { type: 'module' }
)
const createHtmlWorker = () => new Worker(
  new URL('monaco-editor/esm/vs/language/html/html.worker', import.meta.url),
  { type: 'module' }
)
const createTypeScriptWorker = () => new Worker(
  new URL('monaco-editor/esm/vs/language/typescript/ts.worker', import.meta.url),
  { type: 'module' }
)

type MonacoWorkerEnvironment = {
  getWorker: (_moduleId: string, label: string) => Worker
}

type GlobalWithMonacoEnvironment = typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment
}

const globalScope = globalThis as GlobalWithMonacoEnvironment

// This module is cached by ESM, so every Monaco consumer can safely import it.
// Assigning rather than merging intentionally provides one authoritative worker
// router for the application.
globalScope.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    switch (label) {
      case 'json':
        return createJsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return createCssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return createHtmlWorker()
      case 'typescript':
      case 'javascript':
        return createTypeScriptWorker()
      default:
        return createEditorWorker()
    }
  },
}
