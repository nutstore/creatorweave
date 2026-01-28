// Extend Window interface for File System Access API
declare global {
  interface Window {
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }

  interface FileSystemHandle {
    getFile(): Promise<File>
    kind: 'file' | 'directory'
    name: string
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
