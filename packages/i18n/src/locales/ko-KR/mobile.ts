// 모바일 전용
export const mobile = {
    menu: "메뉴",
    back: "뒤로",
    home: "홈",
    profile: "프로필",
} as const

// 오프라인 대기열
export const offlineQueue = {
    justNow: "방금",
    minutesAgo: "{count}분 전",
    hoursAgo: "{count}시간 전",
    retry: "재시도",
    delete: "삭제",
    syncing: "동기화 중",
    pending: "대기 중",
    failed: "실패",
    completed: "완료",
    clearCompleted: "완료 항목 지우기",
    online: "온라인",
    offline: "오프라인",
    syncingCount: "동기화 중 {count}",
    pendingCount: "대기 중 {count}",
    failedCount: "실패 {count}",
    connectedToNetwork: "네트워크에 연결됨",
    offlineMode: "오프라인 모드",
    tasksWillSyncAutomatically: "작업이 자동으로 동기화됩니다",
    tasksWillSyncWhenReconnected: "연결이 복원되면 작업이 동기화됩니다",
    syncAll: "모두 동기화",
    noOfflineTasks: "오프라인 작업 없음",
    tasksSavedAutomatically:
      "네트워크 중단 시 작업이 자동으로 대기열에 저장됩니다",
} as const
