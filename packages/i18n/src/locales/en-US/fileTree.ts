// File Tree
export const fileTree = {
    pending: {
      create: "Added",
      modify: "Modified",
      delete: "Deleted",
    },
    copyPath: "Copy Path",
    inspectElement: "Inspect Element",
    emptyStateHint: "You can continue without selecting a local directory",
    emptyStateDescription:
      "File changes will appear here in pure OPFS sandbox mode",
    draftFiles: "Draft Files",
    approvedNotSynced: "Approved, pending disk sync",
} as const
