/**
 * Migration Progress Component
 *
 * Displays progress during IndexedDB → SQLite migration
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import {
  runMigration,
  needsMigration,
  type MigrationProgress,
  type MigrationResult,
} from '@/sqlite'

interface MigrationStep {
  key: string
  label: string
  status: 'pending' | 'in-progress' | 'complete' | 'error'
  count?: number
  total?: number
}

export function MigrationProgress() {
  const [isNeeded, setIsNeeded] = useState<boolean | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<MigrationResult | null>(null)

  const [steps, setSteps] = useState<MigrationStep[]>([
    { key: 'init', label: '初始化', status: 'pending' },
    { key: 'conversations', label: '对话记录', status: 'pending' },
    { key: 'skills', label: '技能', status: 'pending' },
    { key: 'plugins', label: '插件', status: 'pending' },
    { key: 'api-keys', label: 'API 密钥', status: 'pending' },
    { key: 'sessions', label: '会话', status: 'pending' },
  ])

  // Check if migration is needed on mount
  useEffect(() => {
    needsMigration().then(setIsNeeded)
  }, [])

  const updateStep = (
    stepKey: string,
    status: MigrationStep['status'],
    count?: number,
    total?: number
  ) => {
    setSteps((prev) =>
      prev.map((step) => (step.key === stepKey ? { ...step, status, count, total } : step))
    )
  }

  const runMigrationAsync = async () => {
    setIsRunning(true)
    setResult(null)

    // Reset steps
    setSteps((prev) => prev.map((step) => ({ ...step, status: 'pending' as const })))

    try {
      const migrationResult = await runMigration((progress) => {
        console.log('[Migration]', progress)

        if (progress.step === 'init') {
          updateStep('init', 'in-progress')
        } else if (progress.step === 'complete') {
          // Mark all as complete
          setSteps((prev) => prev.map((step) => ({ ...step, status: 'complete' as const })))
        } else {
          // Data migration step
          const stepIndex = steps.findIndex((s) => s.key === progress.step)
          if (stepIndex >= 0) {
            updateStep(progress.step, 'in-progress', progress.current, progress.total)
          }
        }
      })

      setResult(migrationResult)

      if (migrationResult.success) {
        toast.success('数据迁移完成！', {
          description: `已迁移 ${migrationResult.conversations} 个对话，${migrationResult.skills} 个技能`,
        })
      } else {
        toast.error('数据迁移失败', {
          description: migrationResult.error,
        })
        setSteps((prev) =>
          prev.map((step) =>
            step.status === 'in-progress' ? { ...step, status: 'error' as const } : step
          )
        )
      }
    } catch (error) {
      console.error('[Migration] Error:', error)
      toast.error('数据迁移失败', {
        description: error instanceof Error ? error.message : String(error),
      })
      setSteps((prev) =>
        prev.map((step) =>
          step.status === 'in-progress' ? { ...step, status: 'error' as const } : step
        )
      )
    } finally {
      setIsRunning(false)
    }
  }

  if (isNeeded === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>数据迁移</CardTitle>
          <CardDescription>检查迁移状态...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    )
  }

  if (!isNeeded) {
    return null
  }

  const completedSteps = steps.filter((s) => s.status === 'complete').length
  const totalProgress = (completedSteps / steps.length) * 100

  return (
    <Card className="border-warning">
      <CardHeader>
        <CardTitle>需要数据迁移</CardTitle>
        <CardDescription>检测到 IndexedDB 中的旧数据，需要迁移到新的 SQLite 存储</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={totalProgress} className="h-2" />

        <div className="space-y-2">
          {steps.map((step) => (
            <div key={step.key} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {step.status === 'pending' && <span className="h-2 w-2 rounded-full bg-muted" />}
                {step.status === 'in-progress' && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                )}
                {step.status === 'complete' && (
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                )}
                {step.status === 'error' && <span className="h-2 w-2 rounded-full bg-red-500" />}
                {step.label}
              </span>
              {step.status === 'in-progress' && step.total !== undefined && (
                <span className="text-muted-foreground">
                  {step.count} / {step.total}
                </span>
              )}
              {step.status === 'complete' && <span className="text-muted-foreground">✓</span>}
            </div>
          ))}
        </div>

        <Button
          onClick={runMigrationAsync}
          disabled={isRunning || result?.success}
          className="w-full"
        >
          {isRunning ? '迁移中...' : result?.success ? '迁移完成' : '开始迁移'}
        </Button>

        {result && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">迁移结果：</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>• 对话记录: {result.conversations}</li>
              <li>• 技能: {result.skills}</li>
              <li>• 插件: {result.plugins}</li>
              <li>• API 密钥: {result.apiKeys}</li>
              <li>• 会话: {result.workspaces}</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
