// ============================================================================
// Early COOP/COEP Diagnostics
// ============================================================================
console.log('[Main Thread] Early diagnostics:')
console.log('[Main Thread]  - typeof SharedArrayBuffer:', typeof SharedArrayBuffer)
console.log(
  '[Main Thread]  - SharedArrayBuffer available:',
  typeof SharedArrayBuffer !== 'undefined'
)
console.log('[Main Thread]  - crossOriginIsolated:', self.crossOriginIsolated)
console.log('[Main Thread]  - location:', window.location.href)
console.log('[Main Thread]  - navigator.userAgent:', navigator.userAgent)

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './components/plugins/plugin-ui.css'
import 'sonner/dist/styles.css'

// React Grab - 仅开发环境初始化
if (import.meta.env.DEV) {
  import('react-grab')
    .then(({ init }) => {
      init({
        theme: {
          enabled: true,
          hue: 180, // 青色主题，与项目配色协调
        },
        onElementSelect: (element) => {
          console.log('🎯 React Grab: 选中元素', element)
        },
        onCopySuccess: () => {
          console.log('📋 React Grab: 已复制到剪贴板')
        },
      })
    })
    .catch((err) => {
      console.warn('React Grab 加载失败 (可忽略):', err.message)
    })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
