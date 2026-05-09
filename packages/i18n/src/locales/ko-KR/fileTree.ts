// 파일 트리
export const fileTree = {
    pending: {
      create: "추가",
      modify: "수정",
      delete: "삭제",
    },
    copyPath: "경로 복사",
    inspectElement: "요소 검사",
    emptyStateHint: "로컬 디렉터리를 선택하지 않고도 계속할 수 있습니다",
    emptyStateDescription:
      "Pure OPFS 샌드박스 모드에서는 파일 변경 사항이 여기에 표시됩니다",
    draftFiles: "임시 파일",
    approvedNotSynced: "승인됨, 디스크 동기화 대기 중",
} as const
