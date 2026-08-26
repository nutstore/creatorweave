import type { MetadataRoute } from 'next'

// The manifest is deterministic and can be cached by the Next runtime.
export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EO2Weave',
    short_name: 'EO2Weave',
    description: 'AI-native creator workspace with local-first files, knowledge workflows, and multi-agent orchestration',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0f172a',
    theme_color: '#3b82f6',
    categories: ['utilities', 'developer', 'productivity'],
    icons: [
      // Icons are copied from browser-extension/public by scripts/prepare-pwa.mjs
      // (the web app shares the extension's logo; no separate icon set exists).
      { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'New Session',
        short_name: 'New',
        description: 'Start a new creator workspace session',
        url: '/?new=true',
        icons: [{ src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png' }],
      },
    ],
  }
}
