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
 * 2. (Removed) Copying the PWA icons from browser-extension/public into
 *    public/icons/ — public/icons/ is now the canonical, git-tracked icon
 *    set; it is no longer generated from the extension's assets.
 */
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
