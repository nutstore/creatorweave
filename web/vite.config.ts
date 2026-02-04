import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { sqlitePlugin } from './src/sqlite/vite-plugin-sqlite'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    sqlitePlugin(), // SQLite WASM support for @sqlite.org/sqlite-wasm (set verbose: true for debugging)
  ],
  define: {
    'process.env': {},
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
  // Configure handling of WASM assets for @sqlite.org/sqlite-wasm
  assetsInclude: ['**/*.wasm'],
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
