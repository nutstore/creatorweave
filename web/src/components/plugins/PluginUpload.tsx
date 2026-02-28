/**
 * Plugin Upload Component
 *
 * Unified design matching the main app
 */

import { useState, useRef, useCallback } from 'react'
import { Upload, AlertCircle, Loader2 } from 'lucide-react'
import './plugin-ui.css'

interface PluginUploadProps {
  onUpload: (file: File) => Promise<void>
  accept?: string
}

export function PluginUpload({ onUpload, accept = '.wasm' }: PluginUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  const validateAndUpload = useCallback(async (file: File) => {
    setError(null)

    // Validate file extension
    if (!file.name.endsWith('.wasm')) {
      setError('Only .wasm files are accepted')
      return
    }

    // Validate WASM format
    try {
      const bytes = await file.arrayBuffer()
      const view = new Uint8Array(bytes)

      // Check WASM magic number: 00 61 73 6D 01 00 00 00
      const magic = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]
      const isValidMagic = magic.every((byte, i) => view[i] === byte)

      if (!isValidMagic) {
        setError('Invalid WASM format')
        return
      }

      // Upload
      setUploading(true)
      await onUpload(file)

      setTimeout(() => {
        setUploading(false)
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploading(false)
    }
  }, [onUpload])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      await validateAndUpload(file)
    }
  }, [validateAndUpload])

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await validateAndUpload(file)
    }
  }, [validateAndUpload])

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="upload-zone">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      <div
        className={`upload-zone ${dragging ? 'upload-zone--dragging' : ''} ${error ? 'upload-zone--error' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!uploading ? handleClick : undefined}
      >
        <div className="upload-zone-content">
          {uploading ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary-600" />
              <div className="upload-zone-title">Uploading module...</div>
            </>
          ) : error ? (
            <>
              <AlertCircle className="h-12 w-12 text-error" />
              <div className="upload-zone-title">{error}</div>
              <button
                className="mt-2 text-sm text-primary-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation()
                  setError(null)
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <div className="upload-zone-icon">
                <Upload className="h-12 w-12" />
              </div>
              <div className="upload-zone-title">Drop WASM module here</div>
              <div className="upload-zone-subtitle">or click to browse file system</div>
              <div className="upload-zone-hint">Accepts .wasm binary files only</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
