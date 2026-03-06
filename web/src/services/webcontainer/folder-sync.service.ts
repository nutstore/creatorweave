import type { WebContainer } from '@webcontainer/api'
import { resolveDirectoryHandle } from '@/services/fsAccess.service'
import type { WebContainerPackageManager } from './types'

type MountTreeNode =
  | {
      file: {
        contents: Uint8Array | string
      }
    }
  | {
      directory: MountTree
    }

type MountTree = Record<string, MountTreeNode>

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'coverage',
  '.turbo',
  '.pnpm-store',
  '.yarn',
  'target',
  'test-results',
  '.worktrees',
  '.openclaw-agents',
  '.playwright-mcp',
])

const ROOT_FILES_FOR_WORKSPACE = [
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '.npmrc',
  '.yarnrc.yml',
  'turbo.json',
  'nx.json',
  'tsconfig.base.json',
]

const SHARED_WORKSPACE_DIRS = ['packages', 'libs', 'shared']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const TEXT_FILE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'json',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'htm',
  'md',
  'txt',
  'yml',
  'yaml',
  'toml',
  'xml',
  'svg',
  'env',
  'gitignore',
  'gitattributes',
  'npmrc',
  'yarnrc',
  'pnpmfile',
])

export interface SyncSummary {
  fileCount: number
  directoryCount: number
  skippedFileCount: number
  skippedLargeFileCount: number
  skippedDirectoryCount: number
}

function shouldSkipDirectory(name: string): boolean {
  return EXCLUDED_DIRS.has(name)
}

function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf('.')
  if (lastDot < 0 || lastDot === name.length - 1) {
    return name.toLowerCase()
  }
  return name.slice(lastDot + 1).toLowerCase()
}

function isLikelyTextFile(name: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(getFileExtension(name))
}

interface BuildMountOptions {
  maxFileSizeBytes?: number
}

function insertTreeAtPath(target: MountTree, path: string, childTree: MountTree): void {
  const normalized = path.replace(/^\/+|\/+$/g, '')
  if (!normalized || normalized === '.') {
    Object.assign(target, childTree)
    return
  }

  const parts = normalized.split('/').filter(Boolean)
  let cursor = target

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    const existing = cursor[part]
    if (!existing || !('directory' in existing)) {
      cursor[part] = { directory: {} }
    }
    cursor = (cursor[part] as { directory: MountTree }).directory
  }

  const last = parts[parts.length - 1]
  cursor[last] = { directory: childTree }
}

async function addRootFiles(
  rootHandle: FileSystemDirectoryHandle,
  targetTree: MountTree,
  summary: SyncSummary,
  options: BuildMountOptions
): Promise<void> {
  for (const fileName of ROOT_FILES_FOR_WORKSPACE) {
    try {
      const fileHandle = await rootHandle.getFileHandle(fileName)
      const file = await fileHandle.getFile()
      if (file.size > (options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES)) {
        summary.skippedFileCount += 1
        summary.skippedLargeFileCount += 1
        continue
      }
      const contents = isLikelyTextFile(file.name)
        ? await file.text()
        : new Uint8Array(await file.arrayBuffer())
      targetTree[fileName] = {
        file: {
          contents,
        },
      }
      summary.fileCount += 1
    } catch {
      // Optional file, ignore.
    }
  }
}

async function buildMountTreeFromDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  summary: SyncSummary,
  options: BuildMountOptions
): Promise<MountTree> {
  const tree: MountTree = {}

  for await (const [name, entry] of directoryHandle.entries()) {
    if (entry.kind === 'directory') {
      if (shouldSkipDirectory(name)) {
        summary.skippedDirectoryCount += 1
        continue
      }

      const childTree = await buildMountTreeFromDirectory(
        entry as FileSystemDirectoryHandle,
        summary,
        options
      )

      tree[name] = {
        directory: childTree,
      }
      summary.directoryCount += 1
      continue
    }

    const fileHandle = entry as FileSystemFileHandle
    const file = await fileHandle.getFile()
    if (file.size > (options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES)) {
      summary.skippedFileCount += 1
      summary.skippedLargeFileCount += 1
      continue
    }
    const contents = isLikelyTextFile(file.name)
      ? await file.text()
      : new Uint8Array(await file.arrayBuffer())

    tree[name] = {
      file: {
        contents,
      },
    }
    summary.fileCount += 1
  }

  return tree
}

export class FolderToWebContainerSyncService {
  async syncToWebContainer(
    webcontainer: WebContainer,
    directoryHandle: FileSystemDirectoryHandle,
    config?: {
      startupPath?: string
      installWorkingDirectory?: string
      packageManager?: WebContainerPackageManager
    }
  ): Promise<SyncSummary> {
    const summary: SyncSummary = {
      fileCount: 0,
      directoryCount: 0,
      skippedFileCount: 0,
      skippedLargeFileCount: 0,
      skippedDirectoryCount: 0,
    }

    const startupPath = config?.startupPath?.replace(/^\/+|\/+$/g, '') || '.'
    const startupDirectory =
      startupPath === '.'
        ? directoryHandle
        : await resolveDirectoryHandle(directoryHandle, startupPath)

    const tree: MountTree = {}
    const startupTree = await buildMountTreeFromDirectory(startupDirectory, summary, {})
    insertTreeAtPath(tree, startupPath, startupTree)

    const installInRoot = config?.installWorkingDirectory === '/'
    if (installInRoot) {
      await addRootFiles(directoryHandle, tree, summary, {})

      for (const sharedDir of SHARED_WORKSPACE_DIRS) {
        try {
          const sharedHandle = await directoryHandle.getDirectoryHandle(sharedDir)
          const sharedTree = await buildMountTreeFromDirectory(sharedHandle, summary, {})
          insertTreeAtPath(tree, sharedDir, sharedTree)
        } catch {
          // Optional shared workspace directory.
        }
      }
    }

    await webcontainer.mount(tree as never)

    return summary
  }
}

export const folderToWebContainerSyncService = new FolderToWebContainerSyncService()
