/**
 * Vite plugin to sync docs from monorepo root to web/public/docs/
 * This allows the documentation viewer to read docs stored in the project root.
 * Do not manually maintain docs under web/public/docs; edit root docs/ only.
 *
 * Works in both development and build modes.
 *
 * Document metadata is defined in YAML frontmatter:
 * ---
 * title: 文档标题
 * order: 1
 * ---
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, writeFileSync, watch, readFileSync, rmSync } from 'fs'
import { join, extname } from 'path'
import type { ViteDevServer } from 'vite'

const ROOT_DOCS = join(__dirname, '..', 'docs')
const PUBLIC_DOCS = join(__dirname, 'public', 'docs')

interface DocMeta {
  title?: string
  order?: number
}

interface PageEntry {
  slug: string
  title: string
  file: string
  category?: string
  order: number
}

interface Category {
  slug: string
  title: string
  dir: string
  defaultOrder?: number
}

const CATEGORIES: Category[] = [
  { slug: 'user', title: '用户文档', dir: 'user' },
  { slug: 'developer', title: '开发者文档', dir: 'developer' },
]

function syncDocs() {
  if (!existsSync(ROOT_DOCS)) {
    console.warn(`[docs-sync] Source directory not found: ${ROOT_DOCS}`)
    return
  }

  // Rebuild target docs directory from source of truth.
  rmSync(PUBLIC_DOCS, { recursive: true, force: true })
  mkdirSync(PUBLIC_DOCS, { recursive: true })

  copyDir(ROOT_DOCS, PUBLIC_DOCS)
  generateIndexFiles()
  console.log('[docs-sync] Docs synced from root to public/docs/')
}

function copyDir(src: string, dest: string) {
  if (!existsSync(src)) {
    console.warn(`[docs-sync] Source directory not found: ${src}`)
    return
  }

  mkdirSync(dest, { recursive: true })

  const entries = readdirSync(src)
  for (const entry of entries) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    const stat = statSync(srcPath)

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath)
    } else if (stat.isFile() && (extname(entry) === '.md' || extname(entry) === '.json')) {
      copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { meta: DocMeta; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { meta: {}, body: content }
  }

  const [, yamlStr, body] = match
  const meta: DocMeta = {}

  // Simple YAML parsing for title and order
  yamlStr.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim()
      if (key.trim() === 'title') {
        meta.title = value.replace(/^["']|["']$/g, '')
      } else if (key.trim() === 'order') {
        meta.order = parseInt(value, 10)
      }
    }
  })

  return { meta, body }
}

/**
 * Generate title from filename (fallback when no frontmatter)
 */
function generateTitle(fileName: string): string {
  return fileName
    .replace(/\.md$/, '')
    .replace(/^\d+-/, '') // Remove leading number prefix
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function generateIndexFiles() {
  for (const cat of CATEGORIES) {
    const catDir = join(PUBLIC_DOCS, cat.slug)
    const srcDir = join(ROOT_DOCS, cat.dir)
    mkdirSync(catDir, { recursive: true })

    const pages: PageEntry[] = []
    const categoryDefaultOrder = cat.defaultOrder ?? 1000

    // Check if source directory exists
    if (!existsSync(srcDir)) {
      console.warn(`[docs-sync] Source directory not found: ${srcDir}`)
      const index = { title: cat.title, pages: [] }
      writeFileSync(join(catDir, '_index.json'), JSON.stringify(index, null, 2))
      continue
    }

    // Scan source directory and generate index
    const scanDir = (dir: string, basePath: string = ''): void => {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const srcPath = join(dir, entry)
        const stat = statSync(srcPath)

        if (stat.isDirectory()) {
          scanDir(srcPath, basePath ? `${basePath}/${entry}` : entry)
        } else if (stat.isFile() && entry.endsWith('.md')) {
          const relativePath = basePath ? `${basePath}/${entry}` : entry
          const baseName = entry.replace(/\.md$/, '')

          // Skip index files
          if (baseName.toLowerCase() === 'index') continue

          // Read file and parse frontmatter
          const content = readFileSync(srcPath, 'utf-8')
          const { meta } = parseFrontmatter(content)

          // Get title from frontmatter or generate from filename
          const title = meta.title || generateTitle(baseName)

          // Get order from frontmatter or use default
          const order = meta.order ?? (categoryDefaultOrder * 1000)

          pages.push({
            slug: relativePath.replace(/\.md$/, '').replace(/\//g, '-'),
            title,
            file: relativePath,
            category: basePath || undefined,
            order,
          })
        }
      }
    }

    scanDir(srcDir)

    // Sort by order, then by title
    pages.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return a.title.localeCompare(b.title, 'zh-CN')
    })

    const index = {
      title: cat.title,
      pages,
    }

    writeFileSync(join(catDir, '_index.json'), JSON.stringify(index, null, 2))
    console.log(`[docs-sync] Generated ${cat.slug}/_index.json with ${pages.length} pages`)
  }
}

export function docsSyncPlugin() {
  return {
    name: 'vite-plugin-docs-sync',
    configureServer(server: ViteDevServer) {
      // Initial sync
      syncDocs()

      // Watch for changes in root docs directory
      watch(ROOT_DOCS, { recursive: true }, () => {
        console.log('[docs-sync] Detected changes, syncing...')
        syncDocs()
      })

      // Handle /docs/* requests as static files
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (!url.startsWith('/docs')) {
          return next()
        }

        // Remove leading slash and normalize path
        let filePath = join(PUBLIC_DOCS, url)
        // Handle URL encoding
        filePath = decodeURIComponent(filePath)

        if (existsSync(filePath) && statSync(filePath).isFile()) {
          const ext = extname(filePath)
          const contentType = ext === '.json' ? 'application/json' : 'text/markdown'
          res.setHeader('Content-Type', contentType)
          res.setHeader('Cache-Control', 'no-cache')
          res.end(readFileSync(filePath))
        } else {
          next()
        }
      })
    },
    buildStart() {
      console.log('[docs-sync] Syncing docs from root to public/docs/...')
      syncDocs()
    },
  }
}
