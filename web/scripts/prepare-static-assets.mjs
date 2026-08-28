import { cp, mkdir, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

execFileSync('bash', ['scripts/pack-skills.sh', 'skill-store', 'web/public/skills'], {
  cwd: rootDir,
  stdio: 'inherit',
})

execFileSync('pnpm', ['run', 'build'], {
  cwd: path.join(rootDir, 'browser-extension'),
  stdio: 'inherit',
})

const extensionDir = path.join(rootDir, 'browser-extension', 'dist', 'chrome-mv3')
await copy(extensionDir, path.join(publicDir, 'extension'))
execFileSync('zip', ['-r', path.join(publicDir, 'chrome-extension.zip'), 'extension'], {
  cwd: publicDir,
  stdio: 'inherit',
})
