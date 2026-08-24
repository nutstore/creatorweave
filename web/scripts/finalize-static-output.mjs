import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = path.resolve(webDir, '..')
const distDir = path.join(webDir, 'dist')

// EdgeOne reads its deployment policy from the static artifact. Vercel reads
// the root vercel.json directly, so this copy is intentionally harmless there.
await rm(path.join(distDir, 'middleware.js'), { force: true })
await rm(path.join(distDir, 'package.json'), { force: true })
await rm(path.join(distDir, 'cloud-functions'), { recursive: true, force: true })
await cp(path.join(rootDir, 'edgeone.json'), path.join(distDir, 'edgeone.json'))
