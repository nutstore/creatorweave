/**
 * Vite plugin to serve browser extension files in dev mode.
 *
 * In production, the extension files are copied to dist/extension/ via
 * the copy:extension npm script. In dev mode, this plugin:
 *
 * 1. Auto-builds the browser extension on first request (if not built yet)
 * 2. Serves files from browser-extension/dist/chrome-mv3/ at /extension/*
 * 3. Generates and serves a /chrome-extension.zip on demand
 *
 * This allows the install guide to work in dev mode — users can download
 * the zip and install the extension into their browser, then the web app
 * detects it via window.__agentWeb.
 */

import type { Plugin, ViteDevServer } from 'vite'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const EXTENSION_DIR = path.resolve(__dirname, '../browser-extension/dist/chrome-mv3')
const ROOT_DIR = path.resolve(__dirname, '..')

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.css': 'text/css',
  '.map': 'application/json',
}

function ensureExtensionBuilt(): boolean {
  if (fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
    return true
  }

  console.log('[extension-serve] Browser extension not built yet, building...')
  try {
    const extDir = path.resolve(ROOT_DIR, 'browser-extension')
    if (!fs.existsSync(path.join(extDir, 'node_modules'))) {
      console.log('[extension-serve] Installing browser-extension dependencies...')
      execSync('pnpm install', { cwd: extDir, stdio: 'pipe' })
    }
    execSync('pnpm run build', { cwd: extDir, stdio: 'pipe' })
    console.log('[extension-serve] ✅ Browser extension built successfully')
    return true
  } catch (err) {
    console.error('[extension-serve] ❌ Failed to build browser extension:', err)
    return false
  }
}

/**
 * Create a zip in memory and serve it. Uses Node's built-in
 * createReadStream since we don't have archiver in deps — instead
 * we shell out to the system's `zip` command (available on macOS/Linux).
 * Falls back to a tar.gz if zip is not available.
 */
async function createZipBuffer(): Promise<Buffer | null> {
  if (!ensureExtensionBuilt()) return null

  const tmpDir = path.join(ROOT_DIR, 'web/node_modules/.tmp-extension-zip')
  fs.mkdirSync(tmpDir, { recursive: true })
  const zipPath = path.join(tmpDir, 'chrome-extension.zip')

  // If zip already exists and is recent (< 5 min), reuse it
  try {
    const stat = fs.statSync(zipPath)
    if (Date.now() - stat.mtimeMs < 5 * 60 * 1000) {
      return fs.readFileSync(zipPath)
    }
  } catch {
    // File doesn't exist yet
  }

  try {
    // Try system zip command
    execSync(`zip -r "${zipPath}" .`, { cwd: EXTENSION_DIR, stdio: 'pipe' })
    return fs.readFileSync(zipPath)
  } catch {
    // zip command not available — try powershell on Windows
    try {
      execSync(
        `Compress-Archive -Path "${EXTENSION_DIR}/*" -DestinationPath "${zipPath}" -Force`,
        { shell: 'powershell.exe', stdio: 'pipe' }
      )
      return fs.readFileSync(zipPath)
    } catch {
      console.error('[extension-serve] Could not create zip (no zip command available)')
      return null
    }
  }
}

export function extensionServePlugin(): Plugin {
  return {
    name: 'serve-extension',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // Serve /extension/* files
      server.middlewares.use('/extension', async (req, res, next) => {
        const urlPath = (req.url || '/').replace(/^\//, '')
        const filePath = path.join(EXTENSION_DIR, urlPath)
        const resolved = path.resolve(filePath)

        // Security: ensure we don't serve files outside extension dir
        if (!resolved.startsWith(path.resolve(EXTENSION_DIR))) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        if (!ensureExtensionBuilt()) {
          res.statusCode = 503
          res.end('Extension build failed — check terminal for errors')
          return
        }

        try {
          const stat = fs.statSync(resolved)
          if (stat.isFile()) {
            const ext = path.extname(resolved)
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
            fs.createReadStream(resolved).pipe(res)
            return
          }
        } catch {
          // File not found — fall through
        }

        // Try index.html for directory requests
        try {
          const indexPath = path.join(resolved, 'index.html')
          if (fs.statSync(indexPath).isFile()) {
            res.setHeader('Content-Type', 'text/html')
            fs.createReadStream(indexPath).pipe(res)
            return
          }
        } catch {
          // No index.html
        }

        next()
      })

      // Serve /chrome-extension.zip on demand
      server.middlewares.use('/chrome-extension.zip', async (req, res) => {
        const zipBuffer = await createZipBuffer()
        if (!zipBuffer) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to create extension zip' }))
          return
        }
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', 'attachment; filename="chrome-extension.zip"')
        res.setHeader('Content-Length', zipBuffer.length)
        res.end(zipBuffer)
      })
    },
  }
}
