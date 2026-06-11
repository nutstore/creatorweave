/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // 更多环境变量...

  // LLM Gateway (坚果云 AI)
  readonly VITE_JIANGUOYUN_AI_BASE_URL?: string
  readonly VITE_JIANGUOYUN_AI_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Development mode flag (defined in vite.config.ts)
declare const __DEV__: boolean
declare const __APP_BUILD_ID__: string
declare const __EXTENSION_LATEST_VERSION__: string
