/**
 * ScheduleForm — create or edit a schedule.
 *
 * Fields:
 * - Name
 * - Cron expression (with live description)
 * - Prompt (with distillation option)
 * - Notification preferences (onSuccess / onFailure)
 * - Test run button
 */

import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { useT } from '@/i18n'
import {
  createSchedule,
  saveSchedule,
  type Schedule,
} from '@/services/schedule-storage'
import { triggerSchedule } from '@/services/schedule-heartbeat'
import { parseCron, describeCron, getNextRunTime } from '@/utils/cron-utils'
import { getWorkspaceRepository } from '@/sqlite/repositories/workspace.repository'
import { useConversationStore } from '@/store/conversation.store'

interface ScheduleFormProps {
  workspaceId: string
  /** null = create mode, Schedule = edit mode */
  initialSchedule?: Schedule | null
  onCreated?: (schedule: Schedule) => void
  onUpdated?: (schedule: Schedule) => void
  onCancel?: () => void
}

export function ScheduleForm({
  workspaceId,
  initialSchedule,
  onCreated,
  onUpdated,
  onCancel,
}: ScheduleFormProps) {
  const t = useT()
  const isEdit = !!initialSchedule

  // Form state
  const [name, setName] = useState(initialSchedule?.name ?? '')
  const [cronExpression, setCronExpression] = useState(initialSchedule?.schedule.expression ?? '0 9 * * *')
  const [prompt, setPrompt] = useState(initialSchedule?.prompt ?? '')
  const [onSuccess, setOnSuccess] = useState(initialSchedule?.notification?.onSuccess ?? true)
  const [onFailure, setOnFailure] = useState(initialSchedule?.notification?.onFailure ?? true)

  const [cronDescription, setCronDescription] = useState('')
  const [nextRun, setNextRun] = useState<string>('')
  const [cronError, setCronError] = useState<string>('')
  // Load conversation title for default name
  useEffect(() => {
    if (!isEdit && !name) {
      // Try to get the conversation title
      const conversation = useConversationStore.getState().conversations.find(c => c.id === workspaceId)
      if (conversation) {
        setName(conversation.title)
      }
    }
  }, [workspaceId, isEdit, name])

  // Live cron parsing
  useEffect(() => {
    if (!cronExpression.trim()) {
      setCronDescription('')
      setCronError('')
      setNextRun('')
      return
    }

    const parsed = parseCron(cronExpression)
    if (!parsed.ok) {
      setCronDescription('')
      setCronError(parsed.error)
      setNextRun('')
      return
    }

    setCronError('')
    setCronDescription(describeCron(cronExpression))

    const next = getNextRunTime(cronExpression)
    if (next !== null) {
      setNextRun(new Date(next).toLocaleString())
    } else {
      setNextRun('')
    }
  }, [cronExpression])

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const canSave = name.trim() && cronExpression.trim() && !cronError && prompt.trim()

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setTestResult(null)

    try {
      // Get projectId from workspace
      let projectId = ''
      try {
        const wsRepo = await getWorkspaceRepository()
        const ws = await wsRepo.findWorkspaceById(workspaceId)
        if (ws) {
          projectId = ws.projectId ?? ''
        }
      } catch {
        // Fallback: use empty projectId
      }

      const scheduleData = {
        projectId,
        workspaceId,
        name: name.trim(),
        prompt: prompt.trim(),
        schedule: { type: 'cron' as const, expression: cronExpression.trim() },
        notification: { onSuccess, onFailure },
        enabled: true,
      }

      let saved: Schedule
      if (isEdit && initialSchedule) {
        saved = {
          ...initialSchedule,
          ...scheduleData,
          updatedAt: Date.now(),
        }
        await saveSchedule(saved)
      } else {
        saved = await createSchedule(scheduleData)
      }

      if (isEdit && initialSchedule) {
        onUpdated?.(saved)
      } else {
        onCreated?.(saved)
      }
    } catch (err) {
      setTestResult({ ok: false, message: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleTestRun = async () => {
    if (saving || testing) return
    setTesting(true)
    setTestResult(null)

    try {
      // Temporarily save the schedule if it's new
      let scheduleId = initialSchedule?.id

      if (!scheduleId) {
        // Quick save to get an ID
        let projectId = ''
        try {
          const wsRepo = await getWorkspaceRepository()
          const ws = await wsRepo.findWorkspaceById(workspaceId)
          if (ws) projectId = ws.projectId ?? ''
        } catch {}

        const temp = await createSchedule({
          projectId,
          workspaceId,
          name: name.trim() || '测试运行',
          prompt: prompt.trim(),
          schedule: { type: 'cron', expression: cronExpression.trim() },
          notification: { onSuccess: false, onFailure: false },
          enabled: false, // disabled so heartbeat won't run it
        })
        scheduleId = temp.id
      }

      if (scheduleId) {
        await triggerSchedule(scheduleId, { force: true })
        setTestResult({ ok: true, message: t('schedule.testSuccess') })
      }
    } catch (err) {
      setTestResult({ ok: false, message: String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('schedule.form.name')}</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('schedule.form.namePlaceholder')}
          />
        </div>

        {/* Cron expression */}
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('schedule.form.schedule')}</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className={`flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring ${
                cronError ? 'border-red-500' : 'border-input'
              }`}
              value={cronExpression}
              onChange={e => setCronExpression(e.target.value)}
              placeholder="0 9 * * *"
            />
          </div>

          {cronError && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3 w-3" />
              {cronError}
            </p>
          )}

          {cronDescription && !cronError && (
            <p className="text-sm text-muted">{cronDescription}</p>
          )}

          {nextRun && !cronError && (
            <p className="text-xs text-muted">
              {t('schedule.form.nextRun')}: {nextRun}
            </p>
          )}

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { label: t('schedule.preset.daily'), expr: '0 9 * * *' },
              { label: t('schedule.preset.weekly'), expr: '0 9 * * 1' },
              { label: t('schedule.preset.monthly'), expr: '0 9 1 * *' },
              { label: t('schedule.preset.hourly'), expr: '0 * * * *' },
            ].map(preset => (
              <button
                key={preset.expr}
                type="button"
                className="rounded border border-input bg-muted px-2 py-0.5 text-xs hover:bg-muted/80"
                onClick={() => setCronExpression(preset.expr)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt */}
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('schedule.form.prompt')}</label>
          <p className="text-xs text-muted">
            {t('schedule.form.promptHint')}
          </p>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={t('schedule.form.promptPlaceholder')}
          />
        </div>

        {/* Notification preferences */}
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('schedule.form.notification')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onSuccess}
                onChange={e => setOnSuccess(e.target.checked)}
                className="rounded"
              />
              {t('schedule.form.notifyOnSuccess')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onFailure}
                onChange={e => setOnFailure(e.target.checked)}
                className="rounded"
              />
              {t('schedule.form.notifyOnFailure')}
            </label>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 rounded-md p-3 text-sm ${
            testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {testResult.ok ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {testResult.message}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="shrink-0 flex flex-col gap-2 border-t pt-4">
        {/* Test run */}
        <BrandButton
          variant="secondary"
          className="w-full"
          disabled={!prompt.trim() || !!cronError || testing || saving}
          onClick={handleTestRun}
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('schedule.form.testRun')}
        </BrandButton>

        {/* Save */}
        <BrandButton
          className="w-full"
          disabled={!canSave || saving || testing}
          onClick={handleSave}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {isEdit
            ? t('schedule.form.save')
            : t('schedule.form.create')}
        </BrandButton>

        {/* Cancel */}
        {onCancel && (
          <BrandButton variant="ghost" className="w-full" onClick={onCancel}>
            {t('common.cancel')}
          </BrandButton>
        )}
      </div>
    </div>
  )
}
