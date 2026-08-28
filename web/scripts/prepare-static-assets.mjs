import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { readdir, readFile } from 'node:fs/promises'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = path.resolve(webDir, '..')
const publicDir = path.join(webDir, 'public')

async function copy(source, destination) {
  await rm(destination, { recursive: true, force: true })
  await mkdir(path.dirname(destination), { recursive: true })
  // dereference: pnpm installs packages (e.g. node_modules/pyodide) as symlinks
  // into the .pnpm store. With fs.cp's default (dereference: false) the copied
  // public/ asset would stay a symlink, which deployment packaging does not
  // follow — the files never reach production and /assets/pyodide/* 404s.
  await cp(source, destination, { recursive: true, dereference: true })
}

await copy(path.join(webDir, 'node_modules', 'pyodide'), path.join(publicDir, 'assets', 'pyodide'))
execFileSync('node', ['scripts/sync-docs.mjs'], { cwd: webDir, stdio: 'inherit' })

execFileSync('node', ['scripts/pack-skills.mjs', '../skill-store', 'public/skills'], {
  cwd: webDir,
  stdio: 'inherit',
})

execFileSync('pnpm', ['run', 'build'], {
  cwd: path.join(rootDir, 'browser-extension'),
  stdio: 'inherit',
})

const extensionDir = path.join(rootDir, 'browser-extension', 'dist', 'chrome-mv3')
await copy(extensionDir, path.join(publicDir, 'extension'))
// Zip with fflate: CI nodes (office-linux) have no zip(1). Layout matches the
// former `zip -r chrome-extension.zip extension` (files under extension/).
async function collectFiles(dir, acc = {}) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectFiles(full, acc)
    else {
      const rel = path.relative(dir, full).split(path.sep).join('/')
      acc[rel] = new Uint8Array(await readFile(full))
    }
  }
  return acc
}
{
  const extDir = path.join(publicDir, 'extension')
  const files = await collectFiles(extDir)
  // Store paths relative to publicDir's `extension/` root so the archive
  // matches the previous `cd public && zip -r chrome-extension.zip extension`:
  // every entry starts with `extension/`.
  const prefixed = Object.fromEntries(
    Object.entries(files).map(([rel, data]) => [`extension/${rel}`, data]),
  )
  await writeFile(path.join(publicDir, 'chrome-extension.zip'), zipSync(prefixed, { level: 6 }))
}
