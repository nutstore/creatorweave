import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { sqlitePlugin } from './src/sqlite/vite-plugin-sqlite'
import { VitePWA } from 'vite-plugin-pwa'
import { syncGuardPlugin } from './vite-plugin-sync-guard'
import { docsSyncPlugin } from './vite-plugin-docs-sync'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isVitest = process.env.VITEST === 'true'
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || new Date().toISOString()

/**
 * Vite plugin to serve pyodide files from node_modules in dev mode.
 * Core files (pyodide.asm.wasm etc.) are served locally.
 * Package files (.whl) that don't exist locally are proxied from CDN.
 * In production, files are copied via copy:pyodide script instead.
 */
function pyodideServePlugin(): Plugin {
  return {
    name: 'serve-pyodide',
    configureServer(server) {
      const pyodideDir = path.resolve(__dirname, 'node_modules/pyodide')
      const pyodideVersion = require('./node_modules/pyodide/package.json').version
      const cdnBase = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full`

      server.middlewares.use('/assets/pyodide', async (req: any, res: any, next: any) => {
        const filePath = path.join(pyodideDir, req.url || '')
        const resolved = path.resolve(filePath)

        // Security: ensure we don't serve files outside pyodide dir
        if (!resolved.startsWith(pyodideDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        // Try local file first (core files like pyodide.asm.wasm)
        try {
          const stat = fs.statSync(resolved)
          if (stat.isFile()) {
            const ext = path.extname(resolved)
            const mimeTypes: Record<string, string> = {
              '.wasm': 'application/wasm',
              '.js': 'application/javascript',
              '.json': 'application/json',
              '.tar': 'application/x-tar',
              '.whl': 'application/zip',
              '.data': 'application/octet-stream',
            }
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
            fs.createReadStream(resolved).pipe(res)
            return
          }
        } catch {
          // File not found locally, fall through to CDN proxy
        }

        // Fallback: proxy .whl/.tar package files from CDN
        const fileName = (req.url || '').replace(/^\//, '')
        if (fileName && (fileName.endsWith('.whl') || fileName.endsWith('.tar'))) {
          try {
            const cdnUrl = `${cdnBase}/${fileName}`
            const cdnRes = await fetch(cdnUrl)
            if (cdnRes.ok) {
              const ext = path.extname(fileName)
              const mimeTypes: Record<string, string> = {
                '.whl': 'application/zip',
                '.tar': 'application/x-tar',
              }
              res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
              res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
              res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
              const body = await cdnRes.arrayBuffer()
              res.end(Buffer.from(body))
              return
            }
          } catch {
            // CDN fetch failed, fall through
          }
        }

        next()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    pyodideServePlugin(),
    syncGuardPlugin(),
    ...(isVitest ? [] : [docsSyncPlugin()]),
    sqlitePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['wasm/**/*.wasm', 'icon-*.png', 'icon.svg'],
      // Disable in dev to avoid COOP/COEP conflicts
      disable: process.env.NODE_ENV === 'development',
      // We register SW manually in src/main.tsx to enforce versioned script URL.
      injectRegister: false,
      manifest: {
        name: 'CreatorWeave',
        short_name: 'CWeave',
        description: 'AI-native creator workspace with local-first files, knowledge workflows, and multi-agent orchestration',
        theme_color: '#3b82f6',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        categories: ['utilities', 'developer', 'productivity'],
        shortcuts: [
          {
            name: 'New Session',
            short_name: 'New',
            description: 'Start a new creator workspace session',
            url: './?new=true',
            icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
  define: {
    // Avoid mutating read-only Node process fields during Vitest runtime.
    ...(isVitest
      ? {}
      : {
          'process.env': {},
          'process.platform': JSON.stringify('browser'),
          'process.version': JSON.stringify(''),
          'process.browser': JSON.stringify(true),
        }),
    __DEV__: process.env.NODE_ENV !== 'production' ? JSON.stringify(true) : JSON.stringify(false),
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  worker: {
    format: 'es',
    plugins: () => [react()],
    // Note: COOP/COEP headers for workers are set by vite-plugin-sqlite middleware
    // Vite doesn't support worker.headers directly - headers must be set via server middleware
  },

  // Configure handling of WASM assets for @sqlite.org/sqlite-wasm
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // Listen on all interfaces for mobile access
    port: 5173,
    open: true,
    headers: {
      // Required for @sqlite.org/sqlite-wasm OPFS VFS support
      // See: https://sqlite.org/wasm/doc/trunk/persistence.md
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Allow serving docs from public directory
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          zustand: ['zustand'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm', 'pyodide'],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    includeSource: ['src/**/*.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test-setup.ts',
        'src/test-helpers/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/**/*.d.ts',
        'src/wasm/', // 生成的 WASM 类型
        'src/mocks/', // Mock 数据
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
      all: true,
    },
    threads: true,
    maxThreads: 4,
    testTimeout: 10000,
    hookTimeout: 10000,
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
  },
})
