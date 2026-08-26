/**
 * Prepare PWA assets for both `next dev` and the Next.js runtime build:
 *
 * 1. Compile the Service Worker from sw.ts into public/sw.js.
 *    The Vite→Next migration removed vite-plugin-pwa and the swDevMiddleware
 *    that used to serve /sw.js. Next serves files from public/ in development
 *    and production, so emitting the compiled worker here supports both modes.
 *
 *    sw.ts is intentionally dependency-free (see its header comment): the
 *    workbox `__WB_MANIFEST` global resolves to [] at runtime via `?? []`.
 *
 * 2. Copy the PWA icons from browser-extension/public into public/icons/.
 *    The web app shares the extension's logo; there is no separate icon set
 *    in this repo. Copying from the tracked extension source keeps dev and
 *    build working without running the full extension build.
 */
import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = path.resolve(webDir, '..')

await build({
  entryPoints: [path.join(webDir, 'sw.ts')],
  outfile: path.join(webDir, 'public', 'sw.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
})
console.log('[prepare-pwa] wrote public/sw.js')

const extensionIconsDir = path.join(rootDir, 'browser-extension', 'public')
const publicIconsDir = path.join(webDir, 'public', 'icons')
await mkdir(publicIconsDir, { recursive: true })

for (const file of ['icon.svg', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png']) {
  await copyFile(path.join(extensionIconsDir, file), path.join(publicIconsDir, file))
}
console.log('[prepare-pwa] copied extension icons → public/icons/')
