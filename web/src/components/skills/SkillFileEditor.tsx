/**
 * SkillFileEditor — File editor for user skills.
 *
 * Uses the app's standard BrandDialog design language (same as SkillEditor,
 * SkillsManager): BrandDialogHeader, light bg with dark mode support, standard
 * padding, blue accent icons. Monaco theme follows the resolved app theme.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X, File as FileIcon, Folder, FolderOpen, ChevronRight, ChevronDown,
  FilePlus, FolderPlus, Trash2, Save, Pencil, RefreshCw, Circle,
} from 'lucide-react'
import { Editor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
  BrandButton,
} from '@creatorweave/ui'
import type { SkillMetadata } from '@/skills/skill-types'
import { useSkillsStore } from '@/store/skills.store'
import { useSkillsFiles, type SkillFileNode } from '@/skills/use-skills-files'
import { useThemeStore } from '@/store/theme.store'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

let _loaderConfigured = false
if (!_loaderConfigured) {
  loader.config({ monaco })
  _loaderConfigured = true
}

function getMonacoLanguage(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss')) return 'scss'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  if (lower.endsWith('.xml')) return 'xml'
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'shell'
  if (lower.endsWith('.sql')) return 'sql'
  return 'plaintext'
}

interface SkillFileEditorProps {
  skill: SkillMetadata
  open: boolean
  onClose: () => void
}

export function SkillFileEditor({ skill, open, onClose }: SkillFileEditorProps) {
  const t = useT()
  const skillsStore = useSkillsStore()
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  const skillDir = useMemo(() => {
    if (skill.id.startsWith('user:')) return `user/${skill.id.replace(/^user:/, '')}`
    if (skill.id.startsWith('builtin:')) return `builtin/${skill.id.replace(/^builtin:/, '')}`
    return null
  }, [skill.id])

  const isReadOnly = skill.source !== 'user'
  const { tree, loading, toggleDirectory, readFile, writeFile, createFile, deleteFile, deleteDir, rename, reload } = useSkillsFiles(skillDir)

  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNewFileInput, setShowNewFileInput] = useState<null | { type: 'file' | 'folder'; parentDir: string }>(null)
  const [newItemName, setNewItemName] = useState('')
  const [contextMenu, setContextMenu] = useState<null | { x: number; y: number; node: SkillFileNode }>(null)
  const [renamingNode, setRenamingNode] = useState<SkillFileNode | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (open && skillDir) {
      void reload()
      readFile(`${skillDir}/SKILL.md`)
        .then((content) => {
          setActiveFile(`${skillDir}/SKILL.md`)
          setFileContent(content)
          setOriginalContent(content)
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, skillDir])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const handleFileSelect = useCallback(async (node: SkillFileNode) => {
    if (node.kind !== 'file') return
    if (activeFile && fileContent !== originalContent) {
      if (!confirm(t('skillFileEditor.unsavedChanges'))) return
      await doSave()
    }
    try {
      const content = await readFile(node.path)
      setActiveFile(node.path)
      setFileContent(content)
      setOriginalContent(content)
    } catch (e) {
      console.error('[SkillFileEditor] Failed to read file:', e)
      setFileContent('')
      setOriginalContent('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, fileContent, originalContent, readFile])

  const doSave = useCallback(async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      await writeFile(activeFile, fileContent)
      setOriginalContent(fileContent)
      await skillsStore.bumpSkillsScanVersion()
      void skillsStore.loadSkills()
    } catch (e) {
      console.error('[SkillFileEditor] Save failed:', e)
      alert(t('skillFileEditor.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [activeFile, fileContent, writeFile, skillsStore, t])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void doSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, doSave])

  const handleCreateNew = useCallback((type: 'file' | 'folder', parentDir: string) => {
    setShowNewFileInput({ type, parentDir })
    setNewItemName('')
  }, [])

  const confirmCreateNew = useCallback(async () => {
    if (!showNewFileInput || !newItemName.trim() || !skillDir) return
    const { type, parentDir } = showNewFileInput
    const cleanName = newItemName.trim()
    const fullPath = parentDir ? `${parentDir}/${cleanName}` : `${skillDir}/${cleanName}`
    try {
      if (type === 'file') {
        await createFile(fullPath, '')
        setActiveFile(fullPath)
        setFileContent('')
        setOriginalContent('')
      } else {
        await createFile(`${fullPath}/.gitkeep`, '')
      }
      setShowNewFileInput(null)
      setNewItemName('')
    } catch (e) {
      console.error('[SkillFileEditor] Create failed:', e)
      alert(t('skillFileEditor.createFailed'))
    }
  }, [showNewFileInput, newItemName, skillDir, createFile, t])

  const handleDelete = useCallback(async (node: SkillFileNode) => {
    const relativeName = node.path.split('/').pop() || node.path
    if (!confirm(`${t('skillFileEditor.confirmDelete')} "${relativeName}"?`)) return
    try {
      if (node.kind === 'file') await deleteFile(node.path)
      else await deleteDir(node.path)
      if (activeFile === node.path || (node.kind === 'directory' && activeFile?.startsWith(node.path + '/'))) {
        setActiveFile(null)
        setFileContent('')
        setOriginalContent('')
      }
    } catch (e) {
      console.error('[SkillFileEditor] Delete failed:', e)
      alert(t('skillFileEditor.deleteFailed'))
    }
  }, [deleteFile, deleteDir, activeFile, t])

  const handleStartRename = useCallback((node: SkillFileNode) => {
    setRenamingNode(node)
    setRenameValue(node.name)
  }, [])

  const handleConfirmRename = useCallback(async () => {
    if (!renamingNode) return
    const newName = renameValue.trim()
    if (!newName || newName === renamingNode.name) { setRenamingNode(null); return }
    try {
      const oldPath = renamingNode.path
      await rename(oldPath, newName)
      if (activeFile === oldPath) {
        const parts = oldPath.split('/')
        parts[parts.length - 1] = newName
        setActiveFile(parts.join('/'))
      } else if (renamingNode.kind === 'directory' && activeFile?.startsWith(oldPath + '/')) {
        const parts = oldPath.split('/')
        parts[parts.length - 1] = newName
        const newDir = parts.join('/')
        setActiveFile(activeFile.replace(oldPath, newDir))
      }
      await skillsStore.bumpSkillsScanVersion()
      void skillsStore.loadSkills()
    } catch (e) {
      console.error('[SkillFileEditor] Rename failed:', e)
      alert(t('skillFileEditor.renameFailed'))
    } finally {
      setRenamingNode(null)
    }
  }, [renamingNode, renameValue, rename, activeFile, skillsStore, t])

  const hasUnsavedChanges = activeFile !== null && fileContent !== originalContent

  return (
    <BrandDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <BrandDialogContent className="flex h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
        {/* Header — standard app style */}
        <BrandDialogHeader>
          <BrandDialogTitle className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            <FileIcon className="h-4.5 w-4.5 text-blue-500" />
            {skill.name}
            <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">
              {isReadOnly ? t('skillFileEditor.readonly') : t('skillFileEditor.fileEditor')}
            </span>
            {hasUnsavedChanges && (
              <Circle className="ml-0.5 h-2 w-2 fill-amber-500 text-amber-500" />
            )}
          </BrandDialogTitle>
          <BrandDialogClose className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
            <X className="h-5 w-5" />
          </BrandDialogClose>
        </BrandDialogHeader>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* File Tree */}
          <div className="flex w-60 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
            {/* Sidebar header */}
            <div className="flex h-9 shrink-0 items-center border-b border-neutral-200 px-3 dark:border-neutral-700">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t('skillFileEditor.files')}
              </span>
              {!isReadOnly && (
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    onClick={() => handleCreateNew('file', skillDir || '')}
                    title={t('skillFileEditor.newFile')}
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleCreateNew('folder', skillDir || '')}
                    title={t('skillFileEditor.newFolder')}
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void reload()}
                    title={t('common.refresh')}
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Tree */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto py-1 text-[13px] leading-relaxed">
              {loading && (
                <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">{t('common.loading')}</div>
              )}
              {!loading && tree.length === 0 && (
                <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">{t('skillFileEditor.empty')}</div>
              )}
              {tree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  activeFile={activeFile}
                  isReadOnly={isReadOnly}
                  renamingNode={renamingNode}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onConfirmRename={() => void handleConfirmRename()}
                  onCancelRename={() => setRenamingNode(null)}
                  onToggle={toggleDirectory}
                  onSelect={handleFileSelect}
                  onDelete={handleDelete}
                  onRename={handleStartRename}
                  onContextMenu={(e, n) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, node: n }) }}
                  t={t}
                />
              ))}
              {showNewFileInput && (
                <div className="flex items-center gap-1.5 py-0.5" style={{ paddingLeft: '0.75rem' }}>
                  <span className="w-3.5 shrink-0" />
                  {showNewFileInput.type === 'file' ? (
                    <FileIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  )}
                  <input
                    autoFocus
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void confirmCreateNew()
                      if (e.key === 'Escape') setShowNewFileInput(null)
                    }}
                    onBlur={() => setShowNewFileInput(null)}
                    placeholder={showNewFileInput.type === 'file' ? t('skillFileEditor.fileNamePlaceholder') : t('skillFileEditor.folderNamePlaceholder')}
                    className="flex-1 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-xs outline-none dark:border-blue-600 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Editor toolbar */}
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-700">
              {activeFile ? (
                <>
                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <span className="truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {activeFile.split('/').slice(1).join('/') || activeFile}
                  </span>
                  {hasUnsavedChanges && (
                    <Circle className="h-1.5 w-1.5 fill-amber-500 text-amber-500" />
                  )}
                </>
              ) : (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('skillFileEditor.selectFile')}</span>
              )}
              {!isReadOnly && activeFile && (
                <div className="ml-auto">
                  <BrandButton
                    className="h-7"
                    onClick={() => void doSave()}
                    disabled={saving || !hasUnsavedChanges}
                  >
                    <Save className="mr-1 h-3.5 w-3.5" />
                    <span className="text-xs">{saving ? t('common.saving') : t('common.save')}</span>
                  </BrandButton>
                </div>
              )}
            </div>

            {/* Monaco */}
            <div className="min-h-0 flex-1">
              {activeFile ? (
                <Editor
                  height="100%"
                  language={getMonacoLanguage(activeFile)}
                  value={fileContent}
                  onChange={(val) => setFileContent(val ?? '')}
                  theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                  options={{
                    readOnly: isReadOnly,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineHeight: 20,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                    automaticLayout: true,
                    padding: { top: 12 },
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-neutral-50 dark:bg-neutral-800/50">
                  <div className="text-center">
                    <FileIcon className="mx-auto mb-2 h-10 w-10 text-neutral-300 dark:text-neutral-600" />
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">{t('skillFileEditor.selectFilePrompt')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            isReadOnly={isReadOnly}
            node={contextMenu.node}
            t={t}
            onClose={() => setContextMenu(null)}
            onDelete={() => void handleDelete(contextMenu.node)}
            onRename={() => handleStartRename(contextMenu.node)}
            skillDir={skillDir || ''}
            onNewFile={(parent) => handleCreateNew('file', parent)}
            onNewFolder={(parent) => handleCreateNew('folder', parent)}
          />
        )}
      </BrandDialogContent>
    </BrandDialog>
  )
}

// ============================================================================
// FileTreeNode
// ============================================================================

interface FileTreeNodeProps {
  node: SkillFileNode
  depth: number
  activeFile: string | null
  isReadOnly: boolean
  renamingNode: SkillFileNode | null
  renameValue: string
  onRenameValueChange: (val: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onToggle: (node: SkillFileNode) => void | Promise<void>
  onSelect: (node: SkillFileNode) => void | Promise<void>
  onDelete: (node: SkillFileNode) => void | Promise<void>
  onRename: (node: SkillFileNode) => void
  onContextMenu: (e: React.MouseEvent, node: SkillFileNode) => void
  t: (key: string) => string
}

function FileTreeNode({
  node, depth, activeFile, isReadOnly,
  renamingNode, renameValue, onRenameValueChange, onConfirmRename, onCancelRename,
  onToggle, onSelect, onDelete, onRename, onContextMenu, t,
}: FileTreeNodeProps) {
  const isActive = node.kind === 'file' && node.path === activeFile
  const isRenaming = renamingNode?.path === node.path
  const [hovered, setHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (node.kind === 'directory') void onToggle(node)
    else void onSelect(node)
  }, [node, onToggle, onSelect])

  return (
    <>
      <div
        className={cn(
          'group relative flex cursor-pointer items-center py-[3px] pr-2 transition-colors',
          isActive
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
            : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {node.kind === 'directory' ? (
          <>
            {node.expanded ? (
              <ChevronDown className="mr-0.5 h-3 w-3 shrink-0 text-neutral-400" />
            ) : (
              <ChevronRight className="mr-0.5 h-3 w-3 shrink-0 text-neutral-400" />
            )}
            {node.expanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <FileIcon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-blue-500' : 'text-neutral-400')} />
          </>
        )}
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmRename()
              if (e.key === 'Escape') onCancelRename()
            }}
            onBlur={onCancelRename}
            onClick={(e) => e.stopPropagation()}
            className="ml-1.5 flex-1 rounded border border-blue-300 bg-white px-1 py-0 text-[13px] outline-none dark:border-blue-600 dark:bg-neutral-800 dark:text-neutral-100"
          />
        ) : (
          <span className="ml-1.5 truncate">{node.name}</span>
        )}
        {!isReadOnly && !isRenaming && hovered && (
          <div className="absolute right-1 flex items-center gap-0.5">
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
              onClick={(e) => { e.stopPropagation(); onRename(node) }}
              title={t('skillFileEditor.rename')}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              onClick={(e) => { e.stopPropagation(); void onDelete(node) }}
              title={t('skillFileEditor.confirmDelete')}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {node.kind === 'directory' && node.expanded && node.children &&
        node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFile={activeFile}
            isReadOnly={isReadOnly}
            renamingNode={renamingNode}
            renameValue={renameValue}
            onRenameValueChange={onRenameValueChange}
            onConfirmRename={onConfirmRename}
            onCancelRename={onCancelRename}
            onToggle={onToggle}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
            onContextMenu={onContextMenu}
            t={t}
          />
        ))
      }
    </>
  )
}

// ============================================================================
// ContextMenu
// ============================================================================

interface ContextMenuProps {
  x: number
  y: number
  isReadOnly: boolean
  node: SkillFileNode
  skillDir: string
  t: (key: string) => string
  onClose: () => void
  onDelete: () => void
  onRename: () => void
  onNewFile: (parentDir: string) => void
  onNewFolder: (parentDir: string) => void
}

function ContextMenu({
  x, y, isReadOnly, node, skillDir, t,
  onClose, onDelete, onRename, onNewFile, onNewFolder,
}: ContextMenuProps) {
  const parentForNew = node.kind === 'directory' ? node.path : (node.path.split('/').slice(0, -1).join('/') || skillDir)

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 9999,
  }

  const itemClass = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'

  return (
    <div
      style={style}
      className="min-w-[160px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-800"
      onClick={(e) => e.stopPropagation()}
    >
      {!isReadOnly && node.kind === 'directory' && (
        <>
          <button className={itemClass} onClick={() => { onNewFile(node.path); onClose() }}>
            <FilePlus className="h-3.5 w-3.5 text-neutral-400" /> {t('skillFileEditor.newFile')}
          </button>
          <button className={itemClass} onClick={() => { onNewFolder(node.path); onClose() }}>
            <FolderPlus className="h-3.5 w-3.5 text-neutral-400" /> {t('skillFileEditor.newFolder')}
          </button>
          <div className="my-1 border-t border-neutral-200 dark:border-neutral-600" />
        </>
      )}
      {!isReadOnly && (
        <>
          {node.kind === 'file' && (
            <>
              <button className={itemClass} onClick={() => { onNewFile(parentForNew); onClose() }}>
                <FilePlus className="h-3.5 w-3.5 text-neutral-400" /> {t('skillFileEditor.newFileSibling')}
              </button>
              <div className="my-1 border-t border-neutral-200 dark:border-neutral-600" />
            </>
          )}
          <button className={itemClass} onClick={() => { onRename(); onClose() }}>
            <Pencil className="h-3.5 w-3.5 text-neutral-400" /> {t('skillFileEditor.rename')}
          </button>
          <button className={cn(itemClass, 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400')} onClick={() => { onDelete(); onClose() }}>
            <Trash2 className="h-3.5 w-3.5" /> {t('skillFileEditor.confirmDelete')}
          </button>
        </>
      )}
    </div>
  )
}
