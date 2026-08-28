// 移动端专属
export const mobile = {
    menu: "Menu",
    back: "Back",
    home: "Home",
    profile: "Profile",
} as const

// Offline Queue
export const offlineQueue = {
    justNow: "Just now",
    minutesAgo: "{count} min ago",
    hoursAgo: "{count} hr ago",
    retry: "Retry",
    delete: "Delete",
    syncing: "Syncing",
    pending: "Pending",
    failed: "Failed",
    completed: "Completed",
    clearCompleted: "Clear completed",
    online: "Online",
    offline: "Offline",
    syncingCount: "Syncing {count}",
    pendingCount: "Pending {count}",
    failedCount: "Failed {count}",
    connectedToNetwork: "Connected to network",
    offlineMode: "Offline mode",
    tasksWillSyncAutomatically: "Tasks will sync automatically",
    tasksWillSyncWhenReconnected: "Tasks will sync when connection is restored",
    syncAll: "Sync All",
    noOfflineTasks: "No offline tasks",
    tasksSavedAutomatically:
      "Tasks are automatically saved to queue when network is interrupted",
} as const
