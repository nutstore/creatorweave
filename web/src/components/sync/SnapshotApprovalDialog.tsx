import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
} from '@creatorweave/ui'
import { useT } from '@/i18n'

interface SnapshotApprovalDialogProps {
  open: boolean
  pendingCount: number
  isSyncing: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void> | void
}

export function SnapshotApprovalDialog({
  open,
  pendingCount,
  isSyncing,
  onOpenChange,
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
      <BrandDialogContent className="max-w-md">
        <BrandDialogHeader>
          <BrandDialogTitle>{t('sidebar.snapshotApproval.title')}</BrandDialogTitle>
        </BrandDialogHeader>
        <BrandDialogBody>
          <p
            className="text-sm text-secondary"
            dangerouslySetInnerHTML={{ __html: t('sidebar.snapshotApproval.description', { count: pendingCount }) }}
          />
        </BrandDialogBody>
        <BrandDialogFooter>
          <BrandButton variant="ghost" disabled={isSyncing} onClick={() => onOpenChange(false)}>
            {t('sidebar.snapshotApproval.cancel')}
          </BrandButton>
          <BrandButton
            variant="primary"
            disabled={isSyncing}
            onClick={onConfirm}
          >
            {isSyncing ? t('sidebar.snapshotApproval.processing') : t('sidebar.snapshotApproval.confirm')}
          </BrandButton>
        </BrandDialogFooter>
      </BrandDialogContent>
    </BrandDialog>
  )
}