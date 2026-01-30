/**
 * Permission Layer - controls WASM plugin access to file system operations.
 *
 * Enforces:
 * - Path whitelist (only user-selected directory)
 * - Write rate limiting
 * - Extension blacklist
 * - Sensitive path protection
 */

import { validatePath, validateWritePath, isSensitivePath, normalizePath } from './path-validator'

/** Permission check result */
export interface PermissionResult {
  allowed: boolean
  reason?: string
}

/** Rate limiter state */
interface RateLimiter {
  operations: number[]
  maxOps: number
  windowMs: number
}

export class PermissionLayer {
  private _rootDir: string
  private rateLimiters = new Map<string, RateLimiter>()

  /** Max write operations per minute per plugin */
  private static readonly WRITE_RATE_LIMIT = 60
  private static readonly RATE_WINDOW_MS = 60_000

  constructor(rootDir: string = '') {
    this._rootDir = normalizePath(rootDir)
  }

  /** Get the current root directory */
  get rootDir(): string {
    return this._rootDir
  }

  /** Update the root directory */
  setRootDir(rootDir: string): void {
    this._rootDir = normalizePath(rootDir)
  }

  /** Check if a read operation is allowed */
  checkRead(_pluginId: string, path: string): PermissionResult {
    const pathError = validatePath(path)
    if (pathError) {
      return { allowed: false, reason: pathError }
    }

    if (isSensitivePath(path)) {
      return { allowed: false, reason: `Access to sensitive path denied: ${path}` }
    }

    return { allowed: true }
  }

  /** Check if a write operation is allowed */
  checkWrite(pluginId: string, path: string): PermissionResult {
    const pathError = validateWritePath(path)
    if (pathError) {
      return { allowed: false, reason: pathError }
    }

    if (isSensitivePath(path)) {
      return { allowed: false, reason: `Writing to sensitive path denied: ${path}` }
    }

    // Rate limit check
    if (!this.checkRateLimit(pluginId)) {
      return {
        allowed: false,
        reason: `Write rate limit exceeded (max ${PermissionLayer.WRITE_RATE_LIMIT}/min)`,
      }
    }

    return { allowed: true }
  }

  /** Check if listing a directory is allowed */
  checkListDir(_pluginId: string, path: string): PermissionResult {
    const pathError = validatePath(path)
    if (pathError) {
      return { allowed: false, reason: pathError }
    }

    return { allowed: true }
  }

  /** Record a write operation for rate limiting */
  recordWrite(pluginId: string): void {
    const limiter = this.getOrCreateLimiter(pluginId)
    limiter.operations.push(Date.now())
  }

  /** Reset rate limits for a plugin */
  resetRateLimit(pluginId: string): void {
    this.rateLimiters.delete(pluginId)
  }

  /** Reset all state */
  reset(): void {
    this.rateLimiters.clear()
  }

  // ---- Private ----

  private checkRateLimit(pluginId: string): boolean {
    const limiter = this.getOrCreateLimiter(pluginId)
    const now = Date.now()
    const cutoff = now - limiter.windowMs

    // Remove expired entries
    limiter.operations = limiter.operations.filter((t) => t > cutoff)

    return limiter.operations.length < limiter.maxOps
  }

  private getOrCreateLimiter(pluginId: string): RateLimiter {
    let limiter = this.rateLimiters.get(pluginId)
    if (!limiter) {
      limiter = {
        operations: [],
        maxOps: PermissionLayer.WRITE_RATE_LIMIT,
        windowMs: PermissionLayer.RATE_WINDOW_MS,
      }
      this.rateLimiters.set(pluginId, limiter)
    }
    return limiter
  }
}

/** Singleton permission layer */
let instance: PermissionLayer | null = null

export function getPermissionLayer(): PermissionLayer {
  if (!instance) {
    instance = new PermissionLayer()
  }
  return instance
}
