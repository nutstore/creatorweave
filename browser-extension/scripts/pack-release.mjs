/**
 * 打包 Chrome Web Store / 自分发上传用的扩展 zip（保留 Codex OAuth）。
 *
 * 与 `zip:store` 的区别：本脚本不设置 CW_CODEX_OAUTH=0，不做 Codex 功能裁剪
 * （__CW_CODEX_OAUTH__ 保持 true，popup 的 Codex 登录块与相关 locale 完整保留）。
 * 需要"无 Codex"的商店包时用 `pnpm zip:store`。
 *
 * 流程：pnpm exec wxt zip（= 完整 build + 打包 dist/chrome-mv3，zip 根即扩展根，
 * manifest.json 位于根目录，满足 CWS 上传要求）→ 校验产物 → 清理旧 zip →
 * 重命名为 eo2weave-chrome-v{version}.zip。
 *
 * 用法：pnpm pack:release
 * 产物：browser-extension/dist/eo2weave-chrome-v{version}.zip
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
// 继承当前环境；不强制 CW_CODEX_OAUTH，保留 Codex OAuth 功能。
execFileSync('pnpm', ['exec', 'wxt', 'zip'], { cwd: extDir, stdio: 'inherit' })

const produced = path.join(distDir, wxtZipName)
if (!existsSync(produced)) {
  console.error(`[pack:release] expected wxt zip not found: ${produced}`)
  process.exit(1)
}

// wxt zip 打的就是 chrome-mv3（不带 modeSuffix 的构建输出），直接校验该目录。
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
  // dev 构建用 __MSG_extensionNameDev__；出现在发布包说明打错了目录
  problems.push(`manifest.name=${manifest.name} looks like a dev build`)
}
if (!existsSync(path.join(outDir, '_locales', 'en', 'messages.json'))) {
  problems.push('_locales/en/messages.json missing (default_locale would dangle)')
}

// Chrome MV3 禁止加载以下划线开头的资源路径（_locales 除外）。
// `_virtual_*` chunk 是历史坑，wxt.config.ts 的 sanitize 插件负责改名，这里兜底复查。
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

// 清掉 dist 下的旧版本 zip（1.1.4 旧包曾残留导致差点上传过期版本），只留本次产物。
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
