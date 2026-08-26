import { describe, expect, it } from 'vitest'
import {
  buildConflictMarkerContent,
  CONFLICT_MARKER_END,
  CONFLICT_MARKER_MIDDLE,
  CONFLICT_MARKER_START,
  hasConflictMarkers,
} from '../conflict-markers'

describe('buildConflictMarkerContent', () => {
  it('wraps entire file when all lines differ', () => {
    const opfs = 'const value = 1;\n'
    const disk = 'const value = 2;\n'

    const result = buildConflictMarkerContent(opfs, disk)

    expect(result).toContain(CONFLICT_MARKER_START)
    expect(result).toContain(CONFLICT_MARKER_MIDDLE)
    expect(result).toContain(CONFLICT_MARKER_END)
    expect(result).toContain('const value = 1;')
    expect(result).toContain('const value = 2;')
  })

  it('only marks differing regions, leaving common lines outside markers', () => {
    const opfs = 'line 1\nline 2\nopfs change\nline 4\nline 5\n'
    const disk = 'line 1\nline 2\ndisk change\nline 4\nline 5\n'

    const result = buildConflictMarkerContent(opfs, disk)

    const lines = result.split('\n')
    const startIdx = lines.indexOf(CONFLICT_MARKER_START)
    const midIdx = lines.indexOf(CONFLICT_MARKER_MIDDLE)
    const endIdx = lines.indexOf(CONFLICT_MARKER_END)

    expect(startIdx).toBeGreaterThan(-1)
    expect(midIdx).toBeGreaterThan(startIdx)
    expect(endIdx).toBeGreaterThan(midIdx)

    // Between START and MIDDLE: only the OPFS change line
    const leftLines = lines.slice(startIdx + 1, midIdx)
    expect(leftLines).toEqual(['opfs change'])

    // Between MIDDLE and END: only the disk change line
    const rightLines = lines.slice(midIdx + 1, endIdx)
    expect(rightLines).toEqual(['disk change'])
  })

  it('handles multiple separate diff regions', () => {
    const opfs = 'header\nopfs-1\nmiddle\nopfs-2\nfooter\n'
    const disk = 'header\ndisk-1\nmiddle\ndisk-2\nfooter\n'

    const result = buildConflictMarkerContent(opfs, disk)

    // Should produce two separate conflict blocks
    const startCount = result.split(CONFLICT_MARKER_START).length - 1
    expect(startCount).toBe(2)

    // Common lines outside markers
    expect(result).toContain('header')
    expect(result).toContain('middle')
    expect(result).toContain('footer')
  })

  it('handles OPFS addition (disk side empty in diff region)', () => {
    const opfs = 'line 1\nline 2\nextra opfs line\n'
    const disk = 'line 1\nline 2\n'

    const result = buildConflictMarkerContent(opfs, disk)

    expect(hasConflictMarkers(result)).toBe(true)
    expect(result).toContain('extra opfs line')
    expect(result).toContain('line 1')
    expect(result).toContain('line 2')
  })

  it('handles disk addition (OPFS side empty in diff region)', () => {
    const opfs = 'line 1\nline 2\n'
    const disk = 'line 1\nline 2\nextra disk line\n'

    const result = buildConflictMarkerContent(opfs, disk)

    expect(hasConflictMarkers(result)).toBe(true)
    expect(result).toContain('extra disk line')
  })

  it('returns content without markers when both sides are identical', () => {
    const content = 'same\ncontent\nhere\n'
    const result = buildConflictMarkerContent(content, content)

    expect(hasConflictMarkers(result)).toBe(false)
    expect(result).toBe(content)
  })

  it('handles empty OPFS content', () => {
    const result = buildConflictMarkerContent('', 'disk content\n')

    expect(hasConflictMarkers(result)).toBe(true)
    expect(result).toContain('disk content')
  })

  it('handles empty disk content', () => {
    const result = buildConflictMarkerContent('opfs content\n', '')

    expect(hasConflictMarkers(result)).toBe(true)
    expect(result).toContain('opfs content')
  })

  it('handles both sides empty', () => {
    const result = buildConflictMarkerContent('', '')
    expect(result).toBe('')
  })

  it('handles CRLF line endings', () => {
    const opfs = 'line 1\r\nopfs change\r\nline 3\r\n'
    const disk = 'line 1\r\ndisk change\r\nline 3\r\n'

    const result = buildConflictMarkerContent(opfs, disk)

    expect(hasConflictMarkers(result)).toBe(true)
    expect(result).toContain('line 1')
    expect(result).toContain('line 3')
  })

  it('produces small conflict regions for large files with tiny diffs', () => {
    const commonLines = Array.from({ length: 200 }, (_, i) => `common line ${i}`)
    const opfsLines = [...commonLines.slice(0, 100), 'OPFS CHANGE', ...commonLines.slice(101)]
    const diskLines = [...commonLines.slice(0, 100), 'DISK CHANGE', ...commonLines.slice(101)]

    const opfs = opfsLines.join('\n') + '\n'
    const disk = diskLines.join('\n') + '\n'

    const result = buildConflictMarkerContent(opfs, disk)

    // Exactly one conflict block
    const startCount = result.split(CONFLICT_MARKER_START).length - 1
    expect(startCount).toBe(1)

    // Output close to input size (markers add ~50 chars overhead)
    const overhead = result.length - Math.max(opfs.length, disk.length)
    expect(overhead).toBeLessThan(100)

    // Common lines preserved outside markers
    expect(result).toContain('common line 0')
    expect(result).toContain('common line 199')
  })
})

describe('hasConflictMarkers', () => {
  it('detects valid conflict markers', () => {
    const text = `${CONFLICT_MARKER_START}\nleft\n${CONFLICT_MARKER_MIDDLE}\nright\n${CONFLICT_MARKER_END}\n`
    expect(hasConflictMarkers(text)).toBe(true)
  })

  it('rejects text without markers', () => {
    expect(hasConflictMarkers('just normal text\n')).toBe(false)
  })

  it('rejects text with partial markers', () => {
    expect(hasConflictMarkers(`${CONFLICT_MARKER_START}\nleft\nright\n`)).toBe(false)
  })
})
