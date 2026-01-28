import { describe, it, expect } from 'vitest'
import { formatBytes, formatNumber, formatDuration } from './utils'

describe('formatBytes', () => {
  it('should format 0 bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('should format bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('should format kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('should format megabytes correctly', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })

  it('should format gigabytes correctly', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
  })

  it('should format terabytes correctly', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB')
  })

  it('should handle decimal precision', () => {
    expect(formatBytes(1234)).toBe('1.21 KB')
    expect(formatBytes(1234567)).toBe('1.18 MB')
  })
})

describe('formatNumber', () => {
  it('should format small numbers without commas', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(123)).toBe('123')
  })

  it('should format thousands with commas', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1234)).toBe('1,234')
    expect(formatNumber(9999)).toBe('9,999')
  })

  it('should format millions with commas', () => {
    expect(formatNumber(1000000)).toBe('1,000,000')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('should format billions with commas', () => {
    expect(formatNumber(1000000000)).toBe('1,000,000,000')
    expect(formatNumber(1234567890)).toBe('1,234,567,890')
  })

  it('should handle negative numbers', () => {
    expect(formatNumber(-1234)).toBe('-1,234')
  })
})

describe('formatDuration', () => {
  it('should format milliseconds correctly', () => {
    expect(formatDuration(100)).toBe('100ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('should format seconds correctly', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(5432)).toBe('5.4s')
  })

  it('should format minutes correctly', () => {
    expect(formatDuration(60000)).toBe('1m 0s')
    expect(formatDuration(65000)).toBe('1m 5s')
    expect(formatDuration(125000)).toBe('2m 5s')
  })

  it('should format hours correctly', () => {
    expect(formatDuration(3600000)).toBe('1h 0m 0s')
    expect(formatDuration(3661000)).toBe('1h 1m 1s')
  })

  it('should handle zero duration', () => {
    expect(formatDuration(0)).toBe('0ms')
  })
})
