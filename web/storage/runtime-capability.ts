export interface RuntimeCapability {
  canPickDirectory: boolean
  canUseOPFS: boolean
  canRunApp: boolean
}

export function getRuntimeCapability(): RuntimeCapability {
  const canPickDirectory =
    typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
  const canUseOPFS =
    typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'

  return {
    canPickDirectory,
    canUseOPFS,
    canRunApp: canPickDirectory || canUseOPFS,
  }
}
