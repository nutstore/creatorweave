/**
 * Tests for Project Fingerprint System
 */

import { describe, it, expect } from 'vitest'
import {
  FingerprintScanner,
  getFingerprintScanner,
  getProjectTypeDescription,
  formatFingerprintForPrompt,
  type ProjectFingerprint,
} from '../project-fingerprint'

// Mock FileSystemDirectoryHandle
class MockDirectoryHandle implements FileSystemDirectoryHandle {
  kind: 'directory' = 'directory'
  name = 'test-project'

  constructor(
    private files: string[] = [],
    private directories: string[] = []
  ) {}

  // Implement async iterator for for...await loops
  async *[Symbol.asyncIterator](): AsyncIterableIterator<
    FileSystemDirectoryHandle | FileSystemFileHandle
  > {
    for (const name of this.files) {
      yield {
        kind: 'file',
        name,
        getFile: async () => new File([], name),
      } as FileSystemFileHandle
    }
    for (const name of this.directories) {
      yield {
        kind: 'directory',
        name,
      } as FileSystemDirectoryHandle
    }
  }

  // getFile method for compatibility
  async getFile(): Promise<File> {
    return new File([], this.name)
  }

  async *values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle> {
    for (const name of this.files) {
      yield {
        kind: 'file',
        name,
        getFile: async () => new File([], name),
      } as FileSystemFileHandle
    }
    for (const name of this.directories) {
      yield {
        kind: 'directory',
        name,
      } as FileSystemDirectoryHandle
    }
  }

  async getFileHandle(name: string): Promise<FileSystemFileHandle> {
    if (!this.files.includes(name)) {
      throw new DOMException('File not found', 'NotFoundError')
    }
    return {
      kind: 'file',
      name,
      getFile: async () => new File([], name),
    } as FileSystemFileHandle
  }

  async getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle> {
    if (!this.directories.includes(name)) {
      throw new DOMException('Directory not found', 'NotFoundError')
    }
    return new MockDirectoryHandle()
  }

  async removeEntry(_name: string): Promise<void> {
    // Not implemented for tests
  }

  async resolve(_possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    return null
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const file of this.files) {
      yield [
        file,
        {
          kind: 'file',
          name: file,
          getFile: async () => new File([], file),
        } as FileSystemFileHandle,
      ]
    }
    for (const dir of this.directories) {
      yield [
        dir,
        {
          kind: 'directory',
          name: dir,
        } as FileSystemDirectoryHandle,
      ]
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    for (const file of this.files) {
      yield file
    }
    for (const dir of this.directories) {
      yield dir
    }
  }

  isSameEntry(other: FileSystemHandle): Promise<boolean> {
    // Note: comparing this with other will always be false for different instances
    return Promise.resolve((other as any) === this)
  }

  async queryPermission(
    _descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState> {
    return 'granted'
  }

  async requestPermission(
    _descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState> {
    return 'granted'
  }

  async move(_destination: FileSystemDirectoryHandle): Promise<void> {
    throw new DOMException('Not implemented', 'NotSupportedError')
  }

  async rename(_newName: string): Promise<void> {
    throw new DOMException('Not implemented', 'NotSupportedError')
  }
}

describe('FingerprintScanner', () => {
  const scanner = new FingerprintScanner()

  describe('quickScan', () => {
    it('should detect Node.js project by package.json', async () => {
      const handle = new MockDirectoryHandle(['package.json'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('node')
    })

    it('should detect Rust project by Cargo.toml', async () => {
      const handle = new MockDirectoryHandle(['Cargo.toml'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('rust')
    })

    it('should detect Go project by go.mod', async () => {
      const handle = new MockDirectoryHandle(['go.mod'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('go')
    })

    it('should detect Python project by requirements.txt', async () => {
      const handle = new MockDirectoryHandle(['requirements.txt'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('python')
    })

    it('should detect Maven project by pom.xml', async () => {
      const handle = new MockDirectoryHandle(['pom.xml'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('maven')
    })

    it('should detect Gradle project by build.gradle', async () => {
      const handle = new MockDirectoryHandle(['build.gradle', 'settings.gradle'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('gradle')
    })

    it('should detect Ruby project by Gemfile', async () => {
      const handle = new MockDirectoryHandle(['Gemfile'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('ruby')
    })

    it('should detect PHP project by composer.json', async () => {
      const handle = new MockDirectoryHandle(['composer.json'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('php')
    })

    it('should detect Deno project by deno.json', async () => {
      const handle = new MockDirectoryHandle(['deno.json'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('deno')
    })

    it('should return unknown for unrecognized project', async () => {
      const handle = new MockDirectoryHandle(['README.md'], [])
      const type = await scanner.quickScan(handle)

      expect(type).toBe('unknown')
    })
  })
})

describe('project type descriptions', () => {
  it('should return description for React', () => {
    const desc = getProjectTypeDescription('react')
    expect(desc).toContain('React')
  })

  it('should return description for Next.js', () => {
    const desc = getProjectTypeDescription('nextjs')
    expect(desc).toContain('Next.js')
  })

  it('should return description for Python', () => {
    const desc = getProjectTypeDescription('python')
    expect(desc).toContain('Python')
  })

  it('should return description for Rust', () => {
    const desc = getProjectTypeDescription('rust')
    expect(desc).toContain('Rust')
  })

  it('should return description for unknown', () => {
    const desc = getProjectTypeDescription('unknown')
    expect(desc).toContain('Unknown')
  })
})

describe('format fingerprint for prompt', () => {
  it('should return empty string for null fingerprint', () => {
    const formatted = formatFingerprintForPrompt(null)
    expect(formatted).toBe('')
  })

  it('should return empty string for unknown project type', () => {
    const fingerprint: ProjectFingerprint = {
      type: 'unknown',
      confidence: 0,
      languages: ['unknown'],
      frameworks: ['unknown'],
      testing: 'unknown',
      buildTool: 'unknown',
      packageManager: 'unknown',
      configFiles: [],
      directories: [],
      size: 'small',
      hasTypeScript: false,
      recommendedTools: [],
    }

    const formatted = formatFingerprintForPrompt(fingerprint)
    expect(formatted).toBe('')
  })

  it('should format React project fingerprint', () => {
    const fingerprint: ProjectFingerprint = {
      type: 'react',
      confidence: 0.9,
      languages: ['typescript', 'javascript'],
      frameworks: ['react'],
      testing: 'jest',
      buildTool: 'vite',
      packageManager: 'npm',
      configFiles: ['tsconfig.json'],
      directories: ['src', 'public'],
      size: 'medium',
      hasTypeScript: true,
      recommendedTools: ['ls', 'read', 'edit'],
    }

    const formatted = formatFingerprintForPrompt(fingerprint)
    expect(formatted).toContain('Project Context')
    expect(formatted).toContain('React')
    expect(formatted).toContain('typescript')
    expect(formatted).toContain('TypeScript')
  })

  it('should format Python project fingerprint', () => {
    const fingerprint: ProjectFingerprint = {
      type: 'data-science',
      confidence: 0.85,
      languages: ['python'],
      frameworks: ['unknown'],
      testing: 'pytest',
      buildTool: 'pip',
      packageManager: 'pip',
      configFiles: ['requirements.txt'],
      directories: ['notebooks', 'data'],
      size: 'small',
      hasTypeScript: false,
      recommendedTools: ['run_python_code', 'glob', 'file_read'],
    }

    const formatted = formatFingerprintForPrompt(fingerprint)
    expect(formatted).toContain('Project Context')
    expect(formatted.toLowerCase()).toContain('data science')
    expect(formatted.toLowerCase()).toContain('python')
    expect(formatted).toContain('run_python_code')
  })
})

describe('singleton', () => {
  it('should return the same instance', () => {
    const scanner1 = getFingerprintScanner()
    const scanner2 = getFingerprintScanner()

    expect(scanner1).toBe(scanner2)
  })
})
