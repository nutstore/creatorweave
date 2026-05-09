#!/usr/bin/env node
/**
 * 将大语言文件按命名空间拆分为独立文件
 *
 * 用法: node scripts/split-locales.mjs
 * 在 packages/i18n 目录下运行
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, '..', 'src', 'locales')

const LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']
const EXPORT_NAMES = { 'zh-CN': 'zhCN', 'en-US': 'enUS', 'ja-JP': 'jaJP', 'ko-KR': 'koKR' }

// 合并策略：相关命名空间放在同一个文件
const MERGE_MAP = {
  skills: ['skills', 'skillCard', 'skillEditor', 'skillDetail'],
  workflow: ['workflowEditor', 'customWorkflowManager', 'workflowEditorDialog', 'workflow'],
  remote: ['remote', 'session'],
  fileViewer: ['fileViewer', 'standalonePreview', 'filePreview', 'recentFiles'],
  storage: ['storageStatusBanner', 'pendingSync', 'conversationStorage', 'workspaceStorage'],
  conversation: ['conversation', 'toolCallDisplay', 'questionCard'],
  mobile: ['mobile', 'offlineQueue'],
}

const MERGE_FILE_MAP = {}
for (const [file, names] of Object.entries(MERGE_MAP)) {
  for (const name of names) {
    MERGE_FILE_MAP[name] = { file, allNames: names }
  }
}

/**
 * 使用行级缩进来确定顶层 key 的范围
 * 顶层 key 行以 2 空格缩进开头，格式为 `  key: {`
 * 找到下一个同级 key 或文件末尾即为当前 key 的范围
 */
function parseTopLevelBlocks(content) {
  const lines = content.split('\n')
  const blocks = new Map()
  const topKeyPositions = []

  // 找到所有顶层 key 的位置
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^  (\w+):\s*\{/)
    if (m) {
      topKeyPositions.push({ key: m[1], startLine: i })
    }
  }

  // 每个顶层 key 的范围：包含其前导注释，到下一个 key 的前导注释之前
  for (let i = 0; i < topKeyPositions.length; i++) {
    const { key, startLine } = topKeyPositions[i]

    // 向前查找前导注释（紧邻的 // 注释行和空行）
    let blockStart = startLine
    if (i === 0) {
      // 第一个 key：查找从文件开头（跳过 export const xxx = {）开始的注释
      for (let j = startLine - 1; j >= 1; j--) {
        const trimmed = lines[j].trim()
        if (trimmed === '' || trimmed.startsWith('//')) {
          blockStart = j
        } else {
          break
        }
      }
    } else {
      // 非第一个 key：从前一个 key 的结束位置后查找注释
      const prevEnd = topKeyPositions[i - 1].startLine
      for (let j = startLine - 1; j > prevEnd; j--) {
        const trimmed = lines[j].trim()
        if (trimmed.startsWith('//')) {
          blockStart = j
        } else {
          break
        }
      }
    }

    const endLine = i + 1 < topKeyPositions.length
      ? blockStart + (topKeyPositions[i + 1].startLine - startLine)
      : lines.length - 1

    // 实际结束位置：找下一个 key 的前导注释开始位置
    let actualEnd
    if (i + 1 < topKeyPositions.length) {
      const nextStart = topKeyPositions[i + 1].startLine
      // 从 nextStart 向前找到第一个非空、非注释行
      actualEnd = nextStart
      for (let j = nextStart - 1; j > startLine; j--) {
        const trimmed = lines[j].trim()
        if (trimmed === '' || trimmed.startsWith('//')) {
          actualEnd = j
        } else {
          break
        }
      }
    } else {
      actualEnd = lines.length - 1
    }

    const blockLines = []
    for (let j = blockStart; j < actualEnd; j++) {
      blockLines.push(lines[j])
    }

    blocks.set(key, blockLines)
  }

  return { blocks, topKeyOrder: topKeyPositions.map(p => p.key) }
}

function processLocale(locale) {
  const exportName = EXPORT_NAMES[locale]
  const filePath = join(LOCALES_DIR, `${locale}.ts`)

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    return
  }

  const content = readFileSync(filePath, 'utf-8')
  const { blocks, topKeyOrder } = parseTopLevelBlocks(content)

  console.log(`\nProcessing ${locale} (${topKeyOrder.length} top-level keys)...`)

  // 创建目标目录
  const targetDir = join(LOCALES_DIR, locale)
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true })
  }
  mkdirSync(targetDir, { recursive: true })

  // 确定要生成的文件
  const filesToGenerate = []
  const processedKeys = new Set()

  for (const key of topKeyOrder) {
    if (processedKeys.has(key)) continue

    if (MERGE_FILE_MAP[key]) {
      const { file, allNames } = MERGE_FILE_MAP[key]
      const mergedBlocks = []
      for (const name of allNames) {
        const block = blocks.get(name)
        if (block) {
          mergedBlocks.push({ name, lines: block })
          processedKeys.add(name)
        }
      }
      filesToGenerate.push({ file, blocks: mergedBlocks })
    } else {
      const block = blocks.get(key)
      if (block) {
        filesToGenerate.push({ file: key, blocks: [{ name: key, lines: block }] })
        processedKeys.add(key)
      }
    }
  }

  // 写入各文件
  for (const { file, blocks: fileBlocks } of filesToGenerate) {
    const parts = []

    for (const { name, lines: blockLines } of fileBlocks) {
      const transformed = transformBlock(name, blockLines)
      parts.push(transformed)
    }

    const fileContent = parts.join('\n\n') + '\n'
    writeFileSync(join(targetDir, `${file}.ts`), fileContent)
  }

  // 生成 index.ts
  const importLines = []
  for (const { file, blocks: fileBlocks } of filesToGenerate) {
    const names = fileBlocks.map(b => b.name).join(', ')
    importLines.push(`import { ${names} } from './${file}'`)
  }

  const indexLines = [
    ...importLines,
    '',
    `export const ${exportName} = {`,
    ...topKeyOrder.map(key => `  ${key},`),
    '} as const',
    '',
  ]

  writeFileSync(join(targetDir, 'index.ts'), indexLines.join('\n'))
  console.log(`  Generated ${filesToGenerate.length + 1} files in ${locale}/`)
}

/**
 * 将 block lines 转换为独立 export 文件内容
 * 前导注释保留，"  key: {" -> "export const key = {", 末尾 "} as const"
 */
function transformBlock(key, blockLines) {
  const result = []

  // 找到 "  key: {" 行的位置
  let keyLineIdx = 0
  for (let i = 0; i < blockLines.length; i++) {
    if (blockLines[i].match(new RegExp(`^  ${key}:\\s*\\{`))) {
      keyLineIdx = i
      break
    }
  }

  // 添加前导注释（去掉 2 空格缩进）
  for (let i = 0; i < keyLineIdx; i++) {
    result.push(blockLines[i].replace(/^  /, ''))
  }

  // 第一行: "  key: {" -> "export const key = {"
  result.push(`export const ${key} = {`)

  // 中间行
  for (let i = keyLineIdx + 1; i < blockLines.length - 1; i++) {
    result.push(blockLines[i])
  }

  // 最后一行: "  }," -> "} as const"
  const lastLine = blockLines[blockLines.length - 1]
  result.push(lastLine.replace(/^\s*\},?\s*$/, '} as const'))

  return result.join('\n')
}

// 执行
for (const locale of LOCALES) {
  processLocale(locale)
}

console.log('\n✅ Split complete!')
