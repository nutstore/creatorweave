import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { sqlitePlugin } from './src/sqlite/vite-plugin-sqlite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    sqlitePlugin(), // SQLite WASM support for @sqlite.org/sqlite-wasm (set verbose: true for debugging)
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['wasm/**/*.wasm', 'icon-*.png', 'icon.svg'],
      // Disable in dev to avoid COOP/COEP conflicts
      disable: process.env.NODE_ENV === 'development',
      manifest: {
        name: 'Browser FS Analyzer',
        short_name: 'BFSA',
        description: 'Browser-based file system analyzer with SQLite storage and plugin support',
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
            description: 'Start a new analysis session',
            url: './?new=true',
            icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // Only precache static assets
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        // Disable navigateFallback - don't intercept SPA navigation
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        // Runtime caching for offline support
        // Note: runtimeCaching is compatible with COOP/COEP headers
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            // WASM files (SQLite WASM) - CacheFirst for offline support
            urlPattern: /^https:\/\/.*\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0],
              },
            },
          },
          {
            // Images - Cache with longer expiration
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
              },
            },
          },
          {
            // Fonts - Cache with long expiration
            urlPattern: /\.(?:woff|woff2|eot|ttf|otf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // External API responses - StaleWhileRevalidate for fresh data
            urlPattern: /^https:\/\/api\./i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Exclude hot updates in development
            urlPattern: /.*\.hot-update\.js$/,
            handler: 'NetworkOnly',
            options: {
              // Don't cache hot updates
            },
          },
        ],
      },
    }),
  ],
  define: {
    'process.env': {},
    __DEV__: process.env.NODE_ENV !== 'production' ? 'true' : 'false',
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
  },
  build: {
    outDir: 'dist',
    target: 'es2015',
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
    exclude: ['@sqlite.org/sqlite-wasm'],
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
