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
  const isSyncing = useSyncDialogStore((s) => s.isSyncing)

  const closeApprovalDialog = useSyncDialogStore((s) => s.closeApprovalDialog)
  const confirmApproval = useSyncDialogStore((s) => s.confirmApproval)

  const activeConflict = useSyncDialogStore(selectActiveConflict)
  const resolveConflict = useSyncDialogStore((s) => s.resolveConflict)
  const cancelConflictResolution = useSyncDialogStore((s) => s.cancelConflictResolution)

  return (
    <>
      <SnapshotApprovalDialog
        open={approveDialogOpen}
        pendingCount={pendingFiles.length}
        isSyncing={isSyncing}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeApprovalDialog()
          }
        }}
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