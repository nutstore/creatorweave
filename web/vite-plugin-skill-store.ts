// ============================================================
// vite-plugin-skill-store.ts — Dev 模式把 web/dist/skills/ 暴露成 /skills/*
// ============================================================
//
// 用途：开发模式下 vite dev server 把构建产物 web/dist/skills/ 暴露成
//       静态资源路径 /skills/*，让 SkillDiscover 能直接 fetch manifest。
//
// 生产环境不需要这个插件（Vercel/EdgeOne 直接托管 dist/skills/）。
//
// 使用：plugins: [serveSkillStore({ src: 'dist/skills' })]
// ============================================================

import type { Plugin } from 'vite'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'

export function serveSkillStore(opts: { src?: string } = {}): Plugin {
  const skillDir = path.resolve(process.cwd(), opts.src ?? 'dist/skills')
  return {
    name: 'serve-skill-store',
    configureServer(server) {
      server.middlewares.use('/skills', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url) return next()
        // Strip query string, decode path
        const urlPath = decodeURIComponent(req.url.split('?')[0])
        // urlPath is like '/manifest.json' or '/cw-weread.zip'
        const filePath = path.join(skillDir, urlPath)
        // Security: prevent path traversal
        if (!filePath.startsWith(skillDir + path.sep) && filePath !== skillDir + '/manifest.json') {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404
          res.end('Not found: ' + urlPath)
          return
        }
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) {
          res.statusCode = 404
          res.end('Not a file: ' + urlPath)
          return
        }
        const ext = path.extname(filePath).toLowerCase()
        const mime = ext === '.json' ? 'application/json' : ext === '.zip' ? 'application/zip' : 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Content-Length', String(stat.size))
        fs.createReadStream(filePath).pipe(res)
      })
    },
  }
}