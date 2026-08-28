// モバイル専用
export const mobile = {
    menu: "メニュー",
    back: "戻る",
    home: "ホーム",
    profile: "プロフィール",
} as const

// オフラインキュー
export const offlineQueue = {
    justNow: "たった今",
    minutesAgo: "{count}分前",
    hoursAgo: "{count}時間前",
    retry: "再試行",
    delete: "削除",
    syncing: "同期中",
    pending: "保留中",
    failed: "失敗",
    completed: "完了",
    clearCompleted: "完了を消去",
    online: "オンライン",
    offline: "オフライン",
    syncingCount: "同期中 {count}",
    pendingCount: "保留中 {count}",
    failedCount: "失敗 {count}",
    connectedToNetwork: "ネットワークに接続済み",
    offlineMode: "オフラインモード",
    tasksWillSyncAutomatically: "タスクは自動的に同期されます",
    tasksWillSyncWhenReconnected: "接続が復元されるとタスクが同期されます",
    syncAll: "すべて同期",
    noOfflineTasks: "オフラインタスクなし",
    tasksSavedAutomatically:
      "ネットワーク中断時はタスクが自動的にキューに保存されます",
} as const
