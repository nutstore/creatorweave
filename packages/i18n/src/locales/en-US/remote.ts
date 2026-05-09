export const remote = {
    title: "Remote Control",
    label: "Remote",
    host: "HOST",
    remote: "REMOTE",
    disconnect: "Disconnect",
    showQrCode: "Show QR Code",
    waitingForRemote: "Waiting for remote device...",
    // Remote Control Panel
    relayServer: "Relay Server",
    scanToConnect: "Scan with mobile to connect",
    scanHint: "Scan QR code or open link on mobile device",
    copySessionId: "Copy session ID",
    copied: "Copied!",
    clickToCreate: 'Click "Create Session" to generate QR code',
    connected: "Connected",
    connecting: "Connecting...",
    peers: "{count} peer(s)",
    createSession: "Create Session",
    cancel: "Cancel",
    direct: "Direct",
} as const

export const session = {
    current: "Current Conversation",
    switch: "Switch Conversation",
    new: "New Conversation",
    delete: "Delete Conversation",
    deleteConfirm: "Are you sure you want to delete this conversation?",
    storageLocation: "Storage Location",
    // Status
    notInitialized: "Not Initialized",
    unknownSession: "Unknown Conversation",
    initializing: "Initializing...",
    noSession: "No Conversation",
    pendingCount: "{count} pending",
    undoCount: "{count} undo",
    pendingChanges: "{count} pending changes",
    undoOperations: "{count} undo operations",
    noChanges: "No changes",
    // Conversation Switcher
    conversationSwitcher: {
      deleteConfirm:
        "Are you sure you want to delete this workspace cache? All file caches, pending syncs, and undo records will be deleted.",
      selectConversation: "Select Conversation",
      unknownConversation: "Unknown Conversation",
      conversationList: "Conversation List ({count})",
      noConversations: "No conversations",
      pendingSync: "{count} pending",
      noChanges: "No changes",
      deleteCache: "Delete conversation cache",
      newConversation: "New Conversation",
    },
} as const
