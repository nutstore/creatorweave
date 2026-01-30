/**
 * UndoPanel - displays file modification history with undo buttons.
 */

import { Undo2, Trash2, FileEdit, FilePlus, FileX } from 'lucide-react'
import { useUndoStore } from '@/store/undo.store'
import type { FileModification } from '@/undo/undo-types'

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function ModIcon({ type }: { type: FileModification['type'] }) {
  switch (type) {
    case 'create':
      return <FilePlus className="h-3.5 w-3.5 text-green-500" />
    case 'modify':
      return <FileEdit className="h-3.5 w-3.5 text-amber-500" />
    case 'delete':
      return <FileX className="h-3.5 w-3.5 text-red-500" />
  }
}

function ModLabel({ type }: { type: FileModification['type'] }) {
  switch (type) {
    case 'create':
      return <span className="text-green-600">创建</span>
    case 'modify':
      return <span className="text-amber-600">修改</span>
    case 'delete':
      return <span className="text-red-600">删除</span>
  }
}

export function UndoPanel() {
  const { modifications, activeCount, undo, clear } = useUndoStore()

  if (modifications.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-neutral-400">暂无文件变更记录</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1.5">
        <span className="text-xs font-medium text-neutral-600">变更记录 ({activeCount})</span>
        {modifications.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
            title="清除所有记录"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Modification list */}
      <div className="flex-1 overflow-y-auto">
        {modifications.map((mod) => (
          <div
            key={mod.id}
            className={`flex items-start gap-2 border-b border-neutral-100 px-3 py-2 ${
              mod.undone ? 'opacity-50' : ''
            }`}
          >
            <ModIcon type={mod.type} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <ModLabel type={mod.type} />
                <span className="truncate text-xs text-neutral-700" title={mod.path}>
                  {mod.path.split('/').pop()}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-neutral-400" title={mod.path}>
                {mod.path}
              </div>
              <div className="text-[10px] text-neutral-400">{formatTime(mod.timestamp)}</div>
            </div>

            {/* Undo button */}
            {!mod.undone && (
              <button
                type="button"
                onClick={() => undo(mod.id)}
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-primary-600"
                title="撤销此变更"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            )}
            {mod.undone && <span className="shrink-0 text-[10px] text-neutral-400">已撤销</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
