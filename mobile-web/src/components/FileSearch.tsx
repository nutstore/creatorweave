/**
 * FileSearch - File search component with debounced input and IME detection
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Loader2, File, Folder, HardDrive } from 'lucide-react'
import { useRemoteStore } from '../store/remote.store'
import type { FileEntry } from '../types/remote'

export function FileSearch() {
  const [query, setQuery] = useState('')
  const {
    searchResults,
    isSearching,
    selectedFiles,
    hostRootName,
    connectionState
  } = useRemoteStore()

  // Track IME composition state
  const [isComposing, setIsComposing] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Trigger search (with debounce)
  const triggerSearch = useCallback((value: string) => {
    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Don't search if empty or currently composing with IME
    if (!value.trim() || isComposing) {
      return
    }

    // Debounced search
    searchTimeoutRef.current = setTimeout(() => {
      console.log('[FileSearch] Triggering search for:', value)
      const store = useRemoteStore.getState()
      store.searchFiles(value)
    }, 300)
  }, [isComposing])

  // Handle IME composition start
  const handleCompositionStart = () => {
    console.log('[FileSearch] IME composition started')
    setIsComposing(true)
    // Clear any pending search when composition starts
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
  }

  // Handle IME composition end
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    const value = (e.target as HTMLInputElement).value
    console.log('[FileSearch] IME composition ended, value:', value)
    setIsComposing(false)
    // Trigger search with the final value after composition
    triggerSearch(value)
  }

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)

    // Only trigger search immediately if not composing
    if (!isComposing) {
      triggerSearch(value)
    }
  }

  const selectedResults = searchResults.filter((f: FileEntry) => selectedFiles.includes(f.path))

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="p-4">
      {/* Current Directory Header */}
      <div className="mb-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <HardDrive className="w-4 h-4" />
        <span className="font-medium">Host 目录:</span>
        {connectionState === 'connected' ? (
          <span className="font-mono text-gray-800 dark:text-gray-200">
            {hostRootName || <span className="text-gray-400">Host 未打开目录</span>}
          </span>
        ) : (
          <span className="font-mono text-gray-400">未连接</span>
        )}
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="搜索文件名..."
          className="w-full pl-10 pr-10 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        )}
      </div>

      {/* Results */}
      <div className="space-y-1">
        {query && searchResults.length === 0 && !isSearching && !isComposing && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            没有找到匹配的文件
          </div>
        )}

        {searchResults.map((file: FileEntry) => (
          <FileResultItem
            key={file.path}
            file={file}
            selected={selectedFiles.includes(file.path)}
          />
        ))}
      </div>

      {/* Show more indicator */}
      {selectedResults.length > 0 && selectedResults.length < searchResults.length && (
        <div className="text-center py-2 text-sm text-gray-500 dark:text-gray-400">
          还有 {searchResults.length - selectedResults.length} 个结果...
        </div>
      )}
    </div>
  )
}

interface FileResultItemProps {
  file: FileEntry
  selected: boolean
}

function FileResultItem({ file, selected }: FileResultItemProps) {
  const { toggleFileSelection } = useRemoteStore()

  return (
    <button
      onClick={() => toggleFileSelection(file.path)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
        selected
          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
      }`}
    >
      {file.type === 'directory' ? (
        <Folder className="w-5 h-5 text-blue-500 flex-shrink-0" />
      ) : (
        <File className="w-5 h-5 text-gray-500 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{file.name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{file.path}</div>
      </div>
      {selected && (
        <div className="text-blue-500">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 000-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </button>
  )
}
