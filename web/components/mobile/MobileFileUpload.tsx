/**
 * MobileFileUpload - Mobile-optimized file upload component
 *
 * Features:
 * - Touch-friendly upload button
 * - File selection with progress display
 * - Support for multiple files
 * - Progress tracking for each file
 * - Format validation with visual feedback
 */

import React, { useCallback, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  Upload,
  FileText,
  Image,
  Code,
  Table,
  Archive,
  X,
  Check,
  AlertCircle,
  Loader2,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  useMobileUpload,
  formatFileSize,
  isIOSSafari,
  isFilePickerSupported,
  UploadFile,
} from '@/hooks/useMobileUpload'

//=============================================================================
// Types
//=============================================================================

interface MobileFileUploadProps {
  /** Callback when files are selected */
  onFilesSelected?: (files: File[]) => void
  /** Callback when upload completes for all files */
  onUploadComplete?: (files: UploadFile[]) => void
  /** Callback for individual file upload completion */
  onFileComplete?: (file: UploadFile) => void
  /** File types to accept (MIME types or extensions) */
  accept?: string
  /** Allow multiple file selection */
  multiple?: boolean
  /** Maximum file size in bytes */
  maxSize?: number
  /** Maximum number of files */
  maxFiles?: number
  /** Custom upload function */
  uploadFunction?: (file: File) => Promise<void>
  /** Button variant */
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost'
  /** Button size */
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon'
  /** Show progress for each file */
  showProgress?: boolean
  /** Show file list after selection */
  showFileList?: boolean
  /** Compact mode for limited space */
  compact?: boolean
  /** Additional CSS classes */
  className?: string
}

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Get icon based on file type
 */
function getFileIcon(filename: string): React.ElementType {
  const ext = filename.toLowerCase().split('.').pop() || ''

  const iconMap: Record<string, React.ElementType> = {
    // Images
    png: Image,
    jpg: Image,
    jpeg: Image,
    gif: Image,
    svg: Image,
    webp: Image,

    // Code
    ts: Code,
    tsx: Code,
    js: Code,
    jsx: Code,
    py: Code,
    go: Code,
    rs: Code,
    java: Code,
    cpp: Code,
    c: Code,
    cs: Code,
    php: Code,
    rb: Code,
    swift: Code,
    kt: Code,

    // Data
    csv: Table,
    xlsx: Table,
    xls: Table,
    json: Table,

    // Documents
    md: FileText,
    txt: FileText,
    pdf: FileText,
    doc: FileText,
    docx: FileText,

    // Archives
    zip: Archive,
    tar: Archive,
    gz: Archive,
    rar: Archive,
    '7z': Archive,
  }

  return iconMap[ext] || FileText
}

/**
 * Get accent color class for file type
 */
function getFileTypeColor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || ''

  const colorMap: Record<string, string> = {
    // Images
    png: 'text-purple-500',
    jpg: 'text-purple-500',
    jpeg: 'text-purple-500',
    gif: 'text-purple-500',
    svg: 'text-purple-500',
    webp: 'text-purple-500',

    // Code
    ts: 'text-blue-500',
    tsx: 'text-blue-500',
    js: 'text-yellow-500',
    jsx: 'text-yellow-500',
    py: 'text-green-500',
    go: 'text-cyan-500',
    rs: 'text-orange-500',

    // Data
    csv: 'text-emerald-500',
    xlsx: 'text-emerald-500',
    xls: 'text-emerald-500',
    json: 'text-amber-500',

    // Documents
    md: 'text-slate-500',
    txt: 'text-slate-500',
    pdf: 'text-red-500',
    doc: 'text-blue-600',
    docx: 'text-blue-600',

    // Archives
    zip: 'text-amber-600',
    tar: 'text-amber-600',
    gz: 'text-amber-600',
    rar: 'text-amber-600',
    '7z': 'text-amber-600',
  }

  return colorMap[ext] || 'text-slate-500'
}

//=============================================================================
// File Item Component
//=============================================================================

interface FileItemProps {
  file: UploadFile
  showProgress?: boolean
  onRemove?: () => void
  onRetry?: () => void
}

function FileItem({ file, showProgress = true, onRemove, onRetry }: FileItemProps) {
  const Icon = getFileIcon(file.name)
  const colorClass = getFileTypeColor(file.name)

  return (
    <div
      className={clsx(
        'group relative flex items-center gap-3 rounded-lg border p-3 transition-all',
        file.status === 'error'
          ? 'border-red-200 bg-red-50'
          : file.status === 'completed'
            ? 'border-green-200 bg-green-50'
            : 'border-slate-200 bg-white'
      )}
    >
      {/* File Icon */}
      <div
        className={clsx(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          file.status === 'error'
            ? 'bg-red-100'
            : file.status === 'completed'
              ? 'bg-green-100'
              : 'bg-slate-100'
        )}
      >
        {file.status === 'uploading' ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : file.status === 'completed' ? (
          <Check className="h-5 w-5 text-green-600" />
        ) : file.status === 'error' ? (
          <AlertCircle className="h-5 w-5 text-red-500" />
        ) : (
          <Icon className={clsx('h-5 w-5', colorClass)} />
        )}
      </div>

      {/* File Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
        <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>

        {/* Progress Bar */}
        {showProgress && file.status !== 'pending' && (
          <div className="mt-2">
            <Progress
              value={file.progress}
              className={clsx(
                'h-1.5',
                file.status === 'error' && '[&>div]:bg-red-500',
                file.status === 'completed' && '[&>div]:bg-green-500'
              )}
            />
            {file.status === 'error' && file.error && (
              <p className="mt-1 text-xs text-red-600">{file.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Remove/Retry Button */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Retry Button for failed files */}
      {onRetry && file.status === 'error' && (
        <button
          onClick={onRetry}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-50"
        >
          Retry
        </button>
      )}
    </div>
  )
}

//=============================================================================
// Main Component
//=============================================================================

export function MobileFileUpload({
  onFilesSelected,
  onUploadComplete,
  onFileComplete,
  accept,
  multiple = true,
  maxSize,
  maxFiles,
  uploadFunction,
  buttonVariant = 'default',
  buttonSize = 'lg',
  showProgress = true,
  showFileList = true,
  compact = false,
  className,
}: MobileFileUploadProps) {
  const {
    selectFiles,
    uploadFiles,
    // uploadFile,
    files,
    isUploading,
    totalProgress,
    clearAll,
    removeFile,
    retryFile,
    // formatFileSize: formatSize,
  } = useMobileUpload({
    onUploadComplete: (uploadedFiles) => {
      onUploadComplete?.(uploadedFiles)
    },
    onFileComplete: (_fileId, success, error) => {
      const file = files.find((f) => f.id === _fileId)
      if (file) {
        onFileComplete?.({ ...file, status: success ? 'completed' : 'error', error })
      }
    },
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [browserWarning, setBrowserWarning] = useState<string | null>(null)

  // Check browser compatibility on mount
  React.useEffect(() => {
    if (isIOSSafari()) {
      setBrowserWarning('iOS Safari detected. Using native file picker.')
    } else if (!isFilePickerSupported()) {
      setBrowserWarning('Using fallback file picker.')
    }

    // Auto-hide warning after 3 seconds
    if (browserWarning) {
      const timer = setTimeout(() => setBrowserWarning(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [browserWarning])

  // Handle file selection
  const handleSelectFiles = useCallback(async () => {
    try {
      const selectedFiles = await selectFiles({
        accept,
        multiple,
        maxFiles,
        maxSize,
      })

      if (selectedFiles.length > 0) {
        onFilesSelected?.(selectedFiles)

        // Auto-upload if upload function is provided
        if (uploadFunction) {
          await uploadFiles(selectedFiles, uploadFunction)
        }
      }
    } catch (error) {
      console.error('File selection failed:', error)
    }
  }, [
    selectFiles,
    accept,
    multiple,
    maxFiles,
    maxSize,
    onFilesSelected,
    uploadFunction,
    uploadFiles,
  ])

  // Handle file input change (for accessibility)
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || [])

      if (selectedFiles.length > 0) {
        onFilesSelected?.(selectedFiles)

        if (uploadFunction) {
          uploadFiles(selectedFiles, uploadFunction)
        }
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [onFilesSelected, uploadFunction, uploadFiles]
  )

  // Upload all pending files
  const handleUploadAll = useCallback(async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending')
    if (pendingFiles.length > 0 && uploadFunction) {
      await uploadFiles(
        pendingFiles.map((f) => f.file),
        uploadFunction
      )
    }
  }, [files, uploadFunction, uploadFiles])

  // Pending files count
  const pendingCount = files.filter((f) => f.status === 'pending').length
  const uploadingCount = files.filter((f) => f.status === 'uploading').length
  const completedCount = files.filter((f) => f.status === 'completed').length
  const errorCount = files.filter((f) => f.status === 'error').length

  if (compact) {
    return (
      <div className={twMerge('flex flex-col gap-2', className)}>
        {/* Upload Button */}
        <Button
          variant={buttonVariant}
          size={buttonSize}
          onClick={handleSelectFiles}
          disabled={isUploading}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Select Files
            </>
          )}
        </Button>

        {/* Hidden file input for accessibility */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="hidden"
          aria-label="File input"
        />

        {/* File List */}
        {showFileList && files.length > 0 && (
          <div className="space-y-2">
            {files.slice(0, 3).map((file) => (
              <FileItem
                key={file.id}
                file={file}
                showProgress={showProgress}
                onRemove={() => removeFile(file.id)}
              />
            ))}

            {files.length > 3 && (
              <p className="text-center text-xs text-slate-500">+{files.length - 3} more files</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={twMerge('flex flex-col gap-4', className)}>
      {/* Browser Warning */}
      {browserWarning && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Smartphone className="h-4 w-4 flex-shrink-0" />
          <span>{browserWarning}</span>
        </div>
      )}

      {/* Upload Area */}
      <div
        className={clsx(
          'relative rounded-xl border-2 border-dashed transition-all',
          isUploading
            ? 'border-primary/50 bg-primary/5'
            : 'border-slate-300 bg-slate-50 hover:border-primary hover:bg-primary/5'
        )}
      >
        {/* Upload Button */}
        <div className="flex flex-col items-center justify-center gap-3 p-6">
          <div
            className={clsx(
              'flex h-14 w-14 items-center justify-center rounded-full',
              isUploading ? 'bg-primary/10' : 'bg-slate-200'
            )}
          >
            {isUploading ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : (
              <Upload className="h-7 w-7 text-slate-500" />
            )}
          </div>

          <div className="text-center">
            <Button
              variant={buttonVariant}
              size={buttonSize}
              onClick={handleSelectFiles}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading {files.length} files...
                </>
              ) : (
                'Select Files'
              )}
            </Button>

            {accept && <p className="mt-2 text-xs text-slate-500">Accepted: {accept}</p>}
          </div>
        </div>

        {/* Hidden file input for accessibility */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="File input"
        />
      </div>

      {/* Overall Progress */}
      {isUploading && files.length > 0 && (
        <div className="rounded-lg bg-slate-100 p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Overall Progress</span>
            <span className="text-slate-500">{Math.round(totalProgress)}%</span>
          </div>
          <Progress value={totalProgress} />
          <p className="mt-1 text-xs text-slate-500">
            {completedCount} completed, {uploadingCount} uploading, {errorCount} failed
          </p>
        </div>
      )}

      {/* File List */}
      {showFileList && files.length > 0 && (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-900">Selected Files ({files.length})</h3>

            {files.some((f) => f.status === 'pending') && uploadFunction && (
              <Button size="sm" variant="outline" onClick={handleUploadAll}>
                Upload All
              </Button>
            )}

            {!isUploading && files.length > 0 && (
              <button onClick={clearAll} className="text-xs text-slate-500 hover:text-slate-700">
                Clear All
              </button>
            )}
          </div>

          {/* File Items */}
          <div className="space-y-2">
            {files.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                showProgress={showProgress}
                onRemove={() => removeFile(file.id)}
                onRetry={() => retryFile(file.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload Button (Alternative) */}
      {files.some((f) => f.status === 'pending') && uploadFunction && (
        <Button
          variant="default"
          size="lg"
          onClick={handleUploadAll}
          disabled={isUploading}
          className="w-full"
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload {pendingCount} File{pendingCount !== 1 ? 's' : ''}
        </Button>
      )}
    </div>
  )
}

//=============================================================================
// Compact Variant
//=============================================================================

export function MobileFileUploadCompact({
  accept,
  multiple = true,
  maxSize,
  onFilesSelected,
  uploadFunction,
  className,
}: Omit<
  MobileFileUploadProps,
  'compact' | 'showProgress' | 'showFileList' | 'buttonVariant' | 'buttonSize'
>) {
  return (
    <MobileFileUpload
      accept={accept}
      multiple={multiple}
      maxSize={maxSize}
      onFilesSelected={onFilesSelected}
      uploadFunction={uploadFunction}
      compact={true}
      buttonVariant="outline"
      buttonSize="sm"
      showProgress={false}
      showFileList={true}
      className={className}
    />
  )
}
