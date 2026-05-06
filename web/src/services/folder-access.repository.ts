/**
 * Folder Access Repository - IndexedDB 持久化封装
 *
 * 负责文件夹句柄的存储、读取、删除
 */

import type { FolderAccessRecord } from '@/types/folder-access'

const DB_NAME = 'bfosa-folder-access'
const STORE_NAME = 'folderAccess'
const DB_VERSION = 1

/**
 * IndexedDB 操作封装
 */
class FolderAccessRepository {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[FolderAccessRepo] Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[FolderAccessRepo] IndexedDB opened:', DB_NAME)
        // 迁移旧数据库（如果需要）
        this.migrateFromLegacy().then(resolve).catch(reject)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        console.log('[FolderAccessRepo] Creating object store:', STORE_NAME)
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'projectId' })
        }
      }
    })

    return this.initPromise
  }

  /**
   * 从旧数据库迁移数据
   */
  private async migrateFromLegacy(): Promise<void> {
    const LEGACY_DB_NAME = 'app-dir-handle'

    return new Promise((resolve) => {
      // 尝试打开旧数据库
      const request = indexedDB.open(LEGACY_DB_NAME)

      request.onsuccess = async () => {
        const legacyDb = request.result
        if (!legacyDb.objectStoreNames.contains('handles')) {
          legacyDb.close()
          resolve()
          return
        }

        // 读取旧数据
        const tx = legacyDb.transaction('handles', 'readonly')
        const store = tx.objectStore('handles')
        const getAll = store.getAll()

        getAll.onsuccess = async () => {
          const legacyRecords = getAll.result

          if (legacyRecords && legacyRecords.length > 0) {
            console.log(
              '[FolderAccessRepository] Migrating',
              legacyRecords.length,
              'records from legacy DB'
            )

            // 写入新数据库
            for (const record of legacyRecords) {
              await this.save({
                projectId: record.projectId,
                folderName: record.folderName || null,
                handle: null, // handle 不能序列化，保持 null
                persistedHandle: record.handle || null,
                status: 'needs_user_activation',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
            }

            // 删除旧数据库
            indexedDB.deleteDatabase(LEGACY_DB_NAME)
            console.log('[FolderAccessRepository] Legacy DB migration complete')
          }

          legacyDb.close()
          resolve()
        }

        getAll.onerror = () => {
          legacyDb.close()
          resolve()
        }
      }

      request.onerror = () => {
        // 旧数据库不存在，正常流程
        resolve()
      }
    })
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<IDBDatabase> {
    await this.initialize()
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }

  /**
   * 保存记录
   */
  async save(record: FolderAccessRecord): Promise<void> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      // 只保存可序列化的数据，不保存 handle
      const persistedRecord = {
        projectId: record.projectId,
        rootName: record.rootName,
        folderName: record.folderName,
        persistedHandle: record.persistedHandle, // FileSystemDirectoryHandle 可被结构化克隆
        status: record.status,
        error: record.error,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }

      const request = store.put(persistedRecord)
      request.onsuccess = () => {
        console.log('[FolderAccessRepo] Saved record for project:', record.projectId)
        resolve()
      }
      request.onerror = () => {
        console.error('[FolderAccessRepo] Failed to save record:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * 加载记录
   */
  async load(projectId: string): Promise<FolderAccessRecord | null> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(projectId)

      request.onsuccess = () => {
        const result = request.result
        if (!result) {
          resolve(null)
          return
        }

        // 恢复完整记录
        const record: FolderAccessRecord = {
          projectId: result.projectId,
          rootName: result.rootName,
          folderName: result.folderName,
          handle: null, // 内存句柄需要重新获取权限
          persistedHandle: result.persistedHandle,
          status: result.status,
          error: result.error,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        }

        console.log('[FolderAccessRepo] Loaded record for project:', projectId, record.folderName)
        resolve(record)
      }

      request.onerror = () => {
        console.error('[FolderAccessRepo] Failed to load record:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * 删除记录（彻底释放）
   */
  async delete(projectId: string): Promise<void> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(projectId)

      request.onsuccess = () => {
        console.log('[FolderAccessRepo] Deleted record for project:', projectId)
        resolve()
      }

      request.onerror = () => {
        console.error('[FolderAccessRepo] Failed to delete record:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * 检查记录是否存在
   */
  async exists(projectId: string): Promise<boolean> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(projectId)

      request.onsuccess = () => {
        resolve(!!request.result)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  /**
   * 获取所有项目 ID
   */
  async getAllProjectIds(): Promise<string[]> {
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAllKeys()

      request.onsuccess = () => {
        resolve(request.result as string[])
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  /**
   * 按 projectId + rootName 查找记录（多 root 支持）
   */
  async findByProjectAndRoot(
    projectId: string,
    rootName: string
  ): Promise<FolderAccessRecord | null> {
    const db = await this.ensureDB()

    // Scan all records for this project and match rootName
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result as FolderAccessRecord[]
        const match = results.find(
          (r) => r.projectId === projectId && r.rootName === rootName
        )
        resolve(match ?? null)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  /**
   * 按 projectId + rootName 删除记录（多 root 支持）
   */
  async deleteByProjectAndRoot(projectId: string, rootName: string): Promise<void> {
    const record = await this.findByProjectAndRoot(projectId, rootName)
    if (!record) return

    // Multi-root: update keyPath to include rootName for unique identification
    // Use a compound approach: store as projectId:rootName
    const db = await this.ensureDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      // Find and delete matching records
      const getAll = store.getAll()
      getAll.onsuccess = () => {
        const results = getAll.result as FolderAccessRecord[]
        const toDelete = results.filter(
          (r) => r.projectId === projectId && r.rootName === rootName
        )

        if (toDelete.length === 0) {
          resolve()
          return
        }

        // Delete each matching record (use projectId as key, store handles rootName internally)
        let deleted = 0
        for (const record of toDelete) {
          const delRequest = store.delete(record.projectId)
          delRequest.onsuccess = () => {
            deleted++
            if (deleted === toDelete.length) {
              resolve()
            }
          }
          delRequest.onerror = () => reject(delRequest.error)
        }
      }

      getAll.onerror = () => reject(getAll.error)
    })
  }
}

export const folderAccessRepo = new FolderAccessRepository()
