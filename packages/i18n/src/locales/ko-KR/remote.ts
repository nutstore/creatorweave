// 원격 제어
export const remote = {
    title: "원격 제어",
    label: "원격",
    host: "HOST",
    remote: "REMOTE",
    disconnect: "연결 해제",
    showQrCode: "QR 코드 표시",
    waitingForRemote: "원격 장치 연결 대기 중...",
    relayServer: "릴레이 서버",
    scanToConnect: "모바일로 스캔하여 연결",
    scanHint: "QR 코드를 스캔하거나 모바일 기기에서 링크를 열어주세요",
    copySessionId: "세션 ID 복사",
    copied: "복사됨!",
    clickToCreate: '"세션 생성"을 클릭하여 QR 코드 생성',
    connected: "연결됨",
    connecting: "연결 중...",
    peers: "{count}대 기기",
    createSession: "세션 생성",
    cancel: "취소",
    direct: "직접 연결",
} as const

// 세션 관리
export const session = {
    current: "현재 대화",
    switch: "대화 전환",
    new: "새 대화",
    delete: "대화 삭제",
    deleteConfirm: "이 대화를 삭제하시겠습니까?",
    storageLocation: "저장 위치",
    notInitialized: "초기화되지 않음",
    unknownSession: "알 수 없는 대화",
    initializing: "초기화 중...",
    noSession: "대화 없음",
    pendingCount: "{count}개 보류 중",
    undoCount: "{count}개 실행 취소 가능",
    pendingChanges: "{count}개 보류 중인 변경",
    undoOperations: "{count}개 실행 취소 가능한 작업",
    noChanges: "변경 없음",
    // 대화 전환기
    conversationSwitcher: {
      deleteConfirm:
        "이 작업 영역 캐시를 삭제하시겠습니까? 모든 파일 캐시, 보류 중인 동기화, 실행 취소 기록이 삭제됩니다.",
      selectConversation: "대화 선택",
      unknownConversation: "알 수 없는 대화",
      conversationList: "대화 목록 ({count})",
      noConversations: "대화 없음",
      pendingSync: "{count}개 보류 중",
      noChanges: "변경 없음",
      deleteCache: "대화 캐시 삭제",
      newConversation: "새 대화",
    },
} as const
