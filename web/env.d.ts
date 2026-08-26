// Browser-only module declarations retained after removing the Vite entrypoint.

declare global {
  interface ImportMeta {
    hot?: { dispose(callback: () => void): void }
  }

  const __APP_BUILD_ID__: string
  const __APP_VERSION__: string
  const __EXTENSION_LATEST_VERSION__: string
}

declare module '*.css'
declare module '*?raw' {
  const source: string
  export default source
}
declare module '*?worker' {
  const WorkerConstructor: new () => Worker
  export default WorkerConstructor
}
declare module 'pako'

export {}
