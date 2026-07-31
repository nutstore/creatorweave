/**
 * Vite-aware Monaco language worker configuration.
 *
 * @monaco-editor/react's loader config supplies the Monaco namespace, but it
 * does not tell Monaco how to create language-service workers. Vite's
 * `?worker` imports emit those worker bundles and provide constructors for
 * both development and production builds.
 */
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

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
        return new JsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker()
      case 'typescript':
      case 'javascript':
        return new TsWorker()
      default:
        return new EditorWorker()
    }
  },
}
