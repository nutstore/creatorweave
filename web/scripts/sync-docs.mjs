import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDocs = path.resolve(webDir, '..', 'docs')
const publicDocs = path.join(webDir, 'public', 'docs')
const categories = ['user', 'developer']
const languages = {
  zh: { user: '用户文档', developer: '开发者文档' },
  en: { user: 'User Documentation', developer: 'Developer Documentation' },
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return {}
  return Object.fromEntries(match[1].split('\n').flatMap((line) => {
    const separator = line.indexOf(':')
    if (separator < 0) return []
    return [[line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')]]
  }))
}

function titleFromFilename(fileName) {
  return fileName.replace(/\.md$/, '').replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function indexCategory(language, category) {
  const source = path.join(rootDocs, language, category)
  const destination = path.join(publicDocs, language, category)
  await mkdir(destination, { recursive: true })
  const pages = []

  async function scan(directory, relative = '') {
    let entries = []
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const file = path.join(directory, entry.name)
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) await scan(file, nextRelative)
      else if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'index.md') {
        const metadata = frontmatter(await readFile(file, 'utf8'))
        pages.push({
          slug: nextRelative.replace(/\.md$/, '').replace(/\//g, '-'),
          title: metadata.title || titleFromFilename(entry.name),
          file: nextRelative,
          category: relative || undefined,
          order: Number.parseInt(metadata.order || '1000000', 10),
        })
      }
    }
  }

  await scan(source)
  pages.sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, language === 'zh' ? 'zh-CN' : 'en'))
  await writeFile(path.join(destination, '_index.json'), JSON.stringify({ title: languages[language][category], pages }, null, 2))
}

await rm(publicDocs, { recursive: true, force: true })
await mkdir(publicDocs, { recursive: true })
await cp(rootDocs, publicDocs, { recursive: true, filter: (source) => source.endsWith('.md') || source.endsWith('.json') || !path.extname(source) })
for (const language of Object.keys(languages)) for (const category of categories) await indexCategory(language, category)
console.log('[sync-docs] Documentation copied and indices generated.')
