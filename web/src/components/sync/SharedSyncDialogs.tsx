/**
 * SharedSyncDialogs — single render site for the sync approval + conflict dialogs.
 *
 * Replaces the duplicated `<SnapshotApprovalDialog />` and
 * `<ConflictResolutionDialog />` instances that previously lived inside
 * both `PendingSyncPanel` and `SyncPreviewPanel`. State is centralized in
 * `useSyncDialogStore`; the panels trigger the flow via store actions.
 *
 * Mount this ONCE, high in the tree (e.g. inside WorkspaceLayout).
 */

import { SnapshotApprovalDialog } from '@/components/sync/SnapshotApprovalDialog'
import { ConflictResolutionDialog } from '@/components/sync/ConflictResolutionDialog'
import {
  useSyncDialogStore,
  selectActiveConflict,
} from '@/store/sync-dialog.store'

export function SharedSyncDialogs() {
  const approveDialogOpen = useSyncDialogStore((s) => s.approveDialogOpen)
  const pendingFiles = useSyncDialogStore((s) => s.pendingFiles)
  const snapshotSummary = useSyncDialogStore((s) => s.snapshotSummary)
  const generatingSummary = useSyncDialogStore((s) => s.generatingSummary)
  const summaryError = useSyncDialogStore((s) => s.summaryError)
  const isSyncing = useSyncDialogStore((s) => s.isSyncing)

  const setSummary = useSyncDialogStore((s) => s.setSummary)
  const closeApprovalDialog = useSyncDialogStore((s) => s.closeApprovalDialog)
  const requestGenerateSummary = useSyncDialogStore((s) => s.requestGenerateSummary)
  const confirmApproval = useSyncDialogStore((s) => s.confirmApproval)

  const activeConflict = useSyncDialogStore(selectActiveConflict)
  const resolveConflict = useSyncDialogStore((s) => s.resolveConflict)
  const cancelConflictResolution = useSyncDialogStore((s) => s.cancelConflictResolution)

  return (
    <>
      <SnapshotApprovalDialog
        open={approveDialogOpen}
        pendingCount={pendingFiles.length}
        summary={snapshotSummary}
        summaryError={summaryError}
        generatingSummary={generatingSummary}
        isSyncing={isSyncing}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            // Closing: abort any in-flight summary stream
            closeApprovalDialog()
          }
        }}
        onSummaryChange={setSummary}
        onGenerateSummary={requestGenerateSummary}
        onConfirm={confirmApproval}
      />

      {activeConflict && (
        <ConflictResolutionDialog
          conflict={activeConflict}
          onResolve={resolveConflict}
          onCancel={cancelConflictResolution}
        />
      )}
    </>
  )
}
