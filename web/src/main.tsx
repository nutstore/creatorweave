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
import { registerServiceWorker } from '@/pwa/register-service-worker'

// Import Python module to initialize window.__executePython
import '@/python'

// React Grab - Dev environment initialization only
if (import.meta.env.DEV) {
  import('react-grab')
    .then(({ init }) => {
      init({
        theme: {
          enabled: true,
          hue: 180, // Cyan theme, coordinated with project colors
        },
        onElementSelect: (element) => {
          console.log('🎯 React Grab: Selected element', element)
        },
        onCopySuccess: () => {
          console.log('📋 React Grab: Copied to clipboard')
        },
      })
    })
    .catch((err) => {
      console.warn('React Grab failed to load (can be ignored):', err.message)
    })
}

const enableSwInDev = import.meta.env.VITE_ENABLE_SW_IN_DEV === 'true'
if (import.meta.env.PROD || enableSwInDev) {
  registerServiceWorker({ buildId: __APP_BUILD_ID__ })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
