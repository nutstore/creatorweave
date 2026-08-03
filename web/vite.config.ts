import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { transformSync } from 'esbuild'
import { sqlitePlugin } from './src/sqlite/vite-plugin-sqlite'
import { VitePWA } from 'vite-plugin-pwa'
import { syncGuardPlugin } from './vite-plugin-sync-guard'
import { docsSyncPlugin } from './vite-plugin-docs-sync'
import { extensionServePlugin } from './vite-plugin-extension-serve'
import { serveSkillStore } from './vite-plugin-skill-store'
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
            res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
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
              res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
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

/**
 * Vite dev-server middleware that serves src/sw.ts as the Service Worker
 * at /sw.js with the correct `application/javascript` MIME type.
 *
 * This replaces vite-plugin-pwa's dev middleware, which doesn't always
 * register correctly (returns text/html instead of JS, breaking SW
 * registration with SecurityError). Recompiles on every request — dev
 * only, performance is irrelevant.
 */
function swDevMiddleware(): Plugin {
  return {
    name: 'sw-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url !== '/sw.js') {
          next()
          return
        }
        try {
          const swPath = path.resolve(__dirname, 'src/sw.ts')
          const source = fs.readFileSync(swPath, 'utf-8')
          const result = transformSync(source, {
            loader: 'ts',
            format: 'iife',
            target: 'es2020',
          })
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.setHeader('Service-Worker-Allowed', '/')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(result.code)
        } catch (err) {
          console.error('[sw-dev-middleware] failed:', err)
          res.statusCode = 500
          res.end(`SW build failed: ${(err as Error).message}`)
        }
      })
    },
  }
}

/**
 * Vite plugin to shim `node:zlib` for browser builds.
 *
 * `just-bash` browser bundle imports `gunzipSync` from `node:zlib` for
 * `rg --search-zip` decompression. Vite's default `__vite-browser-external`
 * doesn't export it, causing rollup to error during build.
 * This plugin provides a virtual module with throwing stubs — gzip support
 * is NOT needed (bash tool lists tar/gzip as unavailable).
 */
function nodeZlibShimPlugin(): Plugin {
  const virtualId = '\0virtual:node-zlib'
  const shimCode = `
const _err = (n) => () => { throw new Error('node:zlib.' + n + ' is not available in the browser') };
export const gunzipSync = _err('gunzipSync');
export const gzipSync = _err('gzipSync');
export const deflateSync = _err('deflateSync');
export const inflateSync = _err('inflateSync');
export const deflateRawSync = _err('deflateRawSync');
export const inflateRawSync = _err('inflateRawSync');
export const unzipSync = _err('unzipSync');
export const createGzip = _err('createGzip');
export const createGunzip = _err('createGunzip');
export const createDeflate = _err('createDeflate');
export const createInflate = _err('createInflate');
export const createDeflateRaw = _err('createDeflateRaw');
export const createInflateRaw = _err('createInflateRaw');
export const constants = {};
export default { gunzipSync, gzipSync, deflateSync, inflateSync, constants };
`
  return {
    name: 'node-zlib-shim',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'node:zlib' || source === 'zlib') return virtualId
    },
    load(id) {
      if (id === virtualId) return shimCode
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    nodeZlibShimPlugin(),
    react(),
    pyodideServePlugin(),
    syncGuardPlugin(),
    ...(isVitest ? [] : [docsSyncPlugin()]),
    ...(isVitest ? [] : [extensionServePlugin()]),
    swDevMiddleware(),
    sqlitePlugin(),
    ...(isVitest ? [] : [serveSkillStore({ src: 'dist/skills' })]),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['wasm/**/*.wasm', 'icon-*.png', 'icon.svg'],
      // Production SW is built by vite-plugin-pwa as usual. Dev mode is
      // handled by swDevMiddleware() above (vite-plugin-pwa's dev middleware
      // doesn't reliably serve sw.js with the right MIME type).
      disable: false,
      devOptions: {
        enabled: false, // Disabled — swDevMiddleware handles dev /sw.js
      },
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
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    __EXTENSION_LATEST_VERSION__: JSON.stringify(
      process.env.EXTENSION_LATEST_VERSION
      || (() => { try { return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../browser-extension/package.json'), 'utf-8')).version } catch { return '0.0.0' } })()
    ),
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
    // Production: no sourcemap to avoid giant .map files (>25MB, exceeding EdgeOne limit)
    // Dev: sourcemaps enabled for debugging
    sourcemap: process.env.NODE_ENV !== 'production',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor'
          }
          // Zustand
          if (id.includes('node_modules/zustand/')) {
            return 'zustand'
          }
          // Monaco Editor - split each language worker into its own chunk
          // This alone saves ~7MB from the main bundle
          if (id.includes('node_modules/monaco-editor/')) {
            return 'monaco-editor'
          }
          // TipTap editor
          if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror')) {
            return 'tiptap'
          }
          // SQLite WASM
          if (id.includes('node_modules/@sqlite.org/')) {
            return 'sqlite'
          }
          // Tesseract.js OCR (lazy-loaded, only when user uploads an image)
          if (id.includes('node_modules/tesseract.js/') || id.includes('node_modules/tesseract.js-core/')) {
            return 'tesseract'
          }
          // Large utility libraries
          if (id.includes('node_modules/lodash-es/') || id.includes('node_modules/lodash/')) {
            return 'lodash'
          }
          // XLSX / spreadsheet handling
          if (id.includes('node_modules/xlsx/') || id.includes('node_modules/exceljs/')) {
            return 'xlsx'
          }
          // just-bash: do NOT add to manualChunks — it uses dynamic import()
          // and contains node:zlib references that break PWA buildEnd scanning.
          // Leaving it as a dynamic-import chunk avoids rollup parsing its internals.
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
