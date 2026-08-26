type DiffInput = {
  path: string
  beforeText: string
  afterText: string
  isBinary?: boolean
}

type BuildRequest = {
  id: string
  type: 'BUILD_DIFF_SECTIONS'
  payload: {
    inputs: DiffInput[]
    contextLines?: number
    maxOutputLines?: number
    maxNoChangeLines?: number
  }
}

type WorkerRequest = BuildRequest

type WorkerResponse =
  | {
      id: string
      type: 'BUILD_DIFF_SECTIONS_RESULT'
      payload: { sections: string[] }
    }
  | {
      id: string
      type: 'ERROR'
      payload: { error: string }
    }

type DiffLine = { type: 'context' | 'added' | 'removed'; text: string }

function computeDiffLines(beforeText: string, afterText: string): DiffLine[] {
  const beforeLines = beforeText.split('\n')
  const afterLines = afterText.split('\n')
  const m = beforeLines.length
  const n = afterLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (beforeLines[i] === afterLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (beforeLines[i] === afterLines[j]) {
      result.push({ type: 'context', text: beforeLines[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: beforeLines[i] })
      i += 1
    } else {
      result.push({ type: 'added', text: afterLines[j] })
      j += 1
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: beforeLines[i] })
    i += 1
  }
  while (j < n) {
    result.push({ type: 'added', text: afterLines[j] })
    j += 1
  }
  return result
}

function buildUnifiedDiff(
  path: string,
  beforeText: string,
  afterText: string,
  options?: { contextLines?: number; maxOutputLines?: number; maxNoChangeLines?: number }
): string {
  const lines = computeDiffLines(beforeText, afterText)
  const contextLines = options?.contextLines ?? 2
  const maxOutputLines = options?.maxOutputLines ?? 120
  const maxNoChangeLines = options?.maxNoChangeLines ?? 30

  const changedIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter((x) => x.line.type !== 'context')
    .map((x) => x.index)

  const selectedIndexes = new Set<number>()
  if (changedIndexes.length === 0) {
    lines.slice(0, maxNoChangeLines).forEach((_, idx) => selectedIndexes.add(idx))
  } else {
    for (const idx of changedIndexes) {
      for (
        let i = Math.max(0, idx - contextLines);
        i <= Math.min(lines.length - 1, idx + contextLines);
        i += 1
      ) {
        selectedIndexes.add(i)
      }
    }
  }

  const body = Array.from(selectedIndexes)
    .sort((a, b) => a - b)
    .slice(0, maxOutputLines)
    .map((idx) => {
      const line = lines[idx]
      const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
      return `${prefix}${line.text}`
    })
    .join('\n')

  return `--- a/${path}\n+++ b/${path}\n@@\n${body}`
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type !== 'BUILD_DIFF_SECTIONS') return

  try {
    const { id, payload } = message
    const sections = payload.inputs.map((input) => {
      if (input.isBinary) {
        return `--- a/${input.path}\n+++ b/${input.path}\n@@\n[binary image omitted]`
      }
      return buildUnifiedDiff(input.path, input.beforeText, input.afterText, {
        contextLines: payload.contextLines,
        maxOutputLines: payload.maxOutputLines,
        maxNoChangeLines: payload.maxNoChangeLines,
      })
    })
    const response: WorkerResponse = {
      id,
      type: 'BUILD_DIFF_SECTIONS_RESULT',
      payload: { sections },
    }
    self.postMessage(response)
  } catch (error) {
    const response: WorkerResponse = {
      id: message.id,
      type: 'ERROR',
      payload: { error: error instanceof Error ? error.message : String(error) },
    }
    self.postMessage(response)
  }
}

export type {}
