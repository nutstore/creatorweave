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

// ── Workspace Assistant: capture side panel trigger BEFORE React Router ──
// HashRouter's catch-all redirect will destroy query params in the hash.
// We import workspace-assistant-context early so its module-level IIFE
// runs synchronously here — before React mounts and before the router
// can modify the hash. The IIFE captures `source` + `origin` from the
// URL hash and sets up the per-hostname project find-or-create flow.
//
// Note: as of 2026-07-13, we no longer read `public_id` from the URL.
// Page context is delivered separately by the browser extension via
// `window.__creatorweaveSidePanel.provideContext(data)`.
import '@/agent/workspace-assistant-context'

// Mark this page as CreatorWeave so the side-panel-button content script
// (which matches <all_urls>) knows NOT to inject the "唤起怡氧知知" button
// here — you can't open the side panel from inside the side panel.
// Uses a data attribute on <html> because content scripts in the ISOLATED
// world can read DOM but NOT MAIN-world window variables.
document.documentElement.dataset.creatorweave = 'true'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './components/plugins/plugin-ui.css'
import 'sonner/dist/styles.css'
import { registerServiceWorker } from '@/pwa/register-service-worker'
import { RootErrorBoundary } from '@/components/error/RootErrorBoundary'

// Import Python module to initialize window.pythonExecutor
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
  registerServiceWorker({
    buildId: __APP_BUILD_ID__,
    onUpdateAvailable: () => {
      // Dispatch a custom event so the React layer can show a toast prompt.
      // This is safe to call before React mounts — the event is simply queued.
      window.dispatchEvent(new CustomEvent('sw-update-available'))
    },
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
)
