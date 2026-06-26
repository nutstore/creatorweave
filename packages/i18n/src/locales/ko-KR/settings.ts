// 설정 대화상자
export const settings = {
    title: "설정",
    llmProvider: "LLM 공급자",
    apiKey: "API Key",
    apiKeyPlaceholder: "API Key를 입력하세요...",
    showApiKey: "API Key 표시",
    hideApiKey: "API Key 숨기기",
    save: "저장",
    saved: "저장됨",
    apiKeyNote: "키는 AES-256 암호화되어 로컬 브라우저에 저장됩니다",
    modelName: "모델 이름",
    temperature: "Temperature",
    maxTokens: "최대 출력 토큰 수",

    // Tabs
    general: "일반",
    mcp: "MCP 서비스",
    webMCP: "Web MCP",
    sync: "크로스 디바이스 동기화",
    offline: "오프라인 작업",
    experimental: "실험적 기능",

    // General tab
    generalDescription: "언어, 테마 등 기본 설정",
    webMCPDescription: "현재 브라우저 창 탭의 WebMCP 도구를 검색하고 호스트 및 그룹 단위 활성화를 제어합니다.",
    webMCPSetupTitle: "브라우저 설정",
    webMCPMinChrome: "최소 지원 Chrome 버전: {version}+",
    webMCPDetectedBrowser: "감지된 브라우저: {browser} {version}",
    webMCPUnsupportedBrowser: "WebMCP 프리뷰는 현재 Chrome 브라우저만 지원합니다.",
    webMCPVersionTooLow: "현재 Chrome 버전이 최소 요구사항보다 낮습니다.",
    webMCPOpenFlags: "chrome://flags 열기",
    webMCPCopyFlags: "flags 링크 복사",
    webMCPCopyFlagsFailed: "flags 링크 복사 실패",
    webMCPCopied: "복사됨",
    webMCPReadDocs: "WebMCP 문서 열기",
    webMCPFlagsOpenFallback: "직접 열기가 막히면 복사한 링크를 주소창에 붙여넣어 주세요.",
    webMCPGlobalToggle: "WebMCP 도구 활성화",
    webMCPGlobalToggleDesc: "WebMCP 검색 및 도구 등록을 제어하는 전역 스위치입니다.",
    webMCPDisabled: "WebMCP가 비활성화되었습니다. 먼저 전역 스위치를 켜주세요.",
    webMCPHostControlsDisabled: "전역 WebMCP가 꺼져 있는 동안 호스트 단위 스위치는 사용할 수 없습니다.",
    webMCPConnected: "WebMCP 브리지 연결됨",
    webMCPDisconnected: "WebMCP 브리지를 사용할 수 없음",
    webMCPRefresh: "새로고침",
    webMCPRefreshSuccess: "WebMCP 도구 동기화 완료: {count}",
    webMCPRefreshFailed: "WebMCP 도구 새로고침 실패",
    webMCPBridgeUnavailable: "WebMCP 브리지를 사용할 수 없습니다. 브라우저 확장 프로그램을 설치하거나 새로고침하세요.",
    webMCPNeverScanned: "스캔 기록 없음",
    webMCPLastScan: "마지막 스캔: {time}",
    webMCPNoHosts: "현재 창 탭에서 WebMCP 도구를 찾지 못했습니다.",
    webMCPHostSummary: "{groups}개 그룹 · {tools}개 도구 · {tabs}개 탭",
    webMCPGroupSummary: "{tools}개 도구 · {tabs}개 탭",
    webMCPTabPreview: "탭: {tabs}",
    webMCPToggleFailed: "호스트 스위치 적용 실패",
    webMCPExtensionRequired: "브라우저 확장 프로그램 필요",
    webMCPExtensionRequiredHint: "WebMCP를 사용하려면 CreatorWeave 브라우저 확장 프로그램을 설치하고 활성화해야 합니다. 설정의 '확장 프로그램' 탭에서 설치하세요.",
    language: "언어",
    languageDescription: "인터페이스 표시 언어 선택",
    theme: "테마",
    themeDescription: "라이트/다크/시스템 테마 전환",
    themeLight: "라이트",
    themeDark: "다크",
    themeSystem: "시스템",
    docs: "문서",
    docsDescription: "사용 문서 및 도움말 보기",

    // Experimental features
    experimentalWarning: "이 기능들은 실험 단계입니다",
    experimentalWarningDesc: "활성화하면 안정성 문제가 발생할 수 있습니다. 일부 기능은 제공업체의 동시 처리 능력에 따라 달라집니다.",
    batchSpawn: "병렬 서브에이전트 (batch_spawn)",
    batchSpawnDesc: "AI가 여러 하위 작업을 병렬로 시작할 수 있도록 허용합니다. 높은 동시성을 지원하는 제공업체가 필요하며, 그렇지 않으면 속도 제한 오류가 발생할 수 있습니다.",
    scheduleToggle: "스케줄 (Schedules)",
    scheduleToggleDesc: "cron 식 기반 예약 작업을 활성화합니다. 켜면 상단 표시줄에 스케줄 버튼이 나타나고 에이전트는 manage_schedule 도구를 사용할 수 있습니다.",
    ttsToggle: "텍스트 음성 변환 (Edge TTS)",
    ttsToggleDesc: "Edge TTS 기반의 고품질 뉴럴 음성 합성을 활성화합니다. 브라우저 확장 프로그램이 필요합니다.",
    ttsVoice: "음성",
    ttsLoading: "음성 로드 중...",
    ttsAutoPlay: "자동 재생",
    ttsAutoPlayDesc: "AI 응답이 완료되면 자동으로 음성으로 읽어줍니다. 활성 작업 공간에서만 재생됩니다.",
    ttsNoVoices: "음성은 사용 가능해지면 자동으로 로드됩니다.",

    // Sync panel
    syncPanel: {
      upload: "업로드",
      downloadManage: "다운로드/관리",
      downloadSession: "이 세션 다운로드",
      currentDevice: "현재 디바이스",
      deviceId: "디바이스 ID",
      endToEndEncryption: "종단 간 암호화",
      encryptionNotice:
        "세션 데이터는 업로드 전에 암호화됩니다. 서버는 암호화된 데이터만 저장하며 원본 콘텐츠에 액세스할 수 없습니다.",
      preparingData: "데이터 준비 중...",
      uploadingToCloud: "클라우드에 업로드 중...",
      syncCurrentSession: "현재 세션 동기화",
      syncedSessions: "동기화된 세션",
      noSyncedSessions: "동기화된 세션 없음",
      manageAfterUpload: "세션을 업로드하면 여기서 관리할 수 있습니다",
      viewAll: "모두 보기",
      refresh: "새로고침",
      expiresAt: "만료 시간",
      deleteSession: "이 세션 삭제",
      server: "서버",
      status: "상태",

      // Time formatting
      minutesAgo: "{count}분 전",
      hoursAgo: "{count}시간 전",
      daysAgo: "{count}일 전",

      // Error messages
      encryptionFailed: "암호화 실패",
      decryptionFailed: "복호화 실패, 데이터가 손상되었을 수 있습니다",
      noSessionToSync: "동기화할 세션 데이터 없음",
      downloadFailed: "다운로드 실패",
      sessionParseFailed: "세션 데이터 분석 실패",
      uploadFailed: "업로드 실패, 다시 시도하세요",
      deleteFailed: "삭제 실패, 다시 시도하세요",
      sessionRestored: "세션이 복원되었습니다, 새로고침하여 확인하세요",
      sessionDeleted: "세션이 삭제되었습니다",
      sessionSynced: "세션이 동기화되었습니다! Sync ID: {syncId}",
      sessionDownloadSuccess: "세션이 다운로드되었습니다!",
      confirmDelete:
        "이 동기화 세션을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.",
      crossDeviceSync: "기기 간 동기화",
      syncDescription:
        "현재 세션을 클라우드에 동기화하거나 클라우드에서 세션을 다운로드합니다. 종단 간 암호화를 지원하며 암호화된 데이터만 저장됩니다.",
      loading: "로딩 중...",
      close: "닫기",

      // Conflict Resolution Dialog
      conflictResolution: {
        title: "파일 충돌",
        conflictDescription: "{path} 동기화 중 충돌 발생",
        opfsVersionTime: "OPFS 버전 시간:",
        nativeVersionTime: "로컬 버전 시간:",
        selectResolution: "해결 방법 선택",
        keepOpfsVersion: "OPFS 버전 유지",
        keepOpfsDescriptionModified: "Python 실행 후 수정된 버전",
        keepOpfsDescriptionNew: "새로 생성된 파일 유지",
        keepNativeVersion: "로컬 버전 유지",
        keepNativeDescription: "파일 시스템의 원본 버전 유지, OPFS 변경 취소",
        skipThisFile: "이 파일 건너뛰기",
        skipThisFileDescription: "이 파일 동기화 안 함, 현재 상태 유지",
        opfsVersion: "OPFS 버전",
        nativeVersion: "로컬 버전",
        noContent: "내용 없음",
        fileNotExist: "파일이 존재하지 않음",
        binaryFilePreview: "[{source} 버전은 이미지 또는 이진 파일입니다",
        noReadableContent:
          "[{source} 버전에 읽을 수 있는 텍스트 내용이 없습니다",
        emptyFile: "[{source} 버전은 빈 파일입니다",
        contentTruncated: "...[내용이 너무 길어서 {charCount}자 삭제됨]",
        whyConflict: "왜 충돌이 발생했나요?",
        conflictExplanation:
          "OPFS의 파일이 로컬 파일 시스템에서도 수정되었습니다. 시스템이 두 버전의 수정 시간이 다름을 감지했고, 어떤 버전을 유지할지 결정해야 합니다.",
        ifKeepNativeExists:
          '"로컬 버전 유지"를 선택하면 OPFS의 변경이 취소됩니다.',
        ifKeepNativeNotExists:
          '로컬 파일이 존재하지 않습니다. "로컬 버전 유지"를 선택하면 이 파일이 삭제됩니다.',
        skipThisConflict: "이 충돌 건너뛰기",
        applySelection: "선택 적용",
        nativeNotConnected:
          "[로컬 디렉터리가 연결되어 있지 않아 로컬 버전을 읽을 수 없습니다]",
      },

      // Sync Preview Panel (Empty State)
      syncPreview: {
        emptyStateTitle: "AI가 파일을 수정했습니다 — 확인 대기 중",
        emptyStateDescription:
          "Python 코드 실행 후 감지된 파일 시스템 변경 사항이 여기에 표시됩니다. 변경 세부 정보를 미리 보고 승인을 거부할 수 있습니다.",
        step1Title: "Python 코드 실행",
        step1Desc: "Agent 대화에서 Python 파일 작업 코드 실행",
        step2Title: "파일 변경 미리보기",
        step2Desc: "모든 수정, 추가 및 삭제된 파일 보기",
        step3Title: "검토 및 처리",
        step3Desc: "차이점을 확인한 후 변경 사항 승인 또는 거부",
        detectedFiles: "{count}개 파일 변경 감지됨",
        added: "추가됨",
        modified: "수정됨",
        deleted: "삭제됨",
        reviewChanges: "검토",
        reviewing: "검토 중...",
        backToList: "목록으로 돌아가기",
        aiSummaryFailed: "AI 생성에 실패했습니다. 수동으로 입력해 주세요",
        noActiveWorkspace: "먼저 프로젝트 디렉터리를 선택하세요",
        approvalFailed: "승인에 실패했습니다",
        keepNativeFailed: "네이티브 버전 유지에 실패했습니다",
        noFilesAfterConflict: "충돌 해결 후 동기화할 파일이 없습니다",
        reviewRequestSent: "검토 요청이 전송되었습니다",
        reviewRequestFailed: "검토 요청 전송에 실패했습니다",
        conflictHint: ", {count}개 충돌 있음",
        syncFailedCount: "{failed}개 파일 승인 적용 실패{conflicts}",
      },

      // File Change List
      fileChangeList: {
        noFileChanges: "파일 변경 없음",
        noChangesDescription:
          "Python 실행 후 파일 시스템 변경이 감지되지 않았습니다",
        added: "추가",
        modified: "수정",
        deleted: "삭제",
        fileChangesCount: "{count}개 파일 변경",
        totalCount: "총: {count}",
        size: "크기: {size}",
        time: "시간: {time}",
        viewChange: "{path} 변경 보기",
      },

    },

    // Pending Sync Panel
    pendingSyncPanel: {
      title: "확인 대기 중인 변경",
      noPendingChanges: "확인할 변경 사항이 없습니다",
      newChangesAppearHere: "AI 파일 변경이 자동으로 여기에 표시됩니다",
      pureOpfsMode: "로컬 디렉터리 미마운트",
      pureOpfsModeHint: "파일은 브라우저 OPFS에 직접 저장됩니다. 로컬 디렉터리를 마운트하면 승인 동기화 흐름이 활성화됩니다.",
      refreshTooltip: "목록 새로고침",
      viewDetailsTooltip: "세부 정보 보기",
      selectedCount: "{count}개 선택됨",
      selectAll: "모두 선택",
      removeFromList: "목록에서 제거",
      selectFile: "선택",
      reviewInProgress: "검토 중...",
      review: "검토",
      rejectAll: "모든 변경 거부",
      reject: "거부",
      rejectSelectedCount: "거부 ({count})",
      approveSelected: "선택 항목 승인",
      approvingInProgress: "승인 중...",
      syncComplete: "완료!",
      approveSelectedCount: "승인 ({count})",
      approveAll: "모두 승인",
      totalSize: "총: {size}",
      confirmRejectTitle: "거부 확인",
      confirmRejectMessage:
        "선택한 변경을 거부하시겠습니까? 이 작업은 취소할 수 없습니다.",
      cancel: "취소",
      confirmReject: "거부 확인",
      reviewSuccess: "로컬 파일에 저장되었습니다!",
      rejectedAllSuccess: "모든 변경이 삭제되었습니다",
      rejectedCountWithFailure:
        "{successCount}개 변경을 거부했고, {failedCount}개는 로컬 파일 베이스라인이 없어서 목록에 유지됩니다",
      rejectChangeFailed: "변경 거부 실패, 나중에 다시 시도하세요",
      syncFailed: "저장 실패, 다시 시도하세요",
      keepNativeVersionFailed: "로컬 버전 유지 실패",
      noFilesToSyncAfterConflict: "충돌 처리 후 동기화할 파일이 없습니다",
      reviewRequestSent: "검토 요청이 전송되었습니다",
      sendReviewRequestFailed: "검토 요청 전송 실패",
      aiSummaryFailed: "AI 생성 실패, 수동으로 입력하세요",
      createSnapshot: "저장 기록 만들기",
      onlySyncWithLocalDir: "로컬 디렉터리가 선택된 경우에만 디스크에 저장",
      syncSuccessMarkSnapshot: "저장 성공 후 기록을 동기화됨으로 표시",
      syncFailedCount: "{failed}개 파일 승인 적용 실패{conflicts}",
      conflictCount: ", {count}개 충돌 있음",
      detectConflict: "충돌 감지",
      conflictDetectFailed: "충돌 감지 실패, 승인을 계속합니다",
      noConflictShowDialog: "충돌 없음, 승인 대화상자 표시",
      pendingChanges: "확인 대기 중인 변경",
      skipConflict: "이 충돌 건너뛰기",
      currentDraft: "현재 드래프트",
      snapshotLabel: "저장 기록 {id}",
      saved: "저장됨",
      approved: "저장됨",
      rolledBack: "롤백됨",
      reviewElements: "요소 검토",
      copyPath: "파일 경로 복사",
      copyContent: "파일 내용 복사",
      copyContentFailed: "파일 내용 복사 실패",
      processing: "처리 중...",
      draft: "드래프트",
      // Error messages for review-request.ts
      noActiveWorkspace: "활성 작업 공간이 없습니다",
      noChangesToReview: "검토할 변경 사항이 없습니다",
      pleaseConfigureApiKey: "먼저 API Key를 구성하세요",
      conversationRunningPleaseWait:
        "현재 대화가 실행 중입니다. 나중에 다시 시도하세요",
      reviewConversationTitle: "변경 확인",
    },

    // 모델 설정 - 카테고리 라벨
    categories: {
      international: "국제 서비스",
      chinese: "중국 서비스",
      custom: "커스텀",
    },

    // 모델 기능
    capabilities: {
      code: "코드",
      writing: "글쓰기",
      reasoning: "추론",
      vision: "시각",
      fast: "빠름",
      "long-context": "긴 컨텍스트",
    },

    // Token 통계
    tokenStats: {
      title: "사용 통계",
      noUsage: "아직 사용 통계가 없습니다",
      totalTokens: "총 Tokens",
      requestCount: "요청 횟수",
      inputTokens: "입력 Tokens",
      outputTokens: "출력 Tokens",
    },

    // Toast 메시지
    toast: {
      apiKeyCleared: "API Key가 삭제되었습니다",
      providerNameRequired: "서비스 이름과 Base URL을 입력하세요",
      customProviderAdded: "커스텀 서비스가 추가되었습니다",
      invalidProviderInfo: "유효한 서비스 정보를 입력하세요",
      customProviderUpdated: "커스텀 서비스가 업데이트되었습니다",
      selectProviderFirst: "먼저 서비스를 생성하고 선택하세요",
      modelNameRequired: "모델 이름은 비워둘 수 없습니다",
      modelAdded: "모델이 추가되었습니다",
      apiKeyRequired: "먼저 API Key를 저장하세요",
      modelsRefreshed: "API에서 모델 목록을 새로고침했습니다",
    },

    // 모델 관리
    modelManagement: {
      title: "커스텀 서비스",
      myProviders: "내 서비스",
      selectProvider: "서비스 선택",
      noCustomProviders: "아직 커스텀 서비스가 추가되지 않았습니다",
      emptyHint: "\"서비스 추가\"를 클릭하여 OpenAI 호환 API에 연결",
      providerName: "서비스 이름",
      providerNamePlaceholder: "예: Ollama 로컬, 내 릴레이",
      defaultModel: "기본 모델",
      defaultModelPlaceholder: "예: gpt-4o, deepseek-chat",
      save: "저장",
      add: "서비스 추가",
      cancel: "취소",
      create: "만들기",
      newProvider: "새 서비스",
      editProvider: "서비스 편집",
      deleteProvider: "서비스 삭제",
      confirmDeleteTitle: "서비스 삭제",
      confirmDeleteMessage: "\"{name}\"을(를) 삭제하시겠습니까? 관련 API Key도 함께 삭제됩니다. 이 작업은 취소할 수 없습니다.",
      confirmDelete: "삭제 확인",
      modelList: "모델 목록",
      newModelName: "모델 이름 입력",
      addModel: "모델 추가",
      addModelShort: "추가",
      removeModel: "모델 {name} 제거",
    },

    // 모델 선택
    modelSelection: {
      useCustomModelName: "수동 입력",
      customModelHint:
        "활성화하면 모든 모델 이름을 입력할 수 있으며, 새로 출시된 모델에 적합합니다",
      refreshModels: "API에서 모델 목록 새로고침",
    },

    // 커스텀 Base URL
    customBaseUrl: {
      label: "API Base URL",
      placeholder: "https://api.example.com/v1",
      hint: "OpenAI 호환 API 엔드포인트를 지원합니다",
    },

    // API Mode
    apiMode: {
      label: "API 모드",
      hint: "API 엔드포인트 형식을 선택하세요. Chat Completions은 /chat/completions, Responses API는 /responses (OpenAI 최신 API)",
    },

    // 고급 매개변수
    advancedParameters: "고급 매개변수",
    temperatureOptions: {
      precise: "정확",
      creative: "창의적",
    },
    maxIterations: "최대 반복 횟수",
    maxIterationsHint: "단일 Agent Loop의 최대 assistant 턴 수를 제한합니다",
    maxIterationsUnlimited: "무제한",
    maxIterationsUnlimitedHint:
      "단일 Agent Loop에서 assistant 턴 수를 무제한으로 허용합니다",

    // 사고 모드
    thinkingMode: "사고 모드",
    thinkingLevels: {
      minimal: "얕음",
      low: "낮음",
      medium: "중간",
      high: "깊음",
      xhigh: "매우 깊음",
    },
    thinkingModeFast: "빠름",
    thinkingModeDeep: "깊이",

    // 외부 링크
    getApiKey: "API Key 받기",
    notConfigured: "설정되지 않음",

    // 기본 모델 선택
    defaultModel: {
      title: "기본 모델",
      description: "대화에 사용할 프로바이더와 모델을 선택하세요",
      selectModel: "모델 선택",
      noProviders: "먼저 프로바이더 API Key를 설정해주세요",
      manualInput: "수동 입력",
      manualPlaceholder: "모델 이름 입력, 예: gpt-4o",
    },

    // 프로바이더 관리
    providerManager: {
      title: "프로바이더 관리",
      defaultModels: "(기본)",
    },

    // 자주 사용하는 모델 (사용자 선택)
    pinnedModels: {
      title: "내 모델",
      count: "{count}개 선택됨",
      empty: "아직 추가된 모델이 없습니다. 아래 버튼을 클릭하여 추가하세요",
      addFromApi: "모델 라이브러리에서 추가",
      addManual: "수동 입력",
      dialogTitle: "모델 추가",
      searchPlaceholder: "모델 검색...",
      noApiModels: "사용 가능한 모델이 없습니다. 새로고침 버튼으로 모델 목록을 먼저 가져오세요",
      noMatch: "일치하는 모델이 없습니다",
      dialogHint: "{count}개의 모델을 선택할 수 있습니다. 클릭하여 추가",
    },

    imageGen: {
      aspectRatio: "가로세로 비율",
      arHint: "--ar 16:9로 임시 지정 가능",
      searchModel: "모델 검색...",
      noModelFound: "일치하는 모델이 없습니다",
    },
} as const
