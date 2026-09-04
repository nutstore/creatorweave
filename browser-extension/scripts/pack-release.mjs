/**
 * Pack a self-distribution zip of the extension (Codex OAuth kept).
 *
 * Difference from `zip:store`: this script does NOT set CW_STORE_BUILD=1, so
 * the manifest keeps the pinned extension `key` (stable ID → native messaging
 * allowed_origins stays valid). `zip:store` is the CWS variant: CW_STORE_BUILD=1
 * omits the `key` because CWS rejects manifests that carry one. Both variants
 * keep Codex OAuth by default; set CW_CODEX_OAUTH=0 on either to strip Codex
 * at build time (the two flags are orthogonal).
 *
 * Flow: pnpm exec wxt zip (= full build + zip dist/chrome-mv3, zip root IS the
 * extension root so manifest.json sits at the top level as CWS requires) →
 * validate output → remove stale zips → rename to eo2weave-chrome-v{version}.zip.
 *
 * Usage: pnpm pack:release
 * Output: browser-extension/dist/eo2weave-chrome-v{version}.zip
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const extDir = path.resolve(scriptDir, '..')
const distDir = path.join(extDir, 'dist')

const pkg = JSON.parse(readFileSync(path.join(extDir, 'package.json'), 'utf8'))
const version = pkg.version
const wxtZipName = `${pkg.name}-${version}-chrome.zip`

console.log(`[pack:release] building & zipping v${version} (Codex OAuth kept)...`)
// Inherit the current environment; CW_CODEX_OAUTH is not forced here, so Codex
// OAuth stays in the bundle.
execFileSync('pnpm', ['exec', 'wxt', 'zip'], { cwd: extDir, stdio: 'inherit' })

const produced = path.join(distDir, wxtZipName)
if (!existsSync(produced)) {
  console.error(`[pack:release] expected wxt zip not found: ${produced}`)
  process.exit(1)
}

// wxt zip packs dist/chrome-mv3 (the build output without modeSuffix), so
// validate that directory directly.
const outDir = path.join(distDir, 'chrome-mv3')
if (!existsSync(path.join(outDir, 'manifest.json'))) {
  console.error(`[pack:release] missing manifest.json in ${outDir}`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))

const problems = []
if (manifest.version !== version) {
  problems.push(`manifest.version=${manifest.version} != package.json ${version}`)
}
if (manifest.manifest_version !== 3) {
  problems.push(`unexpected manifest_version=${manifest.manifest_version}`)
}
if (manifest.name !== '__MSG_extensionName__' && manifest.name !== 'EO2Weave') {
  // dev builds use __MSG_extensionNameDev__; seeing it in a release package
  // means the wrong output directory was packed.
  problems.push(`manifest.name=${manifest.name} looks like a dev build`)
}
if (!existsSync(path.join(outDir, '_locales', 'en', 'messages.json'))) {
  problems.push('_locales/en/messages.json missing (default_locale would dangle)')
}
// Self-distribution builds MUST keep the pinned key (stable ID → native-host
// allowed_origins stays valid); store builds (CW_STORE_BUILD=1) are the
// opposite — CWS rejects any manifest that contains a `key` field.
if (process.env.CW_STORE_BUILD === '1' && manifest.key) {
  problems.push('manifest.key present in store build — CWS upload will be REJECTED (清单文件中不允许使用 key 字段)')
}
if (process.env.CW_STORE_BUILD !== '1' && !manifest.key) {
  problems.push('manifest.key missing in self-distribution build — native-host allowed_origins would break (ID drift)')
}

// Chrome MV3 refuses to load resource paths starting with "_" (_locales
// excepted). The `_virtual_*` chunk was a past incident — the sanitize plugin
// in wxt.config.ts renames it; this is a defensive re-check.
const reserved = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.startsWith('_')) reserved.push(path.relative(outDir, full))
  }
}
walk(outDir)
for (const f of reserved) problems.push(`reserved "_"-prefixed file in output: ${f}`)

// Remove stale zips from dist (a leftover 1.1.4 zip once nearly got uploaded
// as "the latest"); keep only this run's output.
for (const f of readdirSync(distDir)) {
  if (f.endsWith('.zip') && f !== wxtZipName) {
    unlinkSync(path.join(distDir, f))
    console.log(`[pack:release] removed stale zip: ${f}`)
  }
}

const finalName = `eo2weave-chrome-v${version}.zip`
renameSync(produced, path.join(distDir, finalName))
const sizeKB = Math.round(statSync(path.join(distDir, finalName)).size / 1024)

if (problems.length) {
  console.error(`[pack:release] WARNING — dist/${finalName} generated, but review before uploading:`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exitCode = 1
} else {
  console.log(`[pack:release] OK → browser-extension/dist/${finalName} (${sizeKB} KB, manifest v${manifest.version})`)
}
