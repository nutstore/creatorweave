/**
 * FSAccessExecutor — DiskExecutor 的 File System Access API 实现
 *
 * 把 WorkspaceRuntime 原本直接调用 FileSystemDirectoryHandle 的 native
 * 磁盘逻辑，搬进一个实现类。行为与改造前完全一致（阶段1 纯重构）。
 *
 * 数据来源：
 *   - 授权 + 持久化：@/native-fs（DirectoryHandleManager + IDB）
 *   - 运行时 handle 注册表：getRuntimeDirectoryHandle / getRuntimeHandlesForProject
 *   - 文件操作：直接调 FileSystemDirectoryHandle API
 *
 * rootId 约定：compoundKey（`projectId:rootName`），与 native-fs 的存储键一致。
 *
 * 详见 STATUS.md §3.2 & §9 阶段1。
 */

import type {
  DiskExecutor,
  DiskRoot,
  DiskStat,
  DiskEntry,
  DiskReadResult,
  DiskWriteContent,
} from './executor'
import { getFileContentType } from '../utils/opfs-utils'
import {
  requestDirectoryAccess,
  releaseDirectoryHandle,
  getRuntimeDirectoryHandle,
  getRuntimeHandlesForProject,
  buildHandleKey,
} from '@/native-fs'
import type { DirectoryPickerOptions } from '@/native-fs'

/** resolveSafeRelative: 拒绝绝对路径 / .. 穿越 */
function assertRelativePath(p: string): void {
  if (!p) throw new Error('relativePath is empty')
  if (p.startsWith('/')) throw new Error(`relativePath must be relative, got: ${p}`)
}

/** 沿路径解析父目录 handle，返回 (父目录handle, 文件名) */
async function resolveParent(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) throw new Error(`Invalid path: ${path}`)
  const name = parts.pop()!
  let current = root
  for (const part of parts) {
    current = await current.getDirectoryHandle(part)
  }
  return { parent: current, name }
}

/** 沿路径解析到目标文件 handle（不创建） */
async function resolveFileHandle(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error(`Invalid path: ${path}`)
  let current = root
  for (const part of parts) {
    current = await current.getDirectoryHandle(part)
  }
  return current.getFileHandle(name)
}

/** 从 compoundKey 还原 (projectId, rootName) */
function parseCompoundKey(rootId: string): { projectId: string; rootName: string } {
  const idx = rootId.indexOf(':')
  if (idx === -1) return { projectId: rootId, rootName: rootId }
  return { projectId: rootId.substring(0, idx), rootName: rootId.substring(idx + 1) }
}

export class FSAccessExecutor implements DiskExecutor {
  readonly backend = 'fsaccess' as const

  // —— 授权管理 ————————————————————————————————————————————

  async listRoots(projectId: string): Promise<DiskRoot[]> {
    const handles = getRuntimeHandlesForProject(projectId)
    const roots: DiskRoot[] = []
    for (const [rootName] of handles) {
      roots.push({
        id: buildHandleKey(projectId, rootName),
        displayName: rootName,
        readOnly: false, // FS Access 不区分读写权限（授权即 readwrite）
        backend: 'fsaccess',
        permissions: ['read', 'write', 'search'],
      })
    }
    return roots
  }

  async authorizeRoot(
    projectId: string,
    opts?: { displayName?: string; readOnly?: boolean }
  ): Promise<DiskRoot | null> {
    const rootName = opts?.displayName ?? projectId
    const pickerOpts: DirectoryPickerOptions = { mode: 'readwrite' }
    const handle = await requestDirectoryAccess(projectId, rootName, pickerOpts)
    if (!handle) return null // 用户取消

    // rootName 用实际选中的文件夹名（handle.name），而非传入的 displayName，
    // 与现有 folder-access.store.pickDirectory 的行为一致。
    const actualName = handle.name
    return {
      id: buildHandleKey(projectId, actualName),
      displayName: actualName,
      readOnly: opts?.readOnly ?? false,
      backend: 'fsaccess',
      permissions: ['read', 'write', 'search'],
    }
  }

  async revokeRoot(projectId: string, rootId: string): Promise<void> {
    const { rootName } = parseCompoundKey(rootId)
    await releaseDirectoryHandle(projectId, rootName)
  }

  async hydrateRoot(projectId: string, rootId: string): Promise<boolean> {
    const { rootName } = parseCompoundKey(rootId)
    const handle = getRuntimeDirectoryHandle(projectId, rootName)
    if (!handle) return false
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' })
      return perm === 'granted'
    } catch {
      return false
    }
  }

  // —— 磁盘执行 ————————————————————————————————————————————

  async read(rootId: string, relativePath: string): Promise<DiskReadResult> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    const fileHandle = await resolveFileHandle(handle, relativePath)
    const file = await fileHandle.getFile()
    const contentType = getFileContentType(relativePath)
    const content: string | ArrayBuffer =
      contentType === 'text' ? await file.text() : await file.arrayBuffer()
    return {
      content,
      stat: {
        mtime: file.lastModified,
        size: file.size,
        contentType,
        isFile: true,
      },
    }
  }

  async write(
    rootId: string,
    relativePath: string,
    content: DiskWriteContent
  ): Promise<DiskStat> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    const parts = relativePath.split('/').filter(Boolean)
    const fileName = parts.pop()!
    // 自动建父目录
    let current = handle
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true })
    }
    const targetFile = await current.getFileHandle(fileName, { create: true })
    const writable = await targetFile.createWritable()
    await writable.write(content)
    await writable.close()

    // 读回 metadata 返回 stat（对齐 writeNativeFile 后getFileMetadata 的场景）
    const file = await targetFile.getFile()
    return {
      mtime: file.lastModified,
      size: file.size,
      contentType: getFileContentType(relativePath),
      isFile: true,
    }
  }

  async delete(rootId: string, relativePath: string): Promise<void> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    try {
      const { parent, name } = await resolveParent(handle, relativePath)
      await parent.removeEntry(name)
    } catch {
      // 不存在则静默成功（幂等），对齐 deleteFromNativeIfExists
    }
  }

  async stat(rootId: string, relativePath: string): Promise<DiskStat | null> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    try {
      const fileHandle = await resolveFileHandle(handle, relativePath)
      const file = await fileHandle.getFile()
      return {
        mtime: file.lastModified,
        size: file.size,
        contentType: getFileContentType(relativePath),
        isFile: true,
      }
    } catch {
      // 可能是目录或不存在；尝试作为目录解析
      try {
        const parts = relativePath.split('/').filter(Boolean)
        let current = handle
        for (const part of parts) {
          current = await current.getDirectoryHandle(part)
        }
        // 是目录
        return { mtime: 0, size: 0, contentType: 'binary', isFile: false }
      } catch {
        return null
      }
    }
  }

  async listDir(rootId: string, relativePath: string): Promise<DiskEntry[]> {
    const handle = this.requireHandle(rootId)
    // relativePath 为空或 '.' 表示根
    let dir = handle
    if (relativePath && relativePath !== '.') {
      const parts = relativePath.split('/').filter(Boolean)
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part)
      }
    }
    const entries: DiskEntry[] = []
    for await (const [name, childHandle] of dir.entries()) {
      const kind = childHandle.kind === 'file' ? 'file' : 'directory'
      const entry: DiskEntry = { name, kind }
      if (kind === 'file') {
        try {
          const file = await (childHandle as FileSystemFileHandle).getFile()
          entry.stat = {
            mtime: file.lastModified,
            size: file.size,
            contentType: getFileContentType(name),
            isFile: true,
          }
        } catch {
          /* 忽略单个文件读取失败 */
        }
      }
      entries.push(entry)
    }
    return entries
  }

  // —— 内部工具 ————————————————————————————————————————————

  /**
   * 从 rootId 解析出运行时 handle，不存在则抛错。
   * 注意：这里拿到的是 FS Access 的 FileSystemDirectoryHandle。
   */
  private requireHandle(rootId: string): FileSystemDirectoryHandle {
    const { projectId, rootName } = parseCompoundKey(rootId)
    const handle = getRuntimeDirectoryHandle(projectId, rootName)
    if (!handle) {
      throw new Error(`[FSAccessExecutor] No runtime handle for root "${rootId}" (permission may have expired)`)
    }
    return handle
  }
}
