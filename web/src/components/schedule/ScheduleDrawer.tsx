/**
 * ScheduleDrawer — right-side drawer for managing schedules at the PROJECT level.
 *
 * Lists all schedules whose workspaceId belongs to the current project's
 * conversations. Each schedule shows its source conversation name so the user
 * can see "which workspace has a schedule" at a glance.
 *
 * Actions: create, edit, delete, run now, pause/resume.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Clock, Plus, Play, Trash2, Edit2, X, CheckCircle, MessageSquare } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'
import { BrandButton } from '@creatorweave/ui'
import { useT } from '@/i18n'
import { useScheduleStore } from '@/store/schedule.store'
import { useConversationStore } from '@/store/conversation.store'
import {
  deleteSchedule,
  saveSchedule,
  type Schedule,
} from '@/services/schedule-storage'
import { triggerSchedule, isScheduleRunning } from '@/services/schedule-heartbeat'
import { describeCron } from '@/utils/cron-utils'
import { ScheduleForm } from './ScheduleForm'

interface ScheduleDrawerProps {
  /** Active conversation ID — used as the default target for new schedules */
  workspaceId: string
  open: boolean
  onClose: () => void
  /** Called after any schedule mutation (create/edit/delete/run) to refresh the list */
  onScheduleChanged?: () => void
}

export function ScheduleDrawer({
  workspaceId,
  open,
  onClose,
  onScheduleChanged,
}: ScheduleDrawerProps) {
  const t = useT()
  const { schedules, refresh } = useScheduleStore()

  // Build a set of conversation IDs in the current project scope
  const allConversations = useConversationStore((s) =>
    s.conversations.map((c) => ({ id: c.id, title: c.title })),
  )
  const convMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of allConversations) m.set(c.id, c.title)
    return m
  }, [allConversations])

  // Filter schedules to the current project scope (only show schedules whose
  // workspaceId is a known conversation in this project)
  const projectSchedules = useMemo(() => {
    return schedules.filter((s) => convMap.has(s.workspaceId))
  }, [schedules, convMap])

  const [loading, setLoading] = useState(false)
  // null = list view; Schedule = edit view; 'create' = create form
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list')
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    try {
      await refresh()
    } finally {
      setLoading(false)
    }
  }, [refresh])

  useEffect(() => {
    if (open) {
      loadSchedules()
    }
  }, [open, loadSchedules])

  // Poll running status every 500ms while drawer is open
  useEffect(() => {
    if (!open) return
    const interval = setInterval(() => {
      setRunningIds((prev) => {
        const next = new Set<string>()
        for (const s of projectSchedules) {
          if (isScheduleRunning(s.id)) next.add(s.id)
        }
        if (next.size !== prev.size || [...next].some((id) => !prev.has(id))) {
          return next
        }
        return prev
      })
    }, 500)
    return () => clearInterval(interval)
  }, [open, projectSchedules])

  const handleCreate = async () => {
    setEditingSchedule(null)
    setView('list')
    await loadSchedules()
    onScheduleChanged?.()
  }

  const handleEdit = async () => {
    setEditingSchedule(null)
    setView('list')
    await loadSchedules()
    onScheduleChanged?.()
  }

  const handleDelete = async (id: string) => {
    await deleteSchedule(id)
    await loadSchedules()
    onScheduleChanged?.()
  }

  const handleRunNow = async (schedule: Schedule) => {
    setRunningIds((prev) => new Set([...prev, schedule.id]))
    try {
      await triggerSchedule(schedule.id)
    } finally {
      await loadSchedules()
      onScheduleChanged?.()
    }
  }

  const handleToggleEnabled = async (schedule: Schedule) => {
    const updated = { ...schedule, enabled: !schedule.enabled, updatedAt: Date.now() }
    await saveSchedule(updated)
    await loadSchedules()
    onScheduleChanged?.()
  }

  const isRunning = (id: string) => runningIds.has(id) || isScheduleRunning(id)

  return (
    <Drawer open={open} onClose={onClose} title={t('schedule.drawerTitle')} width="440px">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b p-4">
          {view === 'list' ? (
            <BrandButton
              className="w-full"
              onClick={() => {
                setEditingSchedule(null)
                setView('create')
              }}
            >
              <Plus className="h-4 w-4" />
              {t('schedule.create')}
            </BrandButton>
          ) : (
            <BrandButton
              variant="ghost"
              className="w-full"
              onClick={() => {
                setEditingSchedule(null)
                setView('list')
              }}
            >
              <X className="h-4 w-4" />
              {t('schedule.backToList')}
            </BrandButton>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {view === 'list' ? (
            loading ? (
              <div className="flex items-center justify-center p-8 text-muted">
                {t('schedule.loading')}
              </div>
            ) : projectSchedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <Clock className="h-10 w-10 text-muted" />
                <p className="text-sm text-muted">{t('schedule.empty')}</p>
                <p className="text-xs text-muted">{t('schedule.emptyHint')}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {projectSchedules.map((schedule) => {
                  const convTitle = convMap.get(schedule.workspaceId) || '—'
                  return (
                    <li key={schedule.id} className="p-4">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-medium ${
                                schedule.enabled ? '' : 'text-muted line-through'
                              }`}
                            >
                              {schedule.name}
                            </span>
                            {!schedule.enabled && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted">
                                {t('schedule.disabled')}
                              </span>
                            )}
                            {schedule.error && (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600">
                                {schedule.error}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                            <Clock className="h-3 w-3" />
                            <span>{describeCron(schedule.schedule.expression)}</span>
                            <span className="text-neutral-300">·</span>
                            <span>{schedule.schedule.expression}</span>
                          </div>
                          {/* Source conversation */}
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                            <MessageSquare className="h-3 w-3" />
                            <span className="truncate">{convTitle}</span>
                          </div>
                          {schedule.lastRunAt && (
                            <div className="mt-0.5 text-xs text-muted">
                              {t('schedule.lastRun')}:{' '}
                              {new Date(schedule.lastRunAt).toLocaleString()} #{schedule.lastRunNumber}
                            </div>
                          )}
                        </div>

                        {/* Running indicator */}
                        {isRunning(schedule.id) && (
                          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                            {t('schedule.running')}
                          </span>
                        )}
                      </div>

                      {/* Prompt preview */}
                      {schedule.prompt && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted">
                          {schedule.prompt.slice(0, 120)}
                          {schedule.prompt.length > 120 ? '...' : ''}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-2">
                        <BrandButton
                          variant="ghost"
                          iconButton
                          title={t('schedule.runNow')}
                          disabled={isRunning(schedule.id)}
                          onClick={() => handleRunNow(schedule)}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </BrandButton>

                        <BrandButton
                          variant="ghost"
                          iconButton
                          title={t('schedule.edit')}
                          onClick={() => {
                            setEditingSchedule(schedule)
                            setView('edit')
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </BrandButton>

                        <BrandButton
                          variant="ghost"
                          iconButton
                          title={schedule.enabled ? t('schedule.pause') : t('schedule.resume')}
                          onClick={() => handleToggleEnabled(schedule)}
                        >
                          {schedule.enabled ? (
                            <X className="h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                          )}
                        </BrandButton>

                        <BrandButton
                          variant="ghost"
                          iconButton
                          title={t('schedule.delete')}
                          className="text-red-500 hover:text-red-600"
                          onClick={() => {
                            if (confirm(t('schedule.confirmDelete'))) {
                              handleDelete(schedule.id)
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </BrandButton>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          ) : (
            /* Create / Edit form */
            <ScheduleForm
              workspaceId={workspaceId}
              initialSchedule={editingSchedule}
              onCreated={handleCreate}
              onUpdated={handleEdit}
              onCancel={() => {
                setEditingSchedule(null)
                setView('list')
              }}
            />
          )}
        </div>
      </div>
    </Drawer>
  )
}
