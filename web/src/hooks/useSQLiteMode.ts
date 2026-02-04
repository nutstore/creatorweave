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
  const [mode, setMode] = useState<SQLiteMode>(null)

  useEffect(() => {
    // Check the current mode
    const checkMode = () => {
      const db = getSQLiteDB()
      const currentMode = db.getMode()
      setMode(currentMode)
    }

    // Initial check
    checkMode()

    // Poll for mode changes (in case it gets initialized later)
    const interval = setInterval(checkMode, 500)

    // Clean up
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
