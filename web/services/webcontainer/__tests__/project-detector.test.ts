import { describe, it, expect } from 'vitest'
import {
  pickPackageManager,
  scoreScript,
  parseMajorVersion,
} from '../project-detector'

describe('pickPackageManager', () => {
  it('should return pnpm when pnpm-lock.yaml exists', () => {
    expect(pickPackageManager(true, false)).toBe('pnpm')
  })

  it('should return yarn when yarn.lock exists', () => {
    expect(pickPackageManager(false, true)).toBe('yarn')
  })

  it('should return npm when no lock file exists', () => {
    expect(pickPackageManager(false, false)).toBe('npm')
  })
})

describe('scoreScript', () => {
  it('should give highest score to dev script', () => {
    expect(scoreScript('dev', 'next dev')).toBeGreaterThan(100)
  })

  it('should give high score to start script', () => {
    expect(scoreScript('start', 'node server')).toBeGreaterThan(100)
  })

  it('should penalize build scripts', () => {
    expect(scoreScript('build', 'npm run build')).toBeLessThan(0)
  })

  it('should penalize test scripts', () => {
    expect(scoreScript('test', 'vitest')).toBeLessThan(0)
  })

  it('should penalize lint scripts', () => {
    expect(scoreScript('lint', 'eslint')).toBeLessThan(0)
  })
})

describe('parseMajorVersion', () => {
  it('should parse version correctly', () => {
    expect(parseMajorVersion('14.0.0')).toBe(14)
    expect(parseMajorVersion('15')).toBe(15)
  })

  it('should parse version with prefix', () => {
    expect(parseMajorVersion('^14.0.0')).toBe(14)
    expect(parseMajorVersion('~15.2.0')).toBe(15)
    expect(parseMajorVersion('>=16.0.0')).toBe(16)
  })

  it('should return null for invalid version', () => {
    expect(parseMajorVersion('')).toBeNull()
    expect(parseMajorVersion('invalid')).toBeNull()
    expect(parseMajorVersion('abc')).toBeNull()
  })
})
