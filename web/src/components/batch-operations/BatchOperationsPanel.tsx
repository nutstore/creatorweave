/**
 * Batch Operations Panel
 *
 * UI component for batch file operations including:
 * - Batch edit with preview
 * - Advanced search
 * - Batch file reading
 *
 * Features:
 * - Preview changes before applying
 * - Progress tracking
 * - Undo capability
 * - File pattern matching
 */

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'

//=============================================================================
// Types
//=============================================================================

export type BatchOperationType = 'batch_edit' | 'read' | 'edit'

export interface BatchEditPreview {
  path: string
  success: boolean
  matched: boolean
  preview?: {
    old: string
    new: string
    line: number
  }
  error?: string
}

export interface BatchReadResult {
  path: string
  success: boolean
  content?: string
  size?: number
  error?: string
}

export interface BatchOperationState {
  type: BatchOperationType | null
  isRunning: boolean
  progress: number
  preview: BatchEditPreview[] | BatchReadResult[] | null
  error: string | null
}

//=============================================================================
// Component
//=============================================================================

interface BatchOperationsPanelProps {
  onExecute: (type: BatchOperationType, params: Record<string, unknown>) => Promise<string>
  onUndo?: () => Promise<void>
  className?: string
}

export function BatchOperationsPanel({ onExecute, onUndo, className }: BatchOperationsPanelProps) {
  const [state, setState] = useState<BatchOperationState>({
    type: 'batch_edit',
    isRunning: false,
    progress: 0,
    preview: null,
    error: null,
  })

  // Batch Edit Form State
  const [editFilePattern, setEditFilePattern] = useState('*.ts')
  const [editFind, setEditFind] = useState('')
  const [editReplace, setEditReplace] = useState('')
  const [editDryRun, setEditDryRun] = useState(true)
  const [editUseRegex, setEditUseRegex] = useState(false)

  // Advanced Search Form State

  // Batch Read Form State
  const [readPaths, setReadPaths] = useState('')
  const [readMaxFiles, setReadMaxFiles] = useState(20)

  //=============================================================================
  // Handlers
  //=============================================================================

  const handleBatchEdit = useCallback(async () => {
    if (!editFind || !editReplace) {
      setState((prev) => ({ ...prev, error: 'Find and replace fields are required' }))
      return
    }

    setState((prev) => ({ ...prev, type: 'batch_edit', isRunning: true, progress: 0, error: null }))

    try {
      const result = await onExecute('edit', {
        path: editFilePattern,
        find: editFind,
        replace: editReplace,
        dry_run: editDryRun,
        use_regex: editUseRegex,
        max_files: 50,
      })

      const parsed = JSON.parse(result)

      if (parsed.error) {
        setState((prev) => ({ ...prev, error: parsed.error, isRunning: false }))
      } else {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          progress: 100,
          preview: parsed.results || [],
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
        isRunning: false,
      }))
    }
  }, [editFilePattern, editFind, editReplace, editDryRun, editUseRegex, onExecute])

  const handleBatchRead = useCallback(async () => {
    const paths = readPaths
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)

    if (paths.length === 0) {
      setState((prev) => ({ ...prev, error: 'At least one file path is required' }))
      return
    }

    setState((prev) => ({
      ...prev,
      type: 'read',
      isRunning: true,
      progress: 0,
      error: null,
    }))

    try {
      const result = await onExecute('read', {
        paths,
        max_files: readMaxFiles,
        max_size: 262144, // 256KB
      })

      const parsed = JSON.parse(result)

      if (parsed.error) {
        setState((prev) => ({ ...prev, error: parsed.error, isRunning: false }))
      } else {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          progress: 100,
          preview: parsed.results || [],
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
        isRunning: false,
      }))
    }
  }, [readPaths, readMaxFiles, onExecute])

  const handleClear = useCallback(() => {
    setState({
      type: 'batch_edit',
      isRunning: false,
      progress: 0,
      preview: null,
      error: null,
    })
  }, [])

  const handleUndo = useCallback(async () => {
    if (onUndo) {
      await onUndo()
      handleClear()
    }
  }, [onUndo, handleClear])

  //=============================================================================
  // Render Helpers
  //=============================================================================

  const renderBatchEditForm = () => (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">File Pattern</label>
        <Input
          value={editFilePattern}
          onChange={(e) => setEditFilePattern(e.target.value)}
          placeholder="*.ts, src/**/*.tsx, **/*.test.ts"
          disabled={state.isRunning}
        />
        <p className="mt-1 text-xs text-neutral-500">Glob pattern to match files</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Find</label>
        <Input
          value={editFind}
          onChange={(e) => setEditFind(e.target.value)}
          placeholder="Text to find"
          disabled={state.isRunning}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Replace With</label>
        <Input
          value={editReplace}
          onChange={(e) => setEditReplace(e.target.value)}
          placeholder="Replacement text"
          disabled={state.isRunning}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch
            id="dry-run"
            checked={editDryRun}
            onCheckedChange={setEditDryRun}
            disabled={state.isRunning}
          />
          <label htmlFor="dry-run" className="text-sm">
            Preview Only (Dry Run)
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="use-regex"
            checked={editUseRegex}
            onCheckedChange={setEditUseRegex}
            disabled={state.isRunning}
          />
          <label htmlFor="use-regex" className="text-sm">
            Use Regex
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleBatchEdit}
          disabled={state.isRunning || !editFind || !editReplace}
          className="flex-1"
        >
          {state.isRunning ? 'Running...' : editDryRun ? 'Preview Changes' : 'Apply Changes'}
        </Button>
        <Button variant="outline" onClick={handleClear} disabled={state.isRunning}>
          Clear
        </Button>
      </div>
    </div>
  )

  const renderBatchReadForm = () => (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">File Paths (one per line)</label>
        <textarea
          value={readPaths}
          onChange={(e) => setReadPaths(e.target.value)}
          placeholder="src/index.ts&#10;src/utils.ts&#10;README.md"
          disabled={state.isRunning}
          className="min-h-[120px] w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Max Files</label>
        <Input
          type="number"
          min="1"
          max="100"
          value={readMaxFiles}
          onChange={(e) => setReadMaxFiles(parseInt(e.target.value) || 20)}
          disabled={state.isRunning}
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleBatchRead}
          disabled={state.isRunning || !readPaths.trim()}
          className="flex-1"
        >
          {state.isRunning ? 'Reading...' : 'Read Files'}
        </Button>
        <Button variant="outline" onClick={handleClear} disabled={state.isRunning}>
          Clear
        </Button>
      </div>
    </div>
  )

  const renderPreview = () => {
    if (!state.preview) return null

    if (state.type === 'batch_edit') {
      const results = state.preview as BatchEditPreview[]
      return (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium">Preview Results ({results.length} files)</h4>
          <div className="max-h-[400px] space-y-2 overflow-auto">
            {results.map((result, idx) => (
              <Card key={idx} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm">{result.path}</code>
                      {result.matched && <Badge variant="success">Matched</Badge>}
                      {result.error && <Badge variant="error">Error</Badge>}
                    </div>
                    {result.preview && (
                      <div className="mt-2 text-xs">
                        <div className="rounded bg-danger-bg p-2 text-danger">
                          <span className="font-medium">Line {result.preview.line}:</span>{' '}
                          {result.preview.old}
                        </div>
                        <div className="mt-1 rounded bg-success-bg p-2 text-success-text">
                          <span className="font-medium">Replace with:</span> {result.preview.new}
                        </div>
                      </div>
                    )}
                    {result.error && <p className="mt-2 text-xs text-red-600">{result.error}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {!editDryRun && onUndo && (
            <Button variant="outline" onClick={handleUndo} className="mt-2">
              Undo Last Operation
            </Button>
          )}
        </div>
      )
    }

    if (state.type === 'read') {
      const results = state.preview as BatchReadResult[]
      const successCount = results.filter((r) => r.success).length
      return (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium">
            Read Results ({successCount}/{results.length} files)
          </h4>
          <div className="max-h-[400px] space-y-2 overflow-auto">
            {results.map((result, idx) => (
              <Card key={idx} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm">{result.path}</code>
                      {result.success && <Badge variant="success">Read</Badge>}
                      {result.error && <Badge variant="error">Error</Badge>}
                      {result.size && (
                        <span className="text-xs text-neutral-500">{result.size} bytes</span>
                      )}
                    </div>
                    {result.content && (
                      <div className="mt-2 max-h-[100px] overflow-auto rounded bg-neutral-50 p-2 text-xs">
                        <pre>
                          {result.content.substring(0, 500)}
                          {result.content.length > 500 ? '...' : ''}
                        </pre>
                      </div>
                    )}
                    {result.error && <p className="mt-2 text-xs text-red-600">{result.error}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  //=============================================================================
  // Main Render
  //=============================================================================

  return (
    <div className={className}>
      <Card className="p-4">
        <h2 className="mb-4 text-lg font-semibold">Batch Operations</h2>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Batch operation modes"
          className="mb-4 flex gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-700"
        >
          <button
            id="batch-edit-tab"
            type="button"
            role="tab"
            aria-selected={state.type === 'batch_edit'}
            aria-controls="batch-edit-panel"
            tabIndex={state.type === 'batch_edit' ? 0 : -1}
            onClick={() => setState((prev) => ({ ...prev, type: 'batch_edit' }))}
            className={`px-3 py-1 text-sm ${state.type === 'batch_edit' ? 'border-b-2 border-blue-500 font-medium' : 'text-neutral-500'}`}
          >
            Batch Edit
          </button>
          <button
            id="batch-read-tab"
            type="button"
            role="tab"
            aria-selected={state.type === 'read'}
            aria-controls="batch-read-panel"
            tabIndex={state.type === 'read' ? 0 : -1}
            onClick={() => setState((prev) => ({ ...prev, type: 'read' }))}
            className={`px-3 py-1 text-sm ${state.type === 'read' ? 'border-b-2 border-blue-500 font-medium' : 'text-neutral-500'}`}
          >
            Batch Read
          </button>
        </div>

        {/* Error Display */}
        {state.error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">
            <strong>Error:</strong> {state.error}
          </div>
        )}

        {/* Progress Bar */}
        {state.isRunning && (
          <div className="mb-4">
            <Progress value={state.progress} className="h-2" />
            <p className="mt-1 text-xs text-neutral-500">Processing operation...</p>
          </div>
        )}

        {/* Forms */}
        {state.type === 'batch_edit' && (
          <div id="batch-edit-panel" role="tabpanel" aria-labelledby="batch-edit-tab">
            {renderBatchEditForm()}
          </div>
        )}
        {state.type === 'read' && (
          <div id="batch-read-panel" role="tabpanel" aria-labelledby="batch-read-tab">
            {renderBatchReadForm()}
          </div>
        )}

        {/* Preview */}
        {renderPreview()}
      </Card>
    </div>
  )
}

//=============================================================================
// Default Export
//=============================================================================

export default BatchOperationsPanel
