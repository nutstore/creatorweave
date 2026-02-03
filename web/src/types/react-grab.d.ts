/**
 * React Grab 类型声明
 * 仅在开发环境使用
 */

declare module 'react-grab' {
  export interface ElementInfo {
    componentName: string
    fileName: string
    filePath: string
    sourceCode?: string
    html: string
  }

  export interface ReactGrabTheme {
    enabled: boolean
    hue?: number
    crosshair?: {
      enabled: boolean
    }
    elementLabel?: {
      enabled: boolean
    }
  }

  export interface ReactGrabConfig {
    theme?: ReactGrabTheme
    onElementSelect?: (element: ElementInfo) => void
    onCopySuccess?: (elements: ElementInfo[], content: string) => void
    onStateChange?: (state: { isActive: boolean }) => void
  }

  export interface ReactGrabAPI {
    activate: () => void
    deactivate: () => void
    getState: () => { isActive: boolean }
    copyElement: (element: HTMLElement) => void
  }

  export function init(config?: ReactGrabConfig): ReactGrabAPI
}

declare global {
  interface Window {
    __REACT_GRAB__?: ReactGrabAPI
  }
}

export {}
