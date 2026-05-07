export const webContainer = {
    // Status labels
    statusIdle: "유휴",
    statusBooting: "컨테이너 시작 중",
    statusSyncing: "파일 동기화 중",
    statusInstalling: "의존성 설치 중",
    statusStarting: "서비스 시작 중",
    statusRunning: "실행 중",
    statusStopping: "중지 중",
    statusError: "오류",
    // Project info
    unrecognisedProject: "인식할 수 없는 프로젝트",
    // Config section
    startupConfig: "시작 구성",
    startupConfigHelp:
      "모노레포 또는 멀티 앱 디렉터리 구조를 지원하기 위해 하위 디렉터리와 스크립트를 선택할 수 있습니다.",
    directorySelect: "디렉터리",
    selectDirectory: "디렉터리 선택",
    currentStartupDir: "현재 시작 디렉터리",
    dirChangeRequiresRestart:
      "디렉tery를 변경하면 다시 시작하거나 다시 시작해야 적용됩니다",
    advancedOptions: "고급 옵션",
    startupDirManual: "시작 디렉터리 (수동)",
    startupDirPlaceholder: "예: apps/web (기본 .)",
    startupScript: "시작 스크립트",
    selectStartupScript: "시작 스크립트 선택",
    autoScript: "자동 (현재: {name})",
    // Buttons
    start: "시작",
    stop: "중지",
    restart: "다시 시작",
    sync: "동기화",
    reinstallDeps: "의존성 재설치",
    // Log section
    logOutput: "로그 출력 ({count})",
    clearLogs: "지우기",
    copyLogs: "복사",
    openPreview: "미리보기 열기",
    noOutputYet: '아직 출력이 없습니다. "시작"을 클릭하여 시작하세요',
    // Directory picker dialog
    selectStartupDir: "시작 디렉터리 선택",
    selected: "선택됨: {path}",
    resetToProjectRoot: "프로젝트 루트로 재설정",
    confirm: "확인",
    cancel: "취소",
    projectDirectory: "프로젝트 디렉터리",
    // Toast messages
    logsCopied: "로그가 클립보드에 복사되었습니다",
    copyLogsFailed: "로그 복사에 실패했습니다. 브라우저 권한을 확인하세요",
} as const
