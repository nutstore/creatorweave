// Browser-only module declarations retained after removing the Vite entrypoint.

declare global {
  interface ImportMeta {
    env: {
      DEV: boolean
      PROD: boolean
      BASE_URL?: string
      VITE_JIANGUOYUN_AI_BASE_URL?: string
      VITE_JIANGUOYUN_AI_CLIENT_ID?: string
      VITE_ENABLE_SW_IN_DEV?: string
      MODE?: string
    }
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
