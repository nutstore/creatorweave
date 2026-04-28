import { diffLines } from 'diff'

export const CONFLICT_MARKER_START = '<<<<<<< OPFS'
export const CONFLICT_MARKER_MIDDLE = '======='
export const CONFLICT_MARKER_END = '>>>>>>> DISK'

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

export function hasConflictMarkers(text: string): boolean {
  const normalized = normalizeLineEndings(text)
  return (
    normalized.includes(CONFLICT_MARKER_START) &&
    normalized.includes(`\n${CONFLICT_MARKER_MIDDLE}\n`) &&
    normalized.includes(CONFLICT_MARKER_END)
  )
}

/**
 * Build conflict-marked content from OPFS (left) and DISK (right) text.
 *
 * Uses the `diff` library's line-level diff to only mark the actual
 * differing regions with conflict markers, leaving common lines untouched.
 */
export function buildConflictMarkerContent(opfsText: string, diskText: string): string {
  const left = normalizeLineEndings(opfsText)
  const right = normalizeLineEndings(diskText)

  if (left === right) {
    return left
  }

  const changes = diffLines(left, right)

  const output: string[] = []

  let i = 0
  while (i < changes.length) {
    const change = changes[i]

    if (!change.added && !change.removed) {
      // Common lines — output directly
      output.push(change.value)
      i++
    } else {
      // Collect consecutive non-common changes into one conflict block.
      // This handles interleaved add/remove hunks as a single conflict.
      let opfsPart = ''
      let diskPart = ''

      while (i < changes.length) {
        const c = changes[i]
        if (!c.added && !c.removed) break
        if (c.removed) opfsPart += c.value
        if (c.added) diskPart += c.value
        i++
      }

      output.push(CONFLICT_MARKER_START + '\n')
      output.push(opfsPart)
      output.push(CONFLICT_MARKER_MIDDLE + '\n')
      output.push(diskPart)
      output.push(CONFLICT_MARKER_END + '\n')
    }
  }

  return output.join('')
}
