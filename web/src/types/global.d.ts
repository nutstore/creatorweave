// Extend Window interface for File System Access API
declare global {
  interface Window {
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
  }

  type FileSystemPermissionMode = 'read' | 'readwrite'

  interface FileSystemHandlePermissionDescriptor {
    mode?: FileSystemPermissionMode
  }

  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface FileSystemHandle {
    getFile(): Promise<File>
    kind: 'file' | 'directory'
    name: string
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  }

  interface SymbolConstructor {
    readonly dispose: unique symbol
  }

  // WASM module loaded via script tag in index.html
  interface Window {
    BrowserFsAnalyzerWasm: {
      FileAnalyzer: new () => import('../lib/wasm-loader').FileAnalyzerInstance
      default: (module_or_path?: string) => Promise<void>
      initSync: (module?: { module: WebAssembly.Module }) => any
    }
  }
}

export {}
