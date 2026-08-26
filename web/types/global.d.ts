// Extend Window interface for File System Access API
declare module 'remove-markdown' {
  const removeMarkdown: (md: string, options?: {
    stripListLeaders?: boolean
    listUnicodeChar?: string
    gfm?: boolean
    useImgAltText?: boolean
    abbr?: boolean
    replaceLinksWithURL?: boolean
    htmlTagsToSkip?: string[]
  }) => string
  export default removeMarkdown
}

declare global {
  type FileSystemPermissionMode = 'read' | 'readwrite'

  interface DirectoryPickerOptions {
    id?: string
    mode?: FileSystemPermissionMode
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
  }

  interface Window {
    showDirectoryPicker: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemHandlePermissionDescriptor {
    mode?: FileSystemPermissionMode
  }

  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
    values: () => AsyncIterableIterator<FileSystemHandle>
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    [Symbol.asyncIterator]: () => AsyncIterableIterator<FileSystemHandle>
  }

  interface FileSystemHandle {
    getFile(): Promise<File>
    kind: 'file' | 'directory'
    name: string
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
  }

  interface SymbolConstructor {
    readonly dispose: unique symbol
  }

  // WASM module loaded via script tag in index.html
  interface Window {
    FileStatsWasm: {
      FileAnalyzer: new () => import('../lib/wasm-loader').FileAnalyzerInstance
      default: (module_or_path?: string) => Promise<void>
      initSync: (module?: { module: WebAssembly.Module }) => any
    }
  }
}

export {}
