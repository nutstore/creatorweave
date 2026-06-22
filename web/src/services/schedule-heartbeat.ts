/**
 * Schedule Heartbeat — 60-second ticker that checks schedules and triggers due runs.
 *
 * Architecture:
 * - Single interval that wakes up every 60s
 * - Loads all enabled schedules from OPFS
 * - For each due schedule, enqueues a run via schedule-runner.ts
 * - Detects orphan schedules (bound conversation deleted) and marks them disabled
 *
 * The heartbeat is started once in WorkspaceLayout.tsx and runs as long as the page is open.
 */

import { getNextRunTime } from '@/utils/cron-utils'
import { getEnabledSchedules } from '@/services/schedule-storage'

const HEARTBEAT_INTERVAL_MS = 60_000 // 60 seconds

/** Tracks which schedule IDs are currently running (to avoid duplicate runs) */
const runningSchedules = new Set<string>()

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

// ---------------------------------------------------------------------------
// Heartbeat control
// ---------------------------------------------------------------------------

/**
 * Start the heartbeat. Safe to call multiple times (idempotent).
 */
export function startHeartbeat(): void {
  if (heartbeatTimer !== null) return
  console.info('[ScheduleHeartbeat] Started')
  heartbeatTimer = setInterval(tick, HEARTBEAT_INTERVAL_MS)

  // Listen for schedule triggers from the browser extension
  // (chrome.alarms → background → content.ts → injected.content.ts → CustomEvent)
  window.addEventListener('cw:schedule-trigger', handleExtensionTrigger)

  // Run immediately on start
  tick().catch(err => console.error('[ScheduleHeartbeat] Initial tick failed:', err))
}

/**
 * Stop the heartbeat.
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
    console.info('[ScheduleHeartbeat] Stopped')
  }
  window.removeEventListener('cw:schedule-trigger', handleExtensionTrigger)
}

/**
 * Handle schedule trigger events from the browser extension.
 */
function handleExtensionTrigger(event: Event): void {
  const customEvent = event as CustomEvent<{ scheduleId: string }>
  const scheduleId = customEvent.detail?.scheduleId
  if (!scheduleId) return
  console.info(`[ScheduleHeartbeat] Received extension trigger for schedule ${scheduleId}`)
  triggerSchedule(scheduleId).catch(err =>
    console.error(`[ScheduleHeartbeat] Extension-triggered run failed for ${scheduleId}:`, err)
  )
}

// ---------------------------------------------------------------------------
// Tick logic
// ---------------------------------------------------------------------------

async function tick(): Promise<void> {
  const now = Date.now()

  // Step 1: Check for orphan schedules (bound conversation deleted)
  await checkOrphanSchedules()

  // Step 2: Find due schedules and enqueue runs
  const enabled = await getEnabledSchedules()
  console.info(`[ScheduleHeartbeat] tick: ${enabled.length} enabled schedule(s), now=${new Date(now).toISOString()}`)

  for (const schedule of enabled) {
    // Skip if already running
    if (runningSchedules.has(schedule.id)) {
      console.info(`[ScheduleHeartbeat] tick: "${schedule.name}" already running, skip`)
      continue
    }

    const nextRun = getNextRunTime(schedule.schedule.expression, schedule.lastRunAt ?? schedule.createdAt)
    console.info(`[ScheduleHeartbeat] tick: "${schedule.name}" cron="${schedule.schedule.expression}" lastRun=${schedule.lastRunAt ? new Date(schedule.lastRunAt).toISOString() : 'null'} nextRun=${nextRun ? new Date(nextRun).toISOString() : 'null'} due=${nextRun !== null && nextRun <= now}`)

    if (nextRun === null) continue

    // If next run is in the future, skip
    if (nextRun > now) continue

    // Due! Enqueue a run
    console.info(`[ScheduleHeartbeat] Schedule "${schedule.name}" (${schedule.id}) is due, enqueuing run`)
    runningSchedules.add(schedule.id)

    // Fire and forget — don't await, let it run in background
    runScheduleAsync(schedule.id).finally(() => {
      runningSchedules.delete(schedule.id)
    })
  }
}

// ---------------------------------------------------------------------------
// Orphan detection
// ---------------------------------------------------------------------------

/**
 * Check if bound workspaces still exist. Mark orphaned schedules as disabled.
 *
 * Note: Full orphan detection (conversation deleted) requires the Browser Extension
 * to send notifications. This is a fallback for in-tab detection when the
 * extension isn't active.
 */
async function checkOrphanSchedules(): Promise<void> {
  // TODO: Once WorkspaceRuntime exposes a way to check if a workspaceId still exists,
  // we can detect orphans here. For now, orphan detection is primarily handled
  // by the browser extension messaging system.
  //
  // The browser extension monitors conversation deletion events and sends
  // `cw_schedule_disable` messages to the active tab, which updates the schedule
  // error field accordingly.
}

// ---------------------------------------------------------------------------
// Run enqueue
// ---------------------------------------------------------------------------

/**
 * Dynamically import schedule-runner to avoid circular dependency.
 */
async function runScheduleAsync(scheduleId: string): Promise<void> {
  try {
    const { runSchedule } = await import('@/services/schedule-runner')
    await runSchedule(scheduleId)
  } catch (err) {
    console.error(`[ScheduleHeartbeat] Failed to run schedule ${scheduleId}:`, err)
  }
}

// ---------------------------------------------------------------------------
// External triggers (from Browser Extension messages)
// ---------------------------------------------------------------------------

/**
 * Trigger a specific schedule immediately (used by Browser Extension
 * cw_schedule_run message or user "Run Now" button).
 */
export async function triggerSchedule(scheduleId: string, options?: { force?: boolean }): Promise<void> {
  if (runningSchedules.has(scheduleId)) {
    console.warn(`[ScheduleHeartbeat] Schedule ${scheduleId} is already running, skipping`)
    return
  }

  runningSchedules.add(scheduleId)
  try {
    const { runSchedule } = await import('@/services/schedule-runner')
    await runSchedule(scheduleId, options)
  } finally {
    runningSchedules.delete(scheduleId)
  }
}

/**
 * Check if a schedule is currently running.
 */
export function isScheduleRunning(scheduleId: string): boolean {
  return runningSchedules.has(scheduleId)
}
