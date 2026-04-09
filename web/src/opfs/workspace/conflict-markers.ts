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

export function buildConflictMarkerContent(opfsText: string, diskText: string): string {
  const left = normalizeLineEndings(opfsText)
  const right = normalizeLineEndings(diskText)

  return [
    CONFLICT_MARKER_START,
    left,
    CONFLICT_MARKER_MIDDLE,
    right,
    CONFLICT_MARKER_END,
    '',
  ].join('\n')
}
