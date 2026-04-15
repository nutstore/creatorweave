/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // 更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Development mode flag (defined in vite.config.ts)
declare const __DEV__: boolean
declare const __APP_BUILD_ID__: string
