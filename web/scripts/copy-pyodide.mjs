// Copies the pyodide npm package into public/assets/pyodide for DEV usage.
//
// prepare-static-assets.mjs (run by `pnpm run build`) already copies it
// unconditionally, but `pnpm run dev` / `make dev` never ran that script, so a
// fresh checkout had no /assets/pyodide files and the Python worker 404'd in
// dev (python/constants.ts: PYODIDE_BASE_URL = '/assets/pyodide').
//
// Keep in sync with the copy() helper in prepare-static-assets.mjs.
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pyodideSrc = path.join(webDir, 'node_modules', 'pyodide')
const destDir = path.join(webDir, 'public', 'assets', 'pyodide')
const versionMarker = path.join(destDir, '.copied-version')

async function installedVersion() {
  const pkg = JSON.parse(await readFile(path.join(pyodideSrc, 'package.json'), 'utf8'))
  return pkg.version
}

async function currentMarker() {
  try {
    return (await readFile(versionMarker, 'utf8')).trim()
  } catch {
    return null
  }
}

// dereference: pnpm installs packages (e.g. node_modules/pyodide) as symlinks
// into the .pnpm store. With fs.cp's default (dereference: false) the copied
// public/ asset would stay a symlink, which deployment packaging does not
// follow — the files never reach production and /assets/pyodide/* 404s.
async function main() {
  const version = await installedVersion()
  const [entrypointExists, marker] = await Promise.all([
    stat(path.join(destDir, 'pyodide.js')).then(
      () => true,
      () => false,
    ),
    currentMarker(),
  ])
  if (entrypointExists && marker === version) {
    console.log(`pyodide ${version} already copied to public/assets/pyodide, skipping`)
    return
  }
  await rm(destDir, { recursive: true, force: true })
  await mkdir(path.dirname(destDir), { recursive: true })
  await cp(pyodideSrc, destDir, { recursive: true, dereference: true })
  await writeFile(versionMarker, version)
  console.log(`copied pyodide ${version} -> public/assets/pyodide`)
}

await main()
