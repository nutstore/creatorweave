export const STORAGE_RESET_MARKER_KEY = 'creatorweave.storage.reset.pending'

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function setStorageResetMarker(value: string = String(Date.now())): void {
  if (!canUseSessionStorage()) {
    return
  }
  window.sessionStorage.setItem(STORAGE_RESET_MARKER_KEY, value)
}

export function getStorageResetMarker(): string | null {
  if (!canUseSessionStorage()) {
    return null
  }
  return window.sessionStorage.getItem(STORAGE_RESET_MARKER_KEY)
}

export function clearStorageResetMarker(): void {
  if (!canUseSessionStorage()) {
    return
  }
  window.sessionStorage.removeItem(STORAGE_RESET_MARKER_KEY)
}
