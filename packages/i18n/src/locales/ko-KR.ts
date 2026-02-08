export const koKR = {
  // 应用
  app: {
    productName: 'BFOSA',
    initializing: '초기화 중...',
    loadProgress: '로딩 진행률',
    preparing: '준비 중...',
  },

  // 通用
  common: {
    save: '저장',
    cancel: '취소',
    confirm: '확인',
    delete: '삭제',
    close: '닫기',
    search: '검색',
    refresh: '새로고침',
    loading: '로딩 중...',
    error: '오류',
    success: '성공',
    copy: '복사',
    copied: '복사됨',
  },

  // 顶部导航
  topbar: {
    productName: 'BFOSA',
    openFolder: '폴더 열기',
    switchFolder: '프로젝트 폴더 전환',
    noApiKey: 'API Key가 설정되지 않음',
    settings: '설정',
    skillsManagement: '스킬 관리',
  },

  // 设置对话框
  settings: {
    title: '설정',
    llmProvider: 'LLM 공급자',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'API Key를 입력하세요...',
    save: '저장',
    saved: '저장됨',
    apiKeyNote: '키는 AES-256 암호화되어 로컬 브라우저에 저장됩니다',
    modelName: '모델 이름',
    temperature: 'Temperature',
    maxTokens: '최대 출력 토큰 수',

    providers: {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      groq: 'Groq',
      mistral: 'Mistral',
      glm: 'Zhipu GLM',
      'glm-coding': 'Zhipu GLM (Coding)',
      kimi: 'Kimi (Moonshot)',
      minimax: 'MiniMax',
      qwen: 'Qwen',
      custom: '커스텀 (OpenAI 호환)',
    },
  },

  // 欢迎页
  welcome: {
    title: 'BFOSA',
    tagline: '브라우저 네이티브 AI 워크스페이스',
    placeholder: '메시지를 입력하여 대화를 시작하세요...',
    placeholderNoKey: '먼저 설정에서 API Key를 구성해주세요',
    send: '전송',
    openLocalFolder: '로컬 폴더 열기',
    recentHint: '왼쪽에서 기존 대화를 선택하거나, 메시지를 입력하여 새 대화를 시작하세요',
  },

  // 技能管理
  skills: {
    title: '스킬 관리',
    searchPlaceholder: '스킬 이름, 설명, 태그 검색...',
    filterAll: '전체',
    filterEnabled: '활성화됨',
    filterDisabled: '비활성화됨',
    projectSkills: '프로젝트 스킬',
    mySkills: '내 스킬',
    builtinSkills: '내장 스킬',
    enabledCount: '{count} / {total} 활성화됨',
    createNew: '새 스킬',
    deleteConfirm: '이 스킬을 삭제하시겠습니까?',
    edit: '편집',
    delete: '삭제',
    enabled: '활성화됨',
    disabled: '비활성화됨',
    empty: '스킬 없음',
    // 스킬 카테고리
    categories: {
      codeReview: '코드 리뷰',
      testing: '테스트',
      debugging: '디버깅',
      refactoring: '리팩터링',
      documentation: '문서화',
      security: '보안',
      performance: '성능',
      architecture: '아키텍처',
      general: '일반',
    },
    // 프로젝트 스킬 발견 다이얼로그
    projectDialog: {
      title: '프로젝트 스킬 발견',
      description: '프로젝트에서 {count}개의 스킬을 발견했습니다. 워크스페이스에 로드하시겠습니까?',
      selectAll: '모두 선택',
      deselectAll: '선택 해제',
      selected: '선택됨',
      load: '로드',
      loadAll: '모두 로드',
      skip: '건너뛰기',
    },
  },

  // 远程控制
  remote: {
    title: '원격 제어',
    host: 'HOST',
    remote: 'REMOTE',
    disconnect: '연결 해제',
    showQrCode: 'QR 코드 표시',
    waitingForRemote: '원격 장치 연결 대기 중...',
  },

  // 会话管理
  session: {
    current: '현재 세션',
    switch: '세션 전환',
    new: '새 세션',
    delete: '세션 삭제',
    deleteConfirm: '이 세션을 삭제하시겠습니까?',
    storageLocation: '저장 위치',
    // 상태
    notInitialized: '초기화되지 않음',
    unknownSession: '알 수 없는 세션',
    initializing: '초기화 중...',
    noSession: '세션 없음',
    pendingCount: '{count}개 보류 중',
    undoCount: '{count}개 실행 취소 가능',
    pendingChanges: '{count}개 보류 중인 변경',
    undoOperations: '{count}개 실행 취소 가능한 작업',
    noChanges: '변경 없음',
  },

  // 文件查看器
  fileViewer: {
    pendingFiles: '보류 중인 파일',
    undoChanges: '변경 실행 취소',
    noFiles: '파일 없음',
  },

  // 对话相关
  conversation: {
    thinking: '생각 중...',
    reasoning: '추론 과정',
    toolCall: '도구 호출',
    regenerate: '재생성',
  },

  // 移动端专属
  mobile: {
    menu: '메뉴',
    back: '뒤로',
    home: '홈',
    profile: '프로필',
    // 설정页
    settings: {
      connectionStatus: '연결 상태',
      status: '상태',
      statusConnected: '연결됨',
      statusConnecting: '연결 중...',
      statusDisconnected: '연결 안 됨',
      directory: '디렉터리',
      encryption: '암호화',
      encryptionReady: '종단 간 암호화됨',
      encryptionExchanging: '키 교환 중...',
      encryptionError: '암호화 오류',
      encryptionNone: '암호화 안 됨',
      sessionId: 'Session ID',
      sessionManagement: '세션 관리',
      clearLocalData: '로컬 세션 데이터 지우기',
      clearDataConfirm: '로컬 세션 데이터를 정리하시겠습니까?',
      about: '정보',
      disconnect: '연결 해제',
    },
    // 세션 입력 페이지
    sessionInput: {
      title: '원격 세션 참여',
      subtitle: 'PC에 표시된 세션 ID를 입력하세요',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      inputLabel: '세션 ID 입력 필드',
      joinSession: '세션 참여',
      connecting: '연결 중...',
      reconnecting: '재연결 중...',
      cancel: '취소',
      errorRequired: '세션 ID를 입력하세요',
      errorInvalidFormat: '잘못된 세션 ID 형식, UUID 형식이어야 합니다 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
      formatHint: '세션 ID 형식: UUID (8-4-4-4-12)',
      qrHint: '또는 iOS 카메라로 QR 코드를 스캔하여 자동 참여',
    },
  },
} as const

export default koKR
