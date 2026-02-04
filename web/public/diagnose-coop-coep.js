/**
 * COOP/COEP Diagnostic Tool
 *
 * Run this script in the browser console to diagnose COOP/COEP issues.
 */
(function() {
  console.log('=== COOP/COEP Diagnostic ===')

  // Main thread diagnostics
  console.log('\n[Main Thread]')
  console.log('  crossOriginIsolated:', self.crossOriginIsolated)
  console.log('  typeof SharedArrayBuffer:', typeof SharedArrayBuffer)
  console.log('  location.href:', window.location.href)

  // Check response headers
  fetch(window.location.href)
    .then(r => {
      console.log('\n[Response Headers]')
      console.log('  COOP:', r.headers.get('Cross-Origin-Opener-Policy'))
      console.log('  COEP:', r.headers.get('Cross-Origin-Embedder-Policy'))

      // Test worker
      console.log('\n[Creating Test Worker]')
      const workerCode = `
        console.log('[Test Worker] crossOriginIsolated:', self.crossOriginIsolated)
        console.log('[Test Worker] typeof SharedArrayBuffer:', typeof SharedArrayBuffer)
        postMessage({
          crossOriginIsolated: self.crossOriginIsolated,
          typeofSharedArrayBuffer: typeof SharedArrayBuffer
        })
      `
      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const worker = new Worker(URL.createObjectURL(blob))
      worker.onmessage = (e) => {
        console.log('\n[Test Worker Results]')
        console.log('  crossOriginIsolated:', e.data.crossOriginIsolated)
        console.log('  typeof SharedArrayBuffer:', e.data.typeofSharedArrayBuffer)

        console.log('\n=== Summary ===')
        if (self.crossOriginIsolated) {
          console.log('✅ Main thread is crossOriginIsolated')
        } else {
          console.log('❌ Main thread is NOT crossOriginIsolated - COOP/COEP not working')
        }
        if (e.data.crossOriginIsolated) {
          console.log('✅ Worker is crossOriginIsolated')
        } else {
          console.log('❌ Worker is NOT crossOriginIsolated - OPFS VFS will NOT work')
        }
        if (typeof SharedArrayBuffer !== 'undefined') {
          console.log('✅ SharedArrayBuffer is available')
        } else {
          console.log('❌ SharedArrayBuffer is NOT available')
        }
      }
    })
    .catch(e => console.error('Failed to fetch headers:', e))
})()
