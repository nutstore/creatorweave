/**
 * GoToFileDialog - Quick file navigation dialog (like VS Code's Ctrl+P)
 *
 * Features:
 * - Fuzzy search input for file paths
 * - Searches ALL files on disk (via folder-access store's per-project cache)
 * - Supplements with pending create/modify paths (agent files not yet on disk)
 * - On selection: navigates the file tree and opens file preview
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Search, File, Loader2, X } from 'lucide-react'
import { useFolderAccessStore } from '@/store/folder-access.store'
import { useOPFSStore } from '@/store/opfs.store'
import { useProjectStore } from '@/store/project.store'
import { useT } from '@/i18n'

interface GoToFileDialogProps {
  open: boolean
  onClose: () => void
  /** Called with the full path (with rootName prefix) when user selects a file */
  onSelectFile: (fullPath: string) => void
}

/** Simple fuzzy match: checks if all characters of query appear in order in target */
function fuzzyMatch(query: string, target: string): { matched: boolean; score: number } {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Exact substring match gets highest score
  const idx = t.indexOf(q)
  if (idx >= 0) {
    return { matched: true, score: 1000 - idx }
  }

  // Fuzzy character-by-character match
  let qi = 0
  let score = 0
  let lastMatchIdx = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for matching at word boundaries (after / or . or _)
      if (ti === 0 || '/._-'.includes(t[ti - 1])) {
        score += 10
      }
      // Bonus for consecutive matches
      if (lastMatchIdx === ti - 1) {
        score += 5
      }
      score += 1
      lastMatchIdx = ti
      qi++
    }
  }

  return { matched: qi === q.length, score }
}

export function GoToFileDialog({ open, onClose, onSelectFile }: GoToFileDialogProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isIndexing, setIsIndexing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Track latest selectedIndex via ref to avoid stale closure in key handler
  const selectedIndexRef = useRef(0)
  selectedIndexRef.current = selectedIndex

  // Primary source: all files on disk (scoped to active project via per-project cache)
  const activeProjectId = useProjectStore((s) => s.activeProjectId || null)
  const allFilePathsMap = useFolderAccessStore((s) => s.allFilePaths)
  const allFilePaths = useMemo(
    () => (activeProjectId ? allFilePathsMap[activeProjectId] ?? [] : []),
    [activeProjectId, allFilePathsMap]
  )
  const ensureFilePaths = useFolderAccessStore((s) => s.ensureFilePaths)

  // Supplementary: pending changes contain files not yet synced to disk
  // (newly created/modified by agent). Only take create/modify, skip delete.
  const pendingChanges = useOPFSStore((s) => s.pendingChanges)

  // Merge disk paths + pending-only paths (deduplicated)
  const allPaths = useMemo(() => {
    const pathSet = new Set(allFilePaths)

    // Add paths from pending create/modify that may not be on disk yet
    for (const change of pendingChanges) {
      if (change.type === 'create' || change.type === 'modify') {
        pathSet.add(change.path)
      }
    }

    return [...pathSet].sort()
  }, [allFilePaths, pendingChanges])

  // Trigger file path indexing when dialog opens
  useEffect(() => {
    if (!open) return
    if (allFilePaths.length > 0) return // Already indexed

    let cancelled = false
    setIsIndexing(true)
    ensureFilePaths().finally(() => {
      if (!cancelled) setIsIndexing(false)
    })
    return () => { cancelled = true }
  }, [open, allFilePaths.length, ensureFilePaths])

  // Filter and rank paths based on query
  const results = useMemo(() => {
    if (!query.trim()) {
      // Don't show results until user types something
      return []
    }

    const matched = allPaths
      .map((p) => {
        const { matched, score } = fuzzyMatch(query, p)
        return matched ? { path: p, score } : null
      })
      .filter(Boolean) as Array<{ path: string; score: number }>

    // Sort by score descending
    matched.sort((a, b) => b.score - a.score)

    return matched.slice(0, 100)
  }, [allPaths, query])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results.length])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.children[selectedIndex] as HTMLElement
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleSelect = useCallback(
    (path: string) => {
      onSelectFile(path)
      onClose()
    },
    [onSelectFile, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const idx = selectedIndexRef.current
        if (results[idx]) {
          handleSelect(results[idx].path)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [results, handleSelect, onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="backdrop-blur-sm fixed inset-0 bg-black/30" />
      <div className="relative z-10 flex w-[min(600px,90vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-800">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('goToFile.placeholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
          />
          {isIndexing && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" />
          )}
          {query && (
            <button
              className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              onClick={() => setQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          className="custom-scrollbar max-h-[50vh] overflow-y-auto py-1"
        >
          {isIndexing && allPaths.length === 0 && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('goToFile.scanning')}
            </div>
          )}
          {results.length === 0 && !isIndexing && query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              {t('goToFile.noMatch')}
            </div>
          )}
          {results.length === 0 && !query.trim() && allPaths.length > 0 && (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              {t('goToFile.typeToSearch')}
            </div>
          )}
          {results.map((result, index) => {
            const fileName = result.path.split('/').pop() || result.path
            const dirPath = result.path.split('/').slice(0, -1).join('/')
            const isSelected = index === selectedIndex

            return (
              <button
                key={result.path}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700/50'
                }`}
                onClick={() => handleSelect(result.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <File className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="min-w-0 truncate font-medium">{fileName}</span>
                {dirPath && (
                  <span className="min-w-0 shrink-0 text-xs text-neutral-400">
                    {dirPath}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer hint */}
        <div className="border-t border-neutral-200 px-4 py-2 dark:border-neutral-700">
          <p className="text-[11px] text-neutral-400">
            {t('goToFile.footer.select')} · {t('goToFile.footer.open')} · {t('goToFile.footer.close')} · {allPaths.length > 100
              ? t('goToFile.footer.truncated', { count: allPaths.length })
              : t('goToFile.footer.total', { count: allPaths.length })}
          </p>
        </div>
      </div>
    </div>
  )
}
