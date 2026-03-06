import { resolveDirectoryHandle } from '@/services/fsAccess.service'
import type { WebContainerPackageManager, WebProjectInfo } from './types'

const STATIC_SERVER_SCRIPT_SOURCE = `
const http=require('http');
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const port=Number(process.env.PORT||'5173');
const mime={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const send=(res,code,data,type)=>{res.writeHead(code,{'Content-Type':type});res.end(data);};
const esc=(s)=>String(s).replace(/[&<>"']/g,(ch)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
const toHref=(p)=>encodeURI(p.replace(/\\\\/g,'/'));
const renderDir=(reqPath,entries)=>{
  const normalized=reqPath.endsWith('/')?reqPath:reqPath+'/';
  const parent=normalized==='/'?null:normalized.split('/').slice(0,-2).join('/')+'/';
  const items=entries
    .sort((a,b)=>{
      if(a.isDir&&!b.isDir)return -1;
      if(!a.isDir&&b.isDir)return 1;
      return a.name.localeCompare(b.name);
    })
    .map((e)=>{
      const suffix=e.isDir?'/':'';
      const href=toHref((normalized==='/'?'':normalized)+e.name+suffix);
      return '<li><a href="'+href+'">'+esc(e.name)+suffix+'</a></li>';
    })
    .join('');
  const up=parent?'<li><a href="'+toHref(parent)+'">../</a></li>':'';
  return '<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Directory Listing</title><style>body{font-family:ui-sans-serif,system-ui,-apple-system;padding:20px;background:#f8fafc;color:#0f172a}h1{font-size:18px}ul{list-style:none;padding:0}li{padding:4px 0}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}.dir{font-weight:600}</style></head><body><h1>Index of '+esc(normalized)+'</h1><ul>'+up+items+'</ul></body></html>';
};
http.createServer((req,res)=>{
  const raw=(req.url||'/').split('?')[0];
  const urlPath=decodeURIComponent(raw);
  let filePath=path.join(root,urlPath);
  if(!filePath.startsWith(root)){send(res,403,'Forbidden','text/plain; charset=utf-8');return;}
  fs.stat(filePath,(statErr,stat)=>{
    if(statErr){send(res,404,'Not Found','text/plain; charset=utf-8');return;}
    if(stat&&stat.isDirectory()){
      const indexPath=path.join(filePath,'index.html');
      fs.readFile(indexPath,(indexErr,buffer)=>{
        if(!indexErr){send(res,200,buffer,mime['.html']);return;}
        fs.readdir(filePath,{withFileTypes:true},(dirErr,dirents)=>{
          if(dirErr){send(res,500,'Directory read failed','text/plain; charset=utf-8');return;}
          const entries=dirents.map((d)=>({name:d.name,isDir:d.isDirectory()}));
          const html=renderDir(urlPath,entries);
          send(res,200,html,mime['.html']);
        });
      });
      return;
    }
    fs.readFile(filePath,(readErr,buffer)=>{
      if(readErr){send(res,404,'Not Found','text/plain; charset=utf-8');return;}
      const ext=path.extname(filePath).toLowerCase();
      send(res,200,buffer,mime[ext]||'application/octet-stream');
    });
  });
}).listen(port,'0.0.0.0',()=>console.log('[static] listening on '+port));
`

function buildStaticStartCommand(): string[] {
  const encoded = btoa(STATIC_SERVER_SCRIPT_SOURCE)
  return ['node', '-e', `eval(Buffer.from('${encoded}','base64').toString())`]
}

async function readFileText(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<string | null> {
  try {
    const handle = await directoryHandle.getFileHandle(fileName)
    const file = await handle.getFile()
    return file.text()
  } catch {
    return null
  }
}

async function existsFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<boolean> {
  try {
    await directoryHandle.getFileHandle(fileName)
    return true
  } catch {
    return false
  }
}

function pickPackageManager(
  hasPnpmLock: boolean,
  hasYarnLock: boolean
): WebContainerPackageManager {
  if (hasPnpmLock) return 'pnpm'
  if (hasYarnLock) return 'yarn'
  return 'npm'
}

function buildInstallCommand(packageManager: WebContainerPackageManager): string[] {
  if (packageManager === 'pnpm') return ['pnpm', 'install']
  if (packageManager === 'yarn') return ['yarn', 'install']
  return ['npm', 'install', '--include=optional']
}

function buildStartCommand(
  packageManager: WebContainerPackageManager,
  scriptName: string
): string[] {
  if (packageManager === 'pnpm') return ['pnpm', 'run', scriptName]
  if (packageManager === 'yarn') return ['yarn', 'run', scriptName]
  return ['npm', 'run', scriptName]
}

interface ScriptCandidate {
  name: string
  command: string
  score: number
}

function scoreScript(name: string, command: string): number {
  const n = name.toLowerCase()
  const c = command.toLowerCase()

  if (
    n.includes('build') ||
    n.includes('lint') ||
    n.includes('test') ||
    n.includes('typecheck') ||
    n.includes('format')
  ) {
    return -100
  }

  let score = 0
  if (n === 'dev') score += 120
  if (n === 'start') score += 110
  if (n === 'serve') score += 100
  if (n === 'preview') score += 90
  if (n.includes('dev')) score += 70
  if (n.includes('start')) score += 60
  if (n.includes('serve')) score += 50
  if (n.includes('preview')) score += 40

  if (c.includes('vite')) score += 25
  if (c.includes('next')) score += 25
  if (c.includes('webpack-dev-server')) score += 25
  if (c.includes('react-scripts start')) score += 25
  if (c.includes('nuxt dev')) score += 20

  if (c.includes('--watch')) score += 8
  if (c.includes(' build')) score -= 30

  return score
}

function getScriptCandidates(
  scripts: Record<string, unknown>
): ScriptCandidate[] {
  return Object.entries(scripts)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([name, value]) => {
      const command = (value as string).trim()
      return {
        name,
        command,
        score: scoreScript(name, command),
      }
    })
    .sort((a, b) => b.score - a.score)
}

function pickStartScript(
  candidates: ScriptCandidate[],
  preferredScriptName?: string
): { name: string; command: string; reason: string } {
  if (preferredScriptName) {
    const preferred = candidates.find((c) => c.name === preferredScriptName)
    if (!preferred) {
      const names = candidates.map((c) => c.name).join(', ')
      throw new Error(`指定启动脚本不存在：${preferredScriptName}。可用 scripts: ${names}`)
    }
    return {
      name: preferred.name,
      command: preferred.command,
      reason: `手动指定 scripts.${preferred.name}`,
    }
  }

  if (candidates.length === 0) {
    throw new Error('package.json 没有可执行的 scripts')
  }

  const best = candidates[0]
  if (best.score <= 0) {
    const names = candidates.map((c) => c.name).join(', ')
    throw new Error(
      `未能识别可用于启动开发服务的脚本。可用 scripts: ${names}。建议提供 dev/start/serve/preview 脚本。`
    )
  }

  return {
    name: best.name,
    command: best.command,
    reason: `自动选择 scripts.${best.name}（score=${best.score}）`,
  }
}

export class WebProjectDetector {
  async detect(
    rootDirectoryHandle: FileSystemDirectoryHandle,
    startupPath = '.',
    preferredScriptName?: string
  ): Promise<WebProjectInfo> {
    const normalizedPath = startupPath.trim().replace(/^\/+|\/+$/g, '') || '.'
    const projectDirectoryHandle =
      normalizedPath === '.'
        ? rootDirectoryHandle
        : await resolveDirectoryHandle(rootDirectoryHandle, normalizedPath)

    const packageJsonText = await readFileText(projectDirectoryHandle, 'package.json')
    if (!packageJsonText) {
      const staticWorkingDirectory = normalizedPath === '.' ? '/' : `/${normalizedPath}`
      return {
        mode: 'static',
        packageManager: 'npm',
        installCommand: [],
        startCommand: buildStaticStartCommand(),
        requiresInstall: false,
        packageName: `${projectDirectoryHandle.name} (static)`,
        startScriptName: '__static__',
        startScriptCommand: 'node -e <static-server>',
        startScriptReason: '未检测到 package.json，自动切换到静态文件服务器模式',
        availableScripts: [],
        installWorkingDirectory: staticWorkingDirectory,
        devWorkingDirectory: staticWorkingDirectory,
      }
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(packageJsonText) as Record<string, unknown>
    } catch {
      throw new Error('package.json 解析失败，请检查 JSON 格式')
    }

    const scripts = (parsed.scripts ?? {}) as Record<string, unknown>
    const scriptCandidates = getScriptCandidates(scripts)
    const startScript = pickStartScript(scriptCandidates, preferredScriptName)

    const hasPnpmLockInProject = await existsFile(projectDirectoryHandle, 'pnpm-lock.yaml')
    const hasYarnLockInProject = await existsFile(projectDirectoryHandle, 'yarn.lock')
    const hasNpmLockInProject = await existsFile(projectDirectoryHandle, 'package-lock.json')

    const hasPnpmLockInRoot =
      normalizedPath !== '.' && (await existsFile(rootDirectoryHandle, 'pnpm-lock.yaml'))
    const hasYarnLockInRoot =
      normalizedPath !== '.' && (await existsFile(rootDirectoryHandle, 'yarn.lock'))
    const hasNpmLockInRoot =
      normalizedPath !== '.' && (await existsFile(rootDirectoryHandle, 'package-lock.json'))

    const hasPnpmLock = hasPnpmLockInProject || hasPnpmLockInRoot
    const hasYarnLock = hasYarnLockInProject || hasYarnLockInRoot
    const packageManager = pickPackageManager(hasPnpmLock, hasYarnLock)

    const packageName =
      typeof parsed.name === 'string' && parsed.name.trim().length > 0
        ? parsed.name
        : projectDirectoryHandle.name

    const projectWorkingDirectory = normalizedPath === '.' ? '/' : `/${normalizedPath}`
    const installWorkingDirectory =
      (packageManager === 'pnpm' && hasPnpmLockInRoot && !hasPnpmLockInProject) ||
      (packageManager === 'yarn' && hasYarnLockInRoot && !hasYarnLockInProject) ||
      (packageManager === 'npm' && hasNpmLockInRoot && !hasNpmLockInProject)
        ? '/'
        : projectWorkingDirectory

    return {
      mode: 'package-script',
      packageManager,
      installCommand: buildInstallCommand(packageManager),
      startCommand: buildStartCommand(packageManager, startScript.name),
      requiresInstall: true,
      packageName,
      startScriptName: startScript.name,
      startScriptCommand: startScript.command,
      startScriptReason: startScript.reason,
      availableScripts: scriptCandidates.map((s) => s.name),
      installWorkingDirectory,
      devWorkingDirectory: projectWorkingDirectory,
    }
  }
}

export const webProjectDetector = new WebProjectDetector()
