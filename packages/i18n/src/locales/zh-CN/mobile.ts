// 移动端专属
export const mobile = {
    menu: "菜单",
    back: "返回",
    home: "首页",
    profile: "我的",
} as const

// 离线队列
export const offlineQueue = {
    justNow: "刚刚",
    minutesAgo: "{count} 分钟前",
    hoursAgo: "{count} 小时前",
    retry: "重试",
    delete: "删除",
    syncing: "同步中",
    pending: "等待中",
    failed: "失败",
    completed: "已完成",
    clearCompleted: "清除已完成",
    online: "在线",
    offline: "离线",
    syncingCount: "同步中 {count}",
    pendingCount: "等待中 {count}",
    failedCount: "失败 {count}",
    connectedToNetwork: "已连接网络",
    offlineMode: "离线模式",
    tasksWillSyncAutomatically: "任务将自动同步",
    tasksWillSyncWhenReconnected: "任务将在恢复网络后同步",
    syncAll: "同步全部",
    noOfflineTasks: "暂无离线任务",
    tasksSavedAutomatically: "网络中断时任务将自动保存到队列",
} as const
