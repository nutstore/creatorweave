/**
 * WASM Module Loader
 * Loads the WASM module and makes it available globally
 * This file is loaded before the main app to ensure WASM is available
 */
(function() {
  // Create a shim that will load the WASM module
  const script = document.createElement('script')
  script.type = 'module'
  script.textContent = `
    // Load the WASM module
    import('/wasm/browser_fs_analyzer_wasm.js').then(module => {
      // Expose it globally
      window.BrowserFsAnalyzerWasm = module;
      // Dispatch ready event
      window.dispatchEvent(new CustomEvent('wasm-ready'));
    }).catch(err => {
      console.error('Failed to load WASM module:', err);
      window.dispatchEvent(new CustomEvent('wasm-error', { detail: err }));
    });
  `

  // Insert before other scripts
  document.head.insertBefore(script, document.head.firstChild)
})()
