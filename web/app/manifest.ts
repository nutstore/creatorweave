import type { MetadataRoute } from 'next'

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
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'New Session',
        short_name: 'New',
        description: 'Start a new creator workspace session',
        url: '/?new=true',
        icons: [{ src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
