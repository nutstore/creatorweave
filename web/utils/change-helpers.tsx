/* eslint-disable react-refresh/only-export-components */
/**
 * Change Helpers - Common utility functions for pending file changes
 *
 * Shared between PendingSyncPanel and PendingFileList components
 */

import React from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Icon } from '@iconify/react'
import type { ChangeType } from '@/opfs/types/opfs-types'

/**
 * Change type information
 */
export interface ChangeTypeInfo {
  color: string
  bg: string
  label: string
}

/**
 * Get color and label for change type
 * Uses A/M/D labels consistently, matching FileTreePanel
 */
export function getChangeTypeInfo(type: ChangeType): ChangeTypeInfo {
  switch (type) {
    case 'add':
      return { color: 'text-success', bg: 'bg-success/10', label: 'A' }
    case 'modify':
      return { color: 'text-warning', bg: 'bg-warning/10', label: 'M' }
    case 'delete':
      return { color: 'text-danger', bg: 'bg-danger/10', label: 'D' }
  }
}

/**
 * Change type icon component (using lucide-react)
 */
export function ChangeTypeIcon({ type, className = 'w-3.5 h-3.5' }: { type: ChangeType; className?: string }): React.ReactNode {
  switch (type) {
    case 'add':
      return <Plus className={className} />
    case 'modify':
      return <Pencil className={className} />
    case 'delete':
      return <Trash2 className={className} />
  }
}

/**
 * Format file size
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Get vscode-icons icon name for file extension
 */
function getFileIconName(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()

  const iconMap: Record<string, string> = {
    // Code files
    ts: 'vscode-icons:file-type-ts',
    tsx: 'vscode-icons:file-type-tsreact',
    js: 'vscode-icons:file-type-js',
    jsx: 'vscode-icons:file-type-react',
    mjs: 'vscode-icons:file-type-js-official',
    cjs: 'vscode-icons:file-type-js',

    // Other languages
    rs: 'vscode-icons:file-type-rust',
    go: 'vscode-icons:file-type-go',
    py: 'vscode-icons:file-type-python',
    java: 'vscode-icons:file-type-java',
    cpp: 'vscode-icons:file-type-cpp',
    c: 'vscode-icons:file-type-c',
    cs: 'vscode-icons:file-type-csharp',
    php: 'vscode-icons:file-type-php',
    rb: 'vscode-icons:file-type-ruby',
    swift: 'vscode-icons:file-type-swift',
    kt: 'vscode-icons:file-type-kotlin',
    dart: 'vscode-icons:file-type-dart',

    // Web
    html: 'vscode-icons:file-type-html',
    css: 'vscode-icons:file-type-css',
    scss: 'vscode-icons:file-type-scss',
    less: 'vscode-icons:file-type-less',
    svg: 'vscode-icons:file-type-svg',
    xml: 'vscode-icons:file-type-xml',

    // Data & Config
    json: 'vscode-icons:file-type-json',
    yaml: 'vscode-icons:file-type-yaml',
    yml: 'vscode-icons:file-type-yaml',
    toml: 'vscode-icons:file-type-toml',
    ini: 'vscode-icons:file-type-ini',
    env: 'vscode-icons:file-type-env',

    // Docs
    md: 'vscode-icons:file-type-md',
    txt: 'vscode-icons:file-type-txt',
    pdf: 'vscode-icons:file-type-pdf2',
    doc: 'vscode-icons:file-type-word',
    docx: 'vscode-icons:file-type-word2',
    ppt: 'vscode-icons:file-type-powerpoint',
    pptx: 'vscode-icons:file-type-powerpoint2',
    xls: 'vscode-icons:file-type-excel',
    xlsx: 'vscode-icons:file-type-excel2',
    csv: 'vscode-icons:file-type-csv',

    // Images
    png: 'vscode-icons:file-type-png',
    jpg: 'vscode-icons:file-type-jpg',
    jpeg: 'vscode-icons:file-type-jpg',
    gif: 'vscode-icons:file-type-gif',
    webp: 'vscode-icons:file-type-webp',
    ico: 'vscode-icons:file-type-ico',
    bmp: 'vscode-icons:file-type-bmp',

    // Archives
    zip: 'vscode-icons:file-type-zip',
    gz: 'vscode-icons:file-type-zip',
    tar: 'vscode-icons:file-type-zip',
    rar: 'vscode-icons:file-type-zip',
    '7z': 'vscode-icons:file-type-zip',

    // Build & Lock
    lock: 'vscode-icons:file-type-lock',
    wasm: 'vscode-icons:file-type-wasm',

    // Git & CI
    git: 'vscode-icons:file-type-git',
    gitignore: 'vscode-icons:file-type-git',
    dockerfile: 'vscode-icons:file-type-docker',
  }

  return iconMap[ext || ''] || 'vscode-icons:file-type-default'
}

/**
 * File icon component (using iconify vscode-icons, consistent with file tree)
 */
export function FileIcon({ filename, className = 'h-3.5 w-3.5' }: { filename: string; className?: string }): React.ReactNode {
  return <Icon icon={getFileIconName(filename)} className={className} />
}
