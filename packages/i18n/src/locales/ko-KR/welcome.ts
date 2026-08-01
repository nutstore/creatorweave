// 환영 페이지
export const welcome = {
    title: "CreatorWeave",
    tagline:
      "지식베이스와 멀티 에이전트 오케스트레이션을 위한 AI 네이티브 Creator Workspace",
    placeholder: "메시지를 입력하여 대화를 시작하세요...",
    placeholderNoKey: "먼저 설정에서 API Key를 구성해주세요",
    send: "전송",
    openLocalFolder: "로컬 폴더 열기",
    recentHint:
      "왼쪽에서 기존 대화를 선택하거나, 메시지를 입력하여 새 대화를 시작하세요",
    viewCapabilities: "기능 보기",
    // Drag and drop overlay
    dropFilesHere: "파일을 여기에 놓으세요",
    supportsFileTypes: "CSV, Excel, PDF, 이미지 등을 지원합니다",
    apiKeyRequiredHint:
      "먼저 모델 설정에서 API Key를 구성한 후 대화를 시작하세요",
    filesReady: "{count}개 파일 준비됨",
    // Shown while the async API-key check is in flight (avoids flashing the
    // "no API key" setup card before SQLite has been consulted).
    checkingConfig: "AI 설정 확인 중...",
    // Setup card (shown when no API key configured)
    setupCardTitle: "시작하기 전에 AI 연결 방법을 선택하세요",
    setupGatewayTitle: "견과클라우드 계정으로 로그인",
    setupGatewayDesc: "견과클라우드 계정이 있나요? 원클릭 로그인, API Key 불필요",
    setupGatewayRecommend: "추천",
    setupApiKeyTitle: "자체 API Key 구성",
    setupApiKeyDesc: "OpenAI, OpenRouter, Anthropic 등 지원",
    setupLocalFirstHint: "모든 데이터는 브라우저에 로컬 저장되며 서버에 업로드되지 않습니다",
    // 3-step onboarding
    step1Of3: "단계 1 / 3",
    step2Of3: "단계 2 / 3",
    step3Of3: "단계 3 / 3",
    welcomeHeading: "CreatorWeave 에 오신 것을 환영합니다",
    welcomeSubtitle: "로컬 AI 워크스페이스, 파일과 코드는 브라우저 안에",
    continueButton: "계속",
    skipButton: "나중에 하기",
    mountFolderTitle: "로컬 폴더 마운트",
    mountFolderDesc: "AI가 파일을 직접 읽고 쓸 수 있습니다. 파일은 브라우저를 벗어나지 않습니다.",
    mountFolderButton: "폴더 선택",
    mountFolderBack: "뒤로",
    mountFolderMounted: "마운트된 폴더",
    quickStartTitle: "이것들을 시도해 보세요:",
    quickStartEmail: "이메일 작성 도와줘",
    quickStartSummary: "내 노트 요약해줘",
    quickStartCode: "my-project 의 코드 설명해줘",
    personas: {
      developer: {
        title: "개발자",
        description: "코드 이해, 디버깅, 리팩터링",
        examples: {
          0: "이 함수가 어떻게 작동하는지 설명해줘",
          1: "이 코드에서 버그를 찾아줘",
          2: "성능 향상을 위해 리팩터링해줘",
        },
      },
      analyst: {
        title: "데이터 분석가",
        description: "데이터 처리, 시각화, 인사이트",
        examples: {
          0: "CSV 판매 데이터를 분석해줘",
          1: "Excel에서 차트를 만들어줘",
          2: "주요 지표를 요약해줘",
        },
      },
      researcher: {
        title: "학생 / 연구원",
        description: "문서 읽기, 학습, 지식 정리",
        examples: {
          0: "이 문서를 요약해줘",
          1: "기술 개념을 설명해줘",
          2: "파일 간에 정보를 찾아줘",
        },
      },
      office: {
        title: "사무직",
        description: "문서 처리, 보고서, 콘텐츠 제작",
        examples: {
          0: "데이터로부터 보고서 초안을 작성해줘",
          1: "문서를 정리하고 포맷팅해줘",
          2: "여러 파일을 처리해줘",
        },
      },
    },
    gateway: {
        title: "견과클라우드 AI 로그인",
        close: "닫기",
        requesting: "인증 세션 생성 중...",
        enterCode: "인증 페이지에서 다음 코드를 입력하세요",
        authCodeLabel: "인증 코드",
        copy: "복사",
        openAuthPage: "인증 페이지 열기",
        waiting: "인증 대기 중...",
        success: "로그인 성공!",
        clientIdMissing:
            "Client ID가 설정되지 않았습니다. VITE_JIANGUOYUN_AI_CLIENT_ID 환경 변수를 설정하세요.",
        authFailedFallback: "인증 실패",
    },
    quickActionPrompt: "무엇을 도와드릴까요?",
    commandPaletteHint: "명령 팔레트 열기",
} as const
