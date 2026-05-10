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

// React Scan - Visualize unnecessary re-renders in dev
if (import.meta.env.DEV) {
  import('react-scan')
    .then(({ scan }) => {
      scan({
        enabled: true,
        log: true, // Also log render info to console
        showToolbar: true, // Show floating toolbar for toggling
      })
    })
    .catch((err) => {
      console.warn('React Scan failed to load (can be ignored):', err.message)
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
