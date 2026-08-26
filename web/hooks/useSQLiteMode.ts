/**
 * useSQLiteMode Hook
 *
 * Hook for accessing the current SQLite database mode.
 * Returns whether SQLite is using OPFS (persistent) or in-memory (ephemeral) storage.
 */

import { useEffect, useState } from 'react'
import { getSQLiteDB } from '@/sqlite'

/** SQLite database mode */
export type SQLiteMode = 'opfs' | 'memory' | null

/**
 * Hook to get the current SQLite database mode
 *
 * - `opfs`: Data is persisted in Origin Private File System ( survives page reloads )
 * - `memory`: Data is stored in memory ( lost on page reload )
 * - `null`: Database not yet initialized
 *
 * Usage example:
 * ```tsx
 * const { mode, isOPFS, isMemory } = useSQLiteMode()
 * ```
 */
export function useSQLiteMode() {
  const [mode, setMode] = useState<SQLiteMode>(() => getSQLiteDB().getMode())

  useEffect(() => {
    const db = getSQLiteDB()

    // Initial check (db may have been initialized before mount)
    const currentMode = db.getMode()
    setMode(prev => (prev === currentMode ? prev : currentMode))

    // If already resolved to a real mode, no polling needed
    if (currentMode !== null) return

    // DB not initialized yet — poll briefly until it resolves (max ~5s)
    let count = 0
    const maxChecks = 10
    const interval = setInterval(() => {
      const m = db.getMode()
      setMode(prev => (prev === m ? prev : m))
      count++
      if (m !== null || count >= maxChecks) {
        clearInterval(interval)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [])

  return {
    mode,
    /** True if using OPFS persistent storage */
    isOPFS: mode === 'opfs',
    /** True if using in-memory storage */
    isMemory: mode === 'memory',
  }
}
