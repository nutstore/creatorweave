/**
 * Vite plugin for SQLite WASM support
 *
 * For @sqlite.org/sqlite-wasm, the WASM files are loaded via ESM imports
 * and handled automatically by Vite's asset system.
 *
 * This plugin ensures COOP/COEP headers are set for OPFS VFS support.
 *
 * @see https://sqlite.org/wasm/doc/trunk/index.md
 * @see https://sqlite.org/wasm/doc/trunk/persistence.md
 */

import { type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Http2ServerResponse } from 'http2'

export interface SqlitePluginOptions {
  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean
}

export function sqlitePlugin(options: SqlitePluginOptions = {}): Plugin {
  const { verbose = false } = options

  const COOP_HEADER = 'Cross-Origin-Opener-Policy'
  const COEP_HEADER = 'Cross-Origin-Embedder-Policy'

  // Helper function to set COOP/COEP headers on any response type
  const setCoopCoepHeaders = (res: ServerResponse | Http2ServerResponse): void => {
    // Use setHeader for both HTTP/1.1 and HTTP/2 compatibility
    res.setHeader(COOP_HEADER, 'same-origin')
    res.setHeader(COEP_HEADER, 'require-corp')
  }

  return {
    name: 'vite-plugin-sqlite',

    configResolved() {
      if (verbose) {
        console.log('[sqlite-plugin] Using @sqlite.org/sqlite-wasm with ESM imports')
        console.log('[sqlite-plugin] COOP/COEP headers are required for OPFS VFS')
      }
    },

    configureServer(server) {
      // Method 1: Set headers at the middleware level (runs first)
      server.middlewares.use((req, res, next) => {
        setCoopCoepHeaders(res)

        if (verbose) {
          console.log(`[sqlite-plugin] Setting COOP/COEP headers for ${req.url}`)
        }

        next()
      })

      // Method 2: Also set headers at the HTTP server level for all responses
      // This ensures headers are set even if some middleware bypasses the connect stack
      server.httpServer?.on('request', (req: IncomingMessage, res: ServerResponse) => {
        // Set headers before the response is sent
        if (!res.headersSent) {
          setCoopCoepHeaders(res)

          if (verbose && req.url?.includes('worker')) {
            console.log(`[sqlite-plugin] HTTP server level headers for ${req.url}`)
          }
        }
      })

      // Handle OPTIONS requests for CORS preflight
      server.middlewares.use((req, res, next) => {
        if (req.method === 'OPTIONS') {
          setCoopCoepHeaders(res)
          res.writeHead(204)
          res.end()
          return
        }
        next()
      })

      server.httpServer?.once('listening', () => {
        if (verbose) {
          console.log('[sqlite-plugin] SQLite WASM ready (ESM module loading)')
          console.log('[sqlite-plugin] COOP/COEP headers injected via middleware')
        }
      })
    },

    configurePreviewServer(server) {
      // Also apply headers in preview mode
      server.middlewares.use((_req, res, next) => {
        setCoopCoepHeaders(res)
        next()
      })
    },
  }
}
