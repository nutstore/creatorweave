/**
 * Schedule Run Logger — builds and writes execution transcripts to OPFS.
 *
 * Writes to: OPFS/schedule-runs/{scheduleId}/{timestamp}.log
 *
 * Format: plain text with section separators, human-readable and grep-friendly.
 */

import type { Schedule } from '@/services/schedule-storage'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallEntry {
  index: number
  tool: string
  args: Record<string, unknown>
  duration: number // ms
  response: string
  error?: string
}

export interface LLMCallEntry {
  index: number
  duration: number // ms
  response: string
  error?: string
}

export interface RunLog {
  schedule: Schedule
  startedAt: number
  endedAt: number
  status: 'SUCCESS' | 'FAILED'
  toolCalls: ToolCallEntry[]
  llmCalls: LLMCallEntry[]
  error?: string
}

// ---------------------------------------------------------------------------
// Log building
// ---------------------------------------------------------------------------

/**
 * Build a human-readable log string from a RunLog.
 */
export function buildRunLogText(log: RunLog): string {
  const lines: string[] = []
  const startDate = new Date(log.startedAt)
  const endDate = new Date(log.endedAt)
  const durationMs = log.endedAt - log.startedAt

  lines.push('=== Schedule Run Log ===')
  lines.push(`Schedule: ${log.schedule.id} (${log.schedule.name})`)
  lines.push(`Started:  ${formatDate(startDate)}`)
  lines.push(`Ended:    ${formatDate(endDate)}`)
  lines.push(`Duration: ${formatDuration(durationMs)}`)
  lines.push(`Status:   ${log.status}`)

  if (log.error) {
    lines.push(`Error:    ${log.error}`)
  }

  lines.push('')

  // Tool calls
  for (const tc of log.toolCalls) {
    lines.push(`--- tool_call #${tc.index} ---`)
    lines.push(`tool:     ${tc.tool}`)
    lines.push(`duration: ${tc.duration}ms`)
    if (tc.error) {
      lines.push(`error:    ${tc.error}`)
    }
    lines.push(`args:`)
    lines.push(JSON.stringify(tc.args, null, 2).split('\n').map(l => '  ' + l).join('\n'))
    lines.push(`response:`)
    lines.push(tc.response.split('\n').map(l => '  ' + l).join('\n'))
    lines.push('')
  }

  // LLM calls
  for (const llm of log.llmCalls) {
    lines.push(`--- llm_call #${llm.index} ---`)
    lines.push(`duration: ${llm.duration}ms`)
    if (llm.error) {
      lines.push(`error:    ${llm.error}`)
    }
    lines.push(`response:`)
    lines.push(llm.response.split('\n').map(l => '  ' + l).join('\n'))
    lines.push('')
  }

  lines.push('=== END ===')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Log writing
// ---------------------------------------------------------------------------

const SCHEDULE_RUNS_DIR = 'schedule-runs'

async function getScheduleRunsDir(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory()
  return opfsRoot.getDirectoryHandle(SCHEDULE_RUNS_DIR, { create: true })
}

async function getScheduleRunDir(scheduleId: string): Promise<FileSystemDirectoryHandle> {
  const root = await getScheduleRunsDir()
  return root.getDirectoryHandle(scheduleId, { create: true })
}

/**
 * Write a RunLog to OPFS and return the relative path for display.
 */
export async function writeRunLog(log: RunLog): Promise<string> {
  const scheduleDir = await getScheduleRunDir(log.schedule.id)
  const timestamp = formatTimestamp(log.startedAt)
  const fileName = `${timestamp}.log`
  const fileHandle = await scheduleDir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(buildRunLogText(log))
  } finally {
    await writable.close()
  }
  return `${SCHEDULE_RUNS_DIR}/${log.schedule.id}/${fileName}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
         `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

/**
 * Truncate a string for log output (to avoid huge logs).
 * Keeps first + last N chars if over threshold.
 */
export function truncateForLog(text: string, maxLen = 4000): string {
  if (text.length <= maxLen) return text
  const half = Math.floor((maxLen - 20) / 2)
  return text.slice(0, half) + `\n... [truncated, ${text.length - maxLen} chars omitted] ...\n` + text.slice(-half)
}
