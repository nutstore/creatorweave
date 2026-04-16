import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
} from '@creatorweave/ui'
import { Sparkles } from 'lucide-react'
import { useT } from '@/i18n'

interface SnapshotApprovalDialogProps {
  open: boolean
  pendingCount: number
  summary: string
  summaryError: string | null
  generatingSummary: boolean
  isSyncing: boolean
  onOpenChange: (open: boolean) => void
  onSummaryChange: (value: string) => void
  onGenerateSummary: () => Promise<void> | void
  onConfirm: () => Promise<void> | void
}

export function SnapshotApprovalDialog({
  open,
  pendingCount,
  summary,
  summaryError,
  generatingSummary,
  isSyncing,
  onOpenChange,
  onSummaryChange,
  onGenerateSummary,
  onConfirm,
}: SnapshotApprovalDialogProps) {
  const t = useT()

  return (
    <BrandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSyncing) return
        onOpenChange(nextOpen)
      }}
    >
      <BrandDialogContent className="max-w-lg">
        <BrandDialogHeader>
          <BrandDialogTitle>{t('sidebar.snapshotApproval.title')}</BrandDialogTitle>
        </BrandDialogHeader>
        <BrandDialogBody>
          <div className="space-y-3">
            <p
              className="text-sm text-secondary"
              dangerouslySetInnerHTML={{ __html: t('sidebar.snapshotApproval.description', { count: pendingCount }) }}
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-secondary">{t('sidebar.snapshotApproval.summaryLabel')}</label>
                <BrandButton
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={generatingSummary || isSyncing}
                  onClick={onGenerateSummary}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {generatingSummary ? t('sidebar.snapshotApproval.generating') : t('sidebar.snapshotApproval.generateAI')}
                </BrandButton>
              </div>
              <textarea
                value={summary}
                onChange={(e) => onSummaryChange(e.target.value)}
                rows={8}
                className="w-full resize-y rounded-md border border-subtle bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('sidebar.snapshotApproval.summaryPlaceholder')}
              />
              {summaryError && (
                <p className="text-xs text-warning">{summaryError}</p>
              )}
            </div>
          </div>
        </BrandDialogBody>
        <BrandDialogFooter>
          <BrandButton variant="ghost" disabled={isSyncing} onClick={() => onOpenChange(false)}>
            {t('sidebar.snapshotApproval.cancel')}
          </BrandButton>
          <BrandButton
            variant="primary"
            disabled={isSyncing || summary.trim().length === 0}
            onClick={onConfirm}
          >
            {isSyncing ? t('sidebar.snapshotApproval.processing') : t('sidebar.snapshotApproval.confirm')}
          </BrandButton>
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  )
}
