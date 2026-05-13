// 파일 뷰어
export const fileViewer = {
    pendingFiles: "보류 중인 파일",
    undoChanges: "변경 실행 취소",
    noFiles: "파일 없음",
} as const

export const standalonePreview = {
    cannotLoadPreview: "미리보기 콘텐츠를 불러올 수 없습니다",
    clickToRetry: "클릭하여 재시도",
    copiedToClipboard: "클립보드에 복사됨",
    refreshed: "새로 고침됨",
    refresh: "새로 고침",
    inspectorEnabled: "인스펙터 활성화됨 - 페이지 요소를 클릭하여 정보 복사",
    inspectorDisabled: "인스펙터 비활성화됨",
    inspectorActive: "검사 중 - 클릭하여 비활성화",
    clickToEnableInspector: "클릭하여 인스펙터 활성화",
    inspecting: "검사 중",
    inspect: "검사",
} as const

// 파일 미리보기
export const filePreview = {
    cannotReadFile: "파일을 읽을 수 없습니다",
    fileTooLarge: "파일이 너무 큽니다 ({size}), 최대 지원 크기는 {maxSize}",
    readFileFailed: "파일 읽기 실패: {error}",
    clickFileTreeToPreview: "파일 트리에서 파일을 클릭하여 미리보기",
    conflict: "충돌",
    diskFileNewer: "디스크 파일이 OPFS보다 최신입니다. 충돌이 있을 수 있습니다",
    copyContent: "내용 복사",
    close: "닫기",
    binaryFile: "바이너리 파일",
    preview: "미리보기",
    source: "소스",
    // 댓글 기능
    clickLineToComment: "행 번호를 클릭하여 댓글 추가",
    addComment: "댓글 추가...",
    send: "보내기",
    commentsCount: "{count}개 댓글",
    sendToAI: "AI에게 보내기",
    clearComments: "모든 댓글 지우기",
} as const

// 최근 파일
export const recentFiles = {
    title: "최근 파일",
    empty: "최근 파일 없음",
    emptyHint: "연 파일이 여기에 표시됩니다",
    remove: "최근에서 제거",
    confirmClear: "모든 최근 파일을 지우시겠습니까?",
    count: "{count}개 최근 파일",
} as const
