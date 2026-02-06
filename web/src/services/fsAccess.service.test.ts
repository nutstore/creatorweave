import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isSupported, selectFolderReadWrite } from './fsAccess.service'

describe('fsAccess.service', () => {
  const originalShowDirectoryPicker = window.showDirectoryPicker

  beforeEach(() => {
    // Reset window.showDirectoryPicker before each test
    delete (window as any).showDirectoryPicker
  })

  afterEach(() => {
    // Restore original
    window.showDirectoryPicker = originalShowDirectoryPicker
  })

  describe('isSupported', () => {
    it('should return true when showDirectoryPicker is available', () => {
      window.showDirectoryPicker = vi.fn()

      expect(isSupported()).toBe(true)
    })

    it('should return false when showDirectoryPicker is not available', () => {
      delete (window as any).showDirectoryPicker

      expect(isSupported()).toBe(false)
    })
  })

  describe('selectFolderReadWrite', () => {
    it('should call showDirectoryPicker with readwrite mode', async () => {
      const mockHandle = {
        name: 'test-folder',
        kind: 'directory',
      }
      window.showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle)

      const handle = await selectFolderReadWrite()

      expect(window.showDirectoryPicker).toHaveBeenCalledOnce()
      expect(window.showDirectoryPicker).toHaveBeenCalledWith({ mode: 'readwrite' })
      expect(handle).toEqual(mockHandle)
    })

    it('should throw error when API is not supported', async () => {
      delete (window as any).showDirectoryPicker

      await expect(selectFolderReadWrite()).rejects.toThrow(
        'File System Access API is not supported'
      )
    })

    it('should propagate errors from showDirectoryPicker', async () => {
      const error = new Error('User cancelled')
      window.showDirectoryPicker = vi.fn().mockRejectedValue(error)

      await expect(selectFolderReadWrite()).rejects.toThrow('User cancelled')
    })

    it('should handle AbortError when user cancels', async () => {
      const error = new DOMException('User cancelled', 'AbortError')
      window.showDirectoryPicker = vi.fn().mockRejectedValue(error)

      await expect(selectFolderReadWrite()).rejects.toThrow('User cancelled')
    })
  })
})
