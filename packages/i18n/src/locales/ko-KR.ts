export const koKR = {
  // 공통
  common: {
    save: "저장",
    cancel: "취소",
    confirm: "확인",
    delete: "삭제",
    close: "닫기",
    search: "검색",
    refresh: "새로고침",
    loading: "로딩 중...",
    processing: "처리 중...",
    error: "오류",
    success: "성공",
    copy: "복사",
    copied: "복사됨",
  },

  // 앱 초기화
  app: {
    initializing: "초기화 중...",
    preparing: "준비 중...",
    loadProgress: "로딩 진행률",
    firstLoadHint: "첫 로딩은 몇 초 정도 걸릴 수 있습니다",
    productName: "CreatorWeave",
    initComplete: "초기화 완료",
    initFailed: "초기화 실패",
    sessionStorageOnly:
      "데이터는 현재 세션에만 저장되며, 새로고침 시 사라집니다",
    localStorageMode: "로컬 스토리지 모드 사용 중",
    migrationInProgress: "데이터 마이그레이션 중",
    migrationComplete: "마이그레이션 완료",
    conversationsMigrated: "{count}개 대화",
    // App toast messages
    resetDatabaseFailed:
      "데이터베이스 재설정에 실패했습니다. 페이지를 수동으로 새로고침해 주세요",
    localDataCleared:
      "로컬 데이터가 삭제되었습니다. 처음부터 다시 시작할 수 있습니다",
    clearFailedCloseOtherTabs:
      "삭제에 실패했습니다. 먼저 이 앱의 다른 탭/창을 닫은 후 다시 시도해 주세요",
    clearLocalDataFailed: "로컬 데이터 삭제에 실패했습니다",
    storageInitError: "스토리지 초기화 오류",
    projectNotFound: "프로젝트를 찾을 수 없거나 삭제되었습니다",
    switchProjectFailed:
      "프로젝트 전환에 실패했습니다. 나중에 다시 시도해 주세요",
    noWorkspaceInProject: "현재 프로젝트에 작업 공간이 없습니다",
    projectCreated: '프로젝트 "{name}"이(가) 생성되었습니다',
    projectCreatedButSwitchFailed:
      "프로젝트가 생성되었지만 전환에 실패했습니다. 수동으로 다시 시도해 주세요",
    createProjectFailed:
      "프로젝트 생성에 실패했습니다. 나중에 다시 시도해 주세요",
    projectRenamed: "프로젝트 이름이 변경되었습니다",
    renameFailed: "이름 변경에 실패했습니다. 나중에 다시 시도해 주세요",
    projectArchived: "프로젝트가 보관됨으로 설정되었습니다",
    projectUnarchived: "프로젝트 보관이 취소되었습니다",
    archiveFailed: "보관 설정에 실패했습니다. 나중에 다시 시도해 주세요",
    unarchiveFailed: "보관 취소에 실패했습니다. 나중에 다시 시도해 주세요",
    projectDeleted: "프로젝트가 삭제되었습니다",
    deleteFailed: "삭제에 실패했습니다. 나중에 다시 시도해 주세요",
    // Database refresh dialog
    databaseConnectionLost: "데이터베이스 연결이 끊어졌습니다",
    whatHappened: "무슨 일이 발생했나요?",
    databaseHandleInvalidExplanation:
      "브라우저 탭이 최대 절전 모드 후 데이터베이스 파일 핸들이 무효가 됩니다. 이는 정상적인 브라우저 동작입니다.",
    ifJustClearedData:
      '"데이터 삭제"를 방금 실행한 경우 먼저 동일한 출처의 다른 탭/창을 닫은 다음 현재 페이지를 새로고침해 주세요.',
    yourDataIsSafe: "대화 데이터는 안전합니다!",
    dataStoredInOPFS:
      "데이터는 브라우저 OPFS에 저장되어 있으며 일시적으로 액세스할 수 없을 뿐입니다.",
    willAutoRecoverAfterRefresh:
      "페이지를 새로고침하면 데이터베이스 연결이 자동으로 복원됩니다.",
    refreshPage: "페이지 새로고침",
    cannotCloseDialog:
      "이 대화상자는 닫을 수 없습니다 - 위 버튼을 클릭하여 페이지를 새로고침해 주세요",
    databaseInitFailed: "데이터베이스 초기화 실패",
    databaseResetExplanation:
      "이는 데이터베이스 손상 또는 마이그레이션 실패로 인해 발생할 수 있습니다. 데이터베이스를 재설정하면 모든 데이터가 지워지고 다시 생성됩니다.",
    resetDatabase: "데이터베이스 재설정",
    reloadPage: "페이지 새로고침",
  },

  // 상단 바
  topbar: {
    productName: "CreatorWeave",
    openFolder: "폴더 열기",
    switchFolder: "프로젝트 폴더 전환",
    noApiKey: "API Key가 설정되지 않음",
    settings: "설정",
    skillsManagement: "스킬 관리",
    projectLabel: "프로젝트: {name}",
    workspaceLabel: "워크스페이스: {name}",
    tooltips: {
      backToProjects: "프로젝트 목록으로 돌아가기",
      menu: "메뉴",
      openApiKeySettings: "API Key 설정 열기",
      workspaceSettings: "워크스페이스 레이아웃 및 환경설정",
      toolsPanel: "도구 패널",
      commandPalette: "명령 팔레트 (Cmd/Ctrl+K)",
      skillsManager: "스킬 관리",
      mcpSettings: "MCP 서비스 설정",
      appSettings: "앱 설정",
      docs: "문서",
      more: "더보기",
      webContainer: "WebContainer",
    },
    mobile: {
      workDirectory: "작업 디렉토리",
      workspaceSettings: "워크스페이스 설정",
      skills: "스킬",
      commandPalette: "명령 팔레트",
      mcpSettings: "MCP 설정",
      docs: "문서",
      connection: "연결",
      storage: "스토리지",
      language: "언어",
      theme: "테마",
    },
  },

  // 폴더 선택
  folderSelector: {
    openFolder: "폴더 선택",
    switchFolder: "폴더 전환",
    releaseHandle: "핸들 해제",
    copyPath: "폴더 이름 복사",
    permissionDenied: "권한 거부됨",
    selectionFailed: "선택 실패",
    sandboxMode: "샌드박스 모드 (OPFS)",
    restorePermission: "권한 복원",
    needsPermissionRestore: "권한 복원 필요",
    loading: "로딩 중...",
    unknown: "알 수 없음",
    storageWarning: "캐시",
    storageTooltip:
      "영구 저장소가 허용되지 않았습니다. 클릭하여 재시도. 새로고침 시 캐시가 삭제될 수 있습니다.",
    storageSuccess: "저장소가 영구화되었습니다",
    storageFailed: "영구 저장소를 가져올 수 없습니다",
    storageRequestFailed: "요청 실패",
  },

  // 설정 대화상자
  settings: {
    title: "설정",
    llmProvider: "LLM 공급자",
    apiKey: "API Key",
    apiKeyPlaceholder: "API Key를 입력하세요...",
    save: "저장",
    saved: "저장됨",
    apiKeyNote: "키는 AES-256 암호화되어 로컬 브라우저에 저장됩니다",
    modelName: "모델 이름",
    temperature: "Temperature",
    maxTokens: "최대 출력 토큰 수",

    // Sync tabs
    sync: "크로스 디바이스 동기화",
    offline: "오프라인 작업",
    experimental: "실험적 기능",

    // Experimental features
    experimentalWarning: "이 기능들은 실험 단계입니다",
    experimentalWarningDesc: "활성화하면 안정성 문제가 발생할 수 있습니다. 일부 기능은 제공업체의 동시 처리 능력에 따라 달라집니다.",
    batchSpawn: "병렬 서브에이전트 (batch_spawn)",
    batchSpawnDesc: "AI가 여러 하위 작업을 병렬로 시작할 수 있도록 허용합니다. 높은 동시성을 지원하는 제공업체가 필요하며, 그렇지 않으면 속도 제한 오류가 발생할 수 있습니다.",

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
        emptyStateTitle: "변경 검토 대기 중",
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
      title: "변경된 파일",
      noPendingChanges: "현재 검토할 변경 사항이 없습니다",
      newChangesAppearHere: "새 변경 사항은 여기에 자동으로 표시됩니다",
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
      approveSelected: "선택 항목 승인",
      approvingInProgress: "승인 중...",
      syncComplete: "완료!",
      approveSelectedCount: "승인 ({count})",
      approveAll: "모두 승인",
      totalSize: "총: {size}",
      confirmRejectTitle: "거부 확인",
      confirmRejectMessage:
        "모든 변경을 거부하시겠습니까? 이 작업은 취소할 수 없습니다.",
      cancel: "취소",
      confirmReject: "거부 확인",
      reviewSuccess: "검토 성공!",
      rejectedAllSuccess: "모든 변경이 거부되었습니다",
      rejectedCountWithFailure:
        "{successCount}개 변경을 거부했고, {failedCount}개는 로컬 파일 베이스라인이 없어서 목록에 유지됩니다",
      rejectChangeFailed: "변경 거부 실패, 나중에 다시 시도하세요",
      syncFailed: "승인 실패, 나중에 다시 시도하세요",
      keepNativeVersionFailed: "로컬 버전 유지 실패",
      noFilesToSyncAfterConflict: "충돌 처리 후 동기화할 파일이 없습니다",
      reviewRequestSent: "검토 요청이 전송되었습니다",
      sendReviewRequestFailed: "검토 요청 전송 실패",
      aiSummaryFailed: "AI 생성 실패, 수동으로 입력하세요",
      createSnapshot: "승인 스냅샷 만들기",
      onlySyncWithLocalDir: "로컬 디렉터리가 있을 때만 디스크로 동기화",
      syncSuccessMarkSnapshot: "동기화成功后 스냅샷을 동기화됨으로 표시",
      syncFailedCount: "{failed}개 파일 승인 적용 실패{conflicts}",
      conflictCount: ", {count}개 충돌 있음",
      detectConflict: "충돌 감지",
      conflictDetectFailed: "충돌 감지 실패, 승인을 계속합니다",
      noConflictShowDialog: "충돌 없음, 승인 대화상자 표시",
      pendingChanges: "보류 중인 변경",
      skipConflict: "이 충돌 건너뛰기",
      currentDraft: "현재 드래프트",
      snapshotLabel: "스냅샷 {id}",
      saved: "저장됨",
      approved: "승인됨",
      rolledBack: "롤백됨",
      reviewElements: "요소 검토",
      copyPath: "경로 복사",
      processing: "처리 중...",
      draft: "드래프트",
      // Error messages for review-request.ts
      noActiveWorkspace: "활성 작업 공간이 없습니다",
      noChangesToReview: "검토할 변경 사항이 없습니다",
      pleaseConfigureApiKey: "먼저 API Key를 구성하세요",
      conversationRunningPleaseWait:
        "현재 대화가 실행 중입니다. 나중에 다시 시도하세요",
      reviewConversationTitle: "변경 검토",
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
      providerNameRequired: "서비스 이름, Base URL, 모델 이름을 입력하세요",
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
      selectProvider: "서비스 선택",
      noCustomProviders: "아직 커스텀 서비스가 추가되지 않았습니다",
      providerName: "서비스 이름",
      defaultModel: "기본 모델, 예: gpt-4o-mini",
      save: "저장",
      add: "추가",
      deleteProvider: "서비스 삭제",
      modelList: "모델 목록",
      newModelName: "새 모델 이름",
      addModel: "모델 추가",
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
  },

  workspaceSettings: {
    title: "워크스페이스 설정",
    close: "닫기",
    done: "완료",
    tabs: {
      layout: "레이아웃",
      display: "표시",
      shortcuts: "단축키",
      data: "데이터",
      ariaLabel: "설정 옵션",
    },
    layout: {
      title: "레이아웃 설정",
      description: "워크스페이스 패널 크기와 비율을 조정합니다",
      sidebarWidth: "사이드바 너비: {value}px",
      conversationArea: "대화 영역: {value}%",
      previewPanel: "미리보기 패널: {value}%",
      resetLayout: "레이아웃 초기화",
      resetLayoutConfirm: "레이아웃 설정을 초기화하시겠습니까?",
    },
    display: {
      themeTitle: "테마 설정",
      themeDescription: "선호하는 인터페이스 테마를 선택하세요",
      theme: {
        light: "라이트",
        dark: "다크",
        system: "시스템",
      },
      editorTitle: "에디터 표시",
      editorDescription: "에디터 모양과 동작을 설정합니다",
      fontSize: "글자 크기",
      font: {
        small: "작게",
        medium: "보통",
        large: "크게",
      },
      showLineNumbers: "줄 번호 표시",
      wordWrap: "자동 줄바꿈",
      showMiniMap: "미니맵 표시",
    },
    shortcuts: {
      title: "단축키",
      description: "키보드 단축키를 관리하고 확인합니다",
      showAllTitle: "모든 단축키 보기",
      showAllDescription: "단축키 도움말 패널 열기",
      view: "보기",
      tipLabel: "팁:",
      tipCommand: "/key",
      tipSuffix: "로 단축키 목록을 빠르게 열 수 있습니다.",
    },
    data: {
      title: "데이터 관리",
      description: "최근 파일과 워크스페이스 설정을 관리합니다",
      recentFilesTitle: "최근 파일",
      recentFilesCount: "총 {count}개 파일",
      clear: "지우기",
      clearRecentConfirm: "최근 파일 기록을 지우시겠습니까?",
      warningTitle: "주의:",
      warningDescription: "아래 작업은 현재 워크스페이스 설정에 영향을 줍니다.",
      resetAllTitle: "모든 설정 초기화",
      resetAllDescription:
        "레이아웃, 표시, 에디터 설정을 기본값으로 되돌립니다.",
      resetAll: "모두 초기화",
      resetAllConfirm: "워크스페이스 설정을 모두 초기화하시겠습니까?",
    },
  },

  // 환영 페이지
  welcome: {
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
  },

  // 스킬 관리
  skills: {
    title: "스킬 관리",
    searchPlaceholder: "스킬 이름, 설명, 태그 검색...",
    filterAll: "전체",
    filterEnabled: "활성화됨",
    filterDisabled: "비활성화됨",
    projectSkills: "프로젝트 스킬",
    mySkills: "내 스킬",
    builtinSkills: "내장 스킬",
    enabledCount: "{count} / {total} 활성화됨",
    createNew: "새 스킬",
    deleteConfirm: "이 스킬을 삭제하시겠습니까?",
    deleteTitle: "스킬 삭제",
    deleteConfirmMessage: "\"{name}\"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
    noResults: "검색 조건과 일치하는 스킬이 없습니다",
    edit: "편집",
    delete: "삭제",
    enabled: "활성화됨",
    disabled: "비활성화됨",
    empty: "스킬 없음",
    categories: {
      codeReview: "코드 리뷰",
      testing: "테스트",
      debugging: "디버깅",
      refactoring: "리팩터링",
      documentation: "문서화",
      security: "보안",
      performance: "성능",
      architecture: "아키텍처",
      general: "일반",
    },
    projectDialog: {
      title: "프로젝트 스킬 발견",
      description:
        "프로젝트에서 {count}개의 스킬을 발견했습니다. 워크스페이스에 로드하시겠습니까?",
      selectAll: "모두 선택",
      deselectAll: "선택 해제",
      selected: "선택됨",
      load: "로드",
      loadAll: "모두 로드",
      skip: "건너뛰기",
    },
  },

  skillCard: {
    enabled: "활성화됨",
    disabled: "비활성화됨",
    project: "프로젝트",
    viewDetails: "세부정보 보기",
    edit: "편집",
    delete: "삭제",
    category: {
      codeReview: "코드 리뷰",
      testing: "테스트",
      debugging: "디버깅",
      refactoring: "리팩터링",
      documentation: "문서화",
      security: "보안",
      performance: "성능",
      architecture: "아키텍처",
      general: "일반",
    },
  },

  skillEditor: {
    editSkill: "스킬 편집",
    createSkill: "새 스킬 만들기",
    editDescription: "기존 스킬 설정 및 내용 수정",
    createDescription: "AI 역량을 확장하는 사용자 정의 스킬 만들기",
    preview: "미리보기",
    edit: "편집",
    editMode: "편집 모드",
    createMode: "만들기 모드",
    cancel: "취소",
    close: "닫기",
    saving: "저장 중...",
    save: "저장",
    basicInfo: "기본 정보",
    skillName: "스킬 이름",
    category: "카테고리",
    selectCategory: "카테고리 선택",
    skillNamePlaceholder: "예: code-reviewer",
    description: "설명",
    descriptionPlaceholder: "이 스킬의 기능을简要히 설명",
    tagsPlaceholder: "review, quality",
    triggerKeywords: "트리거 키워드",
    triggerKeywordsPlaceholder: "리뷰, 확인",
    triggerKeywordsHelp: "쉼표로 구분, 매치 시 자동 활성화",
    fileExtensions: "파일 확장자",
    fileExtensionsHelp: "선택 사항, 특정 파일 타입용으로 활성화",
    skillContent: "스킬 내용",
    instruction: "지시",
    instructionPlaceholder:
      "당신은 코드 리뷰 전문가입니다. 사용자가 코드 리뷰를 요청할 때：\n1. 타입 안전성 분석\n2. 성능 문제 확인\n3. 가독성 평가",
    exampleDialog: "예제 대화",
    exampleDialogPlaceholder:
      '사용자: "이 컴포넌트 리뷰帮我"\nAI: "확인하겠습니다..."',
    exampleDialogHelp: "선택 사항, AI 이해를 돕는 예제 제공",
    outputTemplate: "출력 템플릿",
    outputTemplatePlaceholder:
      "## 리뷰 보고서\n- 파일：{{filename}}\n- 문제：{{issues}}",
    outputTemplateHelp: "선택 사항, 표준 출력 형식 정의",
    uncategorized: "미분류",
    readOnly: "읽기 전용",
    lines: "줄",
    characters: "문자",
    skillMdPreview: "SKILL.md 미리보기",
    // Validation errors
    nameRequired: "스킬 이름을 입력하세요",
    descriptionRequired: "설명을 입력하세요",
    saveFailed: "저장 실패",
    // Category labels
    categories: {
      codeReview: "코드 리뷰",
      testing: "테스트",
      debugging: "디버깅",
      refactoring: "리팩터링",
      documentation: "문서화",
      security: "보안",
      performance: "성능",
      architecture: "아키텍처",
      general: "일반",
    },
  },

  skillDetail: {
    tabOverview: "개요",
    tabContent: "콘텐츠",
    tabRaw: "SKILL.md",
    category: "카테고리",
    sourceBuiltin: "내장",
    sourceUser: "사용자",
    sourceImport: "가져오기",
    sourceProject: "프로젝트",
    tags: "태그",
    triggerKeywords: "트리거 키워드",
    fileExtensions: "파일 확장자",
  },

  webContainer: {
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
  },

  workflowEditor: {
    // Node Properties Panel
    properties: "속성",
    selectNodeToEdit: "속성을 편집할 노드를 선택하세요",
    clickCanvasNode:
      "캔버스의 노드를 클릭하거나 오른쪽에서 새 노드를 추가하세요",
    kind: "유형",
    role: "역할",
    outputKey: "출력 키",
    taskInstruction: "태스크 지시",
    taskInstructionHint: "지우면 기본 지시 복원",
    setAsWorkflowEntry: "워크플로우 진입점으로 설정",
    maxRetries: "최대 재시도",
    timeout: "타임아웃 (ms)",
    advancedConfig: "고급 설정",
    // Model config
    modelConfig: "모델 설정",
    modelProvider: "모델 제공자",
    useDefault: "기본값 사용",
    modelId: "모델 ID",
    temperature: "Temperature",
    maxTokens: "최대 토큰",
    resetToDefault: "기본값으로 재설정",
    // Prompt template
    promptTemplate: "프롬프트 템플릿",
    templateContent: "템플릿 콘텐츠",
    templateContentHint: "{{변수}} 구문 지원",
    templatePlaceholder:
      "사용자 정의 프롬프트 템플릿, {{outputKey}}를 사용하여 업스트림 출력 참조...",
    availableVariables: "사용 가능한 변수：",
    upstreamOutput: "업스트림 노드 출력",
    useDefaultTemplate: "기본 템플릿 사용",
    // Node kinds
    plan: "계획",
    produce: "제작",
    review: "검토",
    repair: "수리",
    assemble: "조립",
    condition: "조건",
    planDescription: "목표와 전략 정의",
    produceDescription: "창작 작업 실행",
    reviewDescription: "출력 품질 확인",
    repairDescription: "검토 문제 수정",
    assembleDescription: "최종 출력 통합",
    conditionDescription: "조건 분기 판단",
    // Add node toolbar
    add: "추가",
    addNodeTooltip: "{kind} 노드 추가 - {description}",
    // Canvas context menu
    addNodes: "노드 추가",
    fitView: "뷰에 맞춤",
    editProperties: "속성 편집",
    setAsEntry: "진입점으로 설정",
    deleteNodeContext: "노드 삭제",
    // Node card
    entry: "진입점",
    retry: "재시도",
    timeoutSec: "시간 초과",
    // Actions
    deleteNode: "노드 삭제",
    // Canvas empty state
    noWorkflowYet: "아직 워크플로우가 없습니다",
    createOrOpenWorkflow: "새 워크플로우를 만들거나 기존 워크플로우를 여세요",
    // Custom workflow manager
    myWorkflows: "내 워크플로우",
    createWorkflow: "워크플로우 만들기",
    editWorkflow: "워크플로우 편집",
    deleteWorkflow: "워크플로우 삭제",
    workflowName: "워크플로우 이름",
    workflowNamePlaceholder: "예: 코드 검토 파이프라인",
    workflowDescription: "설명",
    workflowDescriptionPlaceholder: "이 워크플로우가 무엇をする지 설명...",
    confirmDelete: "삭제 확인",
    workflowDeleted: "워크플로우가 삭제되었습니다",
    createFailed: "워크플로우 만들기 실패",
    updateFailed: "워크플로우 업데이트 실패",
    deleteFailed: "워크플로우 삭제 실패",
    importFailed: "워크플로우 가져오기 실패",
  },

  customWorkflowManager: {
    title: "워크플로우 관리",
    subtitle: "사용자 정의 워크플로우 관리",
    createNew: "새 워크플로우",
    searchPlaceholder: "워크플로우 검색...",
    noResultsWithSearch: "일치하는 워크플로우를 찾을 수 없습니다",
    noResultsWithoutSearch: "아직 사용자 정의 워크플로우가 없습니다",
    tryDifferentKeyword: "다른 키워드를 사용해 보세요",
    clickToCreateFirst:
      "「새 워크플로우」를 클릭하여 첫 번째 워크플로우를 만드세요",
    // Domain labels
    generic: "범용",
    novel: "소설 작성",
    video: "비디오 스크립트",
    course: "강좌 제작",
    custom: "사용자 정의",
    nodesCount: "{count}개 노드",
    // Status
    enabled: "활성화됨",
    disabled: "비활성화됨",
    updatedAt: "{date}에 업데이트됨",
    // Delete dialog
    confirmDelete: "삭제 확인",
    deleteConfirmMessage:
      '워크플로우 "{name}"을(를) 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.',
    cancel: "취소",
    delete: "삭제",
    // Footer
    totalWorkflows: "워크플로우 {count}개",
    close: "닫기",
  },

  workflowEditorDialog: {
    // Header
    back: "뒤로",
    workflowEditor: "워크플로우 편집기",
    // Template selector
    switchTemplate: "템플릿 전환",
    newWorkflow: "새 워크플로우",
    myWorkflows: "내 워크플로우",
    builtInTemplates: "내장 템플릿",
    // Display names
    untitledWorkflow: "제목 없는 워크플로우",
    customWorkflow: "사용자 정의 워크플로우",
    workflow: "워크플로우",
    // Confirm dialog
    unsavedChangesConfirm:
      "저장되지 않은 변경 사항이 있습니다. 템플릿을 전환하시겠습니까?",
    // Status
    valid: "유효",
    errors: "{count}개 오류",
    // Actions
    reset: "초기화",
    save: "저장",
    runSimulation: "시뮬레이션 실행",
    // Aria labels
    close: "닫기",
  },

  // 원격 제어
  remote: {
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
  },

  // 세션 관리
  session: {
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
  },

  // 파일 뷰어
  fileViewer: {
    pendingFiles: "보류 중인 파일",
    undoChanges: "변경 실행 취소",
    noFiles: "파일 없음",
  },

  standalonePreview: {
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
  },

  storageStatusBanner: {
    cacheUnstable: "캐시가 불안정합니다",
    retry: "재시도",
  },

  pendingSync: {
    justNow: "방금",
    minutesAgo: "{count}분 전",
    hoursAgo: "{count}시간 전",
    create: "생성",
    modify: "수정",
    delete: "삭제",
    noActiveConversations: "활성 대화 없음",
    allChangesSynced: "모든 변경사항 동기화됨",
    pendingCount: "대기 중 ({count})",
    syncAllToDisk: "보류 중인 모든 변경사항을 디스크에 동기화",
    selectProjectFolder: "먼저 프로젝트 폴더를 선택하세요",
    syncing: "동기화 중...",
    sync: "동기화",
    syncComplete: "동기화 완료: {success} 성공",
    failed: "실패",
    skipped: "건너뜀",
    pendingChangesWillBeWritten:
      "보류 중인 변경사항은 실제 파일시스템에 기록됩니다. 올바른 프로젝트 폴더를 선택했는지 확인하세요.",
  },

  themeToggle: {
    currentTheme: "현재 테마: {theme}",
    rightClickMenu: "우클릭하여 테마 메뉴 열기",
  },

  // 대화
  conversation: {
    thinking: "생각 중...",
    reasoning: "추론 과정",
    toolCall: "도구 호출",
    regenerate: "재생성",
    regenerateConfirmMessage:
      "이 메시지를 다시 보내시겠습니까? 현재 답장이 대체됩니다.",
    regenerateConfirmAction: "확인",
    regenerateCancelAction: "취소",
    stopAndResend: "중지 후 다시 보내기",
    resend: "다시 보내기",
    stopAndResendMessage: "이 메시지 중지 후 다시 보내기",
    resendMessage: "이 메시지 다시 보내기",
    editAndResend: "편집하여 다시 보내기",
    thinkingMode: "생각 모드",
    thinkingLevels: {
      minimal: "최소",
      low: "낮음",
      medium: "중간",
      high: "높음",
      xhigh: "초고",
    },
    tokenBudget:
      "유효 입력 예산 {effectiveBudget} = 총 한도 {modelMaxTokens} - 예약 {reserveTokens}",
    empty: {
      title: "새 대화 시작",
      description:
        "코드, 데이터 분석, 문서 작성 등 다양한 작업을 도와드립니다. 질문을 입력하세요!",
      onlineStatus: "항상 온라인",
      smartConversation: "스마트 대화",
    },
    input: {
      placeholder: "메시지 입력... (Shift+Enter 줄바꿈)",
      placeholderNoKey: "먼저 설정에서 API Key를 구성하세요",
      ariaLabel: "메시지 입력",
    },
    buttons: {
      stop: "중지",
      send: "전송",
      deleteTurn: "이 턴 삭제",
    },
    toast: {
      noApiKey: "먼저 설정에서 API Key를 구성하세요",
      deletedTurn: "완전한 대화 턴 삭제됨",
    },
    error: {
      requestFailed: "요청 실패:",
    },
    usage: {
      highRisk: "고위험",
      nearLimit: "한계 근접",
      comfortable: "여유 있음",
      tokenUsage:
        "입력 {promptTokens} + 출력 {completionTokens} = {totalTokens} tokens",
    },

    // 대화 내보내기
    export: {
      title: "대화 내보내기",
      format: "형식",
      markdownDesc: "읽기 쉬운 형식, 공유에 적합",
      jsonDesc: "구조화된 데이터, 백업에 적합",
      htmlDesc: "스타일이 적용된 페이지, 인쇄에 적합",
      options: "옵션",
      includeToolCalls: "도구 호출 포함",
      includeReasoning: "추론 과정 포함",
      addTimestamp: "파일명에 타임스탬프 추가",
      messages: "개 메시지",
      user: "개 사용자",
      assistant: "개 어시스턴트",
      preparing: "준비 중...",
      complete: "내보내기 완료!",
      failed: "내보내기 실패",
      saved: "저장됨",
      button: "내보내기",
    },
  },

  conversationStorage: {
    statusOk: "OK",
    statusWarning: "저장 공간 부족",
    statusUrgent: "정리 필요",
    statusCritical: "심각",
    calculateSize: "대화당 캐시 크기 계산 (느릴 수 있음)",
    refresh: "새로 고침",
    sessionDeleted: "대화가 삭제되었습니다",
    deleteFailed: "대화 삭제 실패",
    noOldConversations: "30일 동안 비활성 대화 없음",
    noCleanupNeeded: "정리할 캐시 없음",
    getCleanupInfoFailed: "정리 정보 가져오기 실패",
    cleanupSuccess:
      "{count}개의 대화 파일 캐시를 정리하여 {size}를 확보했습니다",
    cleanupFailed: "정리에 실패했습니다. 다시 시도해 주세요",
    // Cleanup dialog
    cleanupTitle: "대화 캐시 정리",
    attention: "주의：",
    willDiscard: "{count}개의 저장되지 않은 변경 사항을 삭제합니다",
    willCleanup: "정리 대상：",
    conversationCount: "{count}개의 대화",
    daysInactive: "(30일 비활성)",
    fileCacheSize: "약 {size} 파일 캐시",
    unsavedChanges: "{count}개의 저장되지 않은 변경",
    selectScope: "정리 범위 선택",
    cleanupOldSessions: "오래된 대화만 정리 (30일 비활성)",
    cleanupAll: "모든 대화 캐시 정리",
    cleanupHelpText:
      "대화 기록은 삭제되지 않습니다. 다음에 파일에 접근할 때 디스크에서 다시 읽어옵니다.",
    canceling: "취소",
    cleaning: "정리 중...",
    confirmCleanup: "정리 확인",
    // Delete dialog
    deleteTitle: "대화 삭제",
    deleteConfirm: '"{name}"을(를) 삭제하시겠습니까?',
    warningUnsaved: "주의：저장되지 않은 변경 사항 있음",
    pendingSync: "{count}개의 동기화 대기 변경 사항",
    willDelete: "삭제 대상",
    conversationRecords: "대화 기록",
    fileCache: "파일 캐시",
    unsavedCannotRecover: "저장되지 않은 변경 (복구 불가)",
    cannotRecover: "삭제 후 복구 불가",
    deleting: "삭제 중...",
    confirmDelete: "삭제 확인",
    // Dropdown
    storageSpace: "저장 공간",
    browserQuota: "(브라우저 할당량)",
    loading: "로딩 중...",
    quotaExplanation:
      "할당량은 브라우저 허용 한도이며 실제 남은 공간과 다릅니다. 실제 공간을 초과하여 쓰기하면 오류가 발생합니다.",
    cannotGetStorage: "저장소 정보를 가져올 수 없습니다",
    currentConversation: "현재 대화",
    allConversations: "모든 대화 ({count})",
    noSessions: "대화 없음",
    noChanges: "변경 없음",
    deleteConversation: "대화 삭제",
    cleanupOldDescription: "오래된 대화의 파일 캐시를 정리하여 공간 확보",
    cleanupFileCache: "파일 캐시 정리",
    cleanupFileCacheHelp:
      "파일 캐시만 정리하며 대화 기록에는 영향을 주지 않습니다",
  },

  workspaceStorage: {
    statusOk: "OK",
    statusWarning: "저장 공간 부족",
    statusUrgent: "정리 필요",
    statusCritical: "심각",
    calculateSize: "워크스페이스당 캐시 크기 계산 (느릴 수 있음)",
    refresh: "새로 고침",
    sessionDeleted: "워크스페이스가 삭제되었습니다",
    deleteFailed: "워크스페이스 삭제 실패",
    noOldConversations: "30일 동안 비활성 워크스페이스 없음",
    noCleanupNeeded: "정리할 캐시 없음",
    getCleanupInfoFailed: "정리 정보 가져오기 실패",
    cleanupSuccess:
      "{count}개의 워크스페이스 파일 캐시를 정리하여 {size}를 확보했습니다",
    cleanupFailed: "정리에 실패했습니다. 다시 시도해 주세요",
    cleanupTitle: "워크스페이스 캐시 정리",
    attention: "주의：",
    willDiscard: "{count}개의 저장되지 않은 변경 사항을 삭제합니다",
    willCleanup: "정리 대상：",
    conversationCount: "{count}개의 워크스페이스",
    daysInactive: "(30일 비활성)",
    fileCacheSize: "약 {size} 파일 캐시",
    unsavedChanges: "{count}개의 저장되지 않은 변경",
    selectScope: "정리 범위 선택",
    cleanupOldSessions: "오래된 워크스페이스만 정리 (30일 비활성)",
    cleanupAll: "모든 워크스페이스 캐시 정리",
    cleanupHelpText:
      "워크스페이스 기록은 삭제되지 않습니다. 다음에 파일에 접근할 때 디스크에서 다시 읽어옵니다.",
    canceling: "취소",
    cleaning: "정리 중...",
    confirmCleanup: "정리 확인",
    deleteTitle: "워크스페이스 삭제",
    deleteConfirm: '"{name}"을(를) 삭제하시겠습니까?',
    warningUnsaved: "주의：저장되지 않은 변경 사항 있음",
    pendingSync: "{count}개의 동기화 대기 변경 사항",
    willDelete: "삭제 대상",
    conversationRecords: "워크스페이스 기록",
    fileCache: "파일 캐시",
    unsavedCannotRecover: "저장되지 않은 변경 (복구 불가)",
    cannotRecover: "삭제 후 복구 불가",
    deleting: "삭제 중...",
    confirmDelete: "삭제 확인",
    storageSpace: "저장 공간",
    browserQuota: "(브라우저 할당량)",
    loading: "로딩 중...",
    quotaExplanation:
      "할당량은 브라우저 허용 한도이며 실제 남은 공간과 다릅니다. 실제 공간을 초과하여 쓰기하면 오류가 발생합니다.",
    cannotGetStorage: "저장소 정보를 가져올 수 없습니다",
    currentConversation: "현재 워크스페이스",
    allConversations: "모든 워크스페이스 ({count})",
    noSessions: "워크스페이스 없음",
    noChanges: "변경 없음",
    deleteConversation: "워크스페이스 삭제",
    cleanupOldDescription: "오래된 워크스페이스의 파일 캐시를 정리하여 공간 확보",
    cleanupFileCache: "파일 캐시 정리",
    cleanupFileCacheHelp:
      "파일 캐시만 정리하며 워크스페이스 기록에는 영향을 주지 않습니다",
  },

  toolCallDisplay: {
    executing: "실행 중...",
    arguments: "인수",
    result: "결과",
  },

  // 모바일 전용
  mobile: {
    menu: "메뉴",
    back: "뒤로",
    home: "홈",
    profile: "프로필",
    settings: {
      connectionStatus: "연결 상태",
      status: "상태",
      statusConnected: "연결됨",
      statusConnecting: "연결 중...",
      statusDisconnected: "연결 안 됨",
      directory: "디렉터리",
      encryption: "암호화",
      encryptionReady: "종단 간 암호화됨",
      encryptionExchanging: "키 교환 중...",
      encryptionError: "암호화 오류",
      encryptionNone: "암호화 안 됨",
      sessionId: "Session ID",
      sessionManagement: "세션 관리",
      clearLocalData: "로컬 세션 데이터 지우기",
      clearDataConfirm: "로컬 세션 데이터를 정리하시겠습니까?",
      about: "정보",
      disconnect: "연결 해제",
    },
    sessionInput: {
      title: "원격 세션 참여",
      subtitle: "PC에 표시된 세션 ID를 입력하세요",
      placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      inputLabel: "세션 ID 입력 필드",
      joinSession: "세션 참여",
      connecting: "연결 중...",
      reconnecting: "재연결 중...",
      cancel: "취소",
      errorRequired: "세션 ID를 입력하세요",
      errorInvalidFormat:
        "잘못된 세션 ID 형식, UUID 형식이어야 합니다 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
      formatHint: "세션 ID 형식: UUID (8-4-4-4-12)",
      qrHint: "또는 iOS 카메라로 QR 코드를 스캔하여 자동 참여",
    },
  },

  // 오프라인 대기열
  offlineQueue: {
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
  },

  // 활동 히트맵
  activityHeatmap: {
    months: [
      "1월",
      "2월",
      "3월",
      "4월",
      "5월",
      "6월",
      "7월",
      "8월",
      "9월",
      "10월",
      "11월",
      "12월",
    ],
    days: ["", "월", "", "수", "", "금", ""],
  },

  // 오류 경계
  errorBoundary: {
    renderError: "렌더링 오류",
    componentRenderError:
      "컴포넌트 렌더링 중 오류가 발생했습니다. 일시적인 문제일 수 있으므로 페이지를 새로 고쳐주세요.",
    errorDetails: "오류 상세",
    retry: "재시도",
    streamingError: "스트리밍 출력 오류",
  },

  // 플러그인 대화상자
  pluginDialog: {
    confirm: "확인",
    cancel: "취소",
    alert: "알림",
    info: "정보",
    deleteConfirm: "삭제 확인",
    delete: "삭제",
    gotIt: "확인",
  },

  // HTML 미리보기
  htmlPreview: {
    preview: "미리보기",
    loading: "로딩 중...",
  },

  // 파일 미리보기
  filePreview: {
    cannotReadFile: "파일을 읽을 수 없습니다",
    fileTooLarge: "파일이 너무 큽니다 ({size}), 최대 지원 크기는 {maxSize}",
    readFileFailed: "파일 읽기 실패: {error}",
    clickFileTreeToPreview: "파일 트리에서 파일을 클릭하여 미리보기",
    conflict: "충돌",
    diskFileNewer: "디스크 파일이 OPFS보다 최신입니다. 충돌이 있을 수 있습니다",
    copyContent: "내용 복사",
    close: "닫기",
    binaryFile: "바이너리 파일",
  },

  // 최근 파일
  recentFiles: {
    title: "최근 파일",
    empty: "최근 파일 없음",
    emptyHint: "연 파일이 여기에 표시됩니다",
    remove: "최근에서 제거",
    confirmClear: "모든 최근 파일을 지우시겠습니까?",
    count: "{count}개 최근 파일",
  },

  // 명령 팔레트
  commandPalette: {
    title: "명령 팔레트",
    placeholder: "명령을 입력하거나 검색...",
    noResults: '"{query}"와 일치하는 명령을 찾을 수 없습니다',
    navigate: "탐색",
    select: "선택",
    close: "닫기",
    general: "일반",
    categories: {
      conversations: "대화",
      files: "파일",
      developer: "개발자",
      dataAnalyst: "데이터 분석가",
      student: "학생",
      office: "사무",
      view: "보기",
      tools: "도구",
      settings: "설정",
      help: "도움말",
    },
    commands: {
      "new-conversation": {
        label: "새 대화",
        description: "새 대화를 시작합니다",
      },
      "continue-last": {
        label: "이전 대화 계속하기",
        description: "가장 최근 대화로 돌아갑니다",
      },
      "open-file": {
        label: "파일 열기...",
        description: "워크스페이스에서 파일을 엽니다",
      },
      "recent-files": {
        label: "최근 파일",
        description: "최근에 접근한 파일을 봅니다",
      },
      "analyze-code": {
        label: "코드 분석",
        description: "코드 구조와 품질을 분석합니다",
      },
      "find-bugs": {
        label: "잠재적 버그 찾기",
        description: "코드 스멜과 잠재적 문제를 검색합니다",
      },
      "refactor-code": {
        label: "리팩터링 제안",
        description: "선택한 코드의 리팩터링 제안을 받습니다",
      },
      "explain-code": {
        label: "코드 설명",
        description: "코드 기능에 대한 자세한 설명을 받습니다",
      },
      "search-code": {
        label: "코드베이스 검색",
        description: "파일 간 패턴과 참조를 찾습니다",
      },
      "analyze-data": {
        label: "데이터 분석",
        description: "로드된 데이터를 처리하고 분석합니다",
      },
      "generate-chart": {
        label: "시각화 생성",
        description: "데이터에서 차트를 만듭니다",
      },
      "run-statistics": {
        label: "통계 검정 실행",
        description: "통계 분석을 수행합니다",
      },
      "data-summary": {
        label: "데이터 요약",
        description: "요약 통계를 생성합니다",
      },
      "export-data": {
        label: "결과 내보내기",
        description: "분석 결과를 내보냅니다",
      },
      "export-csv": {
        label: "CSV로 내보내기",
        description: "데이터를 CSV 형식으로 내보냅니다",
      },
      "export-json": {
        label: "JSON으로 내보내기",
        description: "데이터를 JSON 형식으로 내보냅니다",
      },
      "export-excel": {
        label: "Excel로 내보내기",
        description: "데이터를 Excel 통합 문서로 내보냅니다",
      },
      "export-chart-image": {
        label: "차트를 이미지로 내보내기",
        description: "차트를 PNG 이미지로 내보냅니다",
      },
      "export-pdf": {
        label: "PDF로 내보내기",
        description: "보고서를 PDF 형식으로 내보냅니다",
      },
      "export-code-review-pdf": {
        label: "코드 리뷰를 PDF로 내보내기",
        description: "코드 리뷰 결과를 PDF로 내보냅니다",
      },
      "export-test-report-pdf": {
        label: "테스트 보고서를 PDF로 내보내기",
        description: "테스트 생성 결과를 PDF로 내보냅니다",
      },
      "export-project-analysis-pdf": {
        label: "프로젝트 분석을 PDF로 내보내기",
        description: "프로젝트 분석을 PDF로 내보냅니다",
      },
      "explain-concept": {
        label: "개념 설명",
        description: "개념에 대한 교육적 설명을 받습니다",
      },
      "create-study-plan": {
        label: "학습 계획 생성",
        description: "개인화된 학습 계획을 생성합니다",
      },
      "solve-problem": {
        label: "단계별로 해결",
        description: "가이드와 함께 문제를 해결합니다",
      },
      "process-excel": {
        label: "Excel 파일 처리",
        description: "Excel 스프레드시트를 읽고 처리합니다",
      },
      "query-data": {
        label: "데이터 쿼리",
        description: "자연어로 데이터를 쿼리합니다",
      },
      "transform-data": {
        label: "데이터 변환",
        description: "데이터를 정제하고 변환합니다",
      },
      "toggle-sidebar": {
        label: "사이드바 전환",
        description: "사이드바를 표시하거나 숨깁니다",
      },
      "toggle-theme": {
        label: "테마 전환",
        description: "라이트 모드와 다크 모드를 전환합니다",
      },
      "open-skills": {
        label: "스킬 관리",
        description: "스킬을 관리합니다",
      },
      "open-tools": {
        label: "도구 패널",
        description: "도구 패널을 엽니다",
      },
      "open-mcp": {
        label: "MCP 서비스",
        description: "MCP 서비스를 관리합니다",
      },
      "workspace-settings": {
        label: "워크스페이스 설정",
        description: "워크스페이스 환경설정을 구성합니다",
      },
      "keyboard-shortcuts": {
        label: "키보드 단축키",
        description: "모든 키보드 단축키를 봅니다",
      },
    },
  },

  mcp: {
    dialog: {
      title: "MCP 서비스 설정",
    },
    title: "MCP 서버",
    description: "외부 MCP 서비스 연결을 관리합니다",
    addServer: "MCP 서버 추가",
    editServer: "서버 편집",
    add: "추가",
    update: "업데이트",
    saving: "저장 중...",
    toolsCount: "{count}개 도구",
    confirmDelete: "이 MCP 서버를 삭제하시겠습니까?",
    badge: {
      builtin: "내장",
      disabled: "비활성화",
    },
    empty: {
      title: "MCP 서버가 없습니다",
      hint: "위 버튼을 클릭하여 서버를 추가하세요",
    },
    actions: {
      clickToDisable: "클릭하여 비활성화",
      clickToEnable: "클릭하여 활성화",
      editConfig: "설정 편집",
      deleteServer: "서버 삭제",
    },
    toast: {
      loadFailed: "MCP 서버 로드에 실패했습니다",
      updated: "서버 설정이 업데이트되었습니다",
      added: "서버가 추가되었습니다",
      saveFailed: "저장에 실패했습니다",
      deleted: "서버가 삭제되었습니다",
      deleteFailed: "삭제에 실패했습니다",
      updateStatusFailed: "상태 업데이트에 실패했습니다",
    },
    validation: {
      invalidServerId: "잘못된 서버 ID",
      nameRequired: "서버 이름을 입력하세요",
      urlRequired: "서버 URL을 입력하세요",
      urlInvalid: "유효한 URL을 입력하세요",
      timeoutRange: "타임아웃은 1000-300000ms 범위여야 합니다",
      serverIdExists: "서버 ID가 이미 존재합니다",
      serverIdValid: "ID 형식이 올바릅니다",
    },
    form: {
      serverId: "서버 ID",
      serverIdPlaceholder: "예: excel-analyzer",
      serverIdHint:
        "도구 호출에 사용됩니다. 예: excel-analyzer:analyze_spreadsheet",
      displayName: "표시 이름",
      displayNamePlaceholder: "예: Excel 분석기",
      description: "설명",
      descriptionPlaceholder: "서버 기능 설명",
      serverUrl: "서버 URL",
      transportType: "전송 방식",
      authTokenOptional: "인증 토큰(선택)",
      timeoutMs: "타임아웃 (ms)",
      transport: {
        sse: "SSE (Server-Sent Events)",
        streamableHttp: "Streamable HTTP",
        streamableHttpExperimental: "Streamable HTTP (실험적)",
      },
    },
  },

  // 온보딩
  onboarding: {
    dontShowAgain: "다시 표시 안 함",
    previous: "이전",
    next: "다음",
    complete: "완료",
    stepProgress: "{current} / {total} 단계",
    steps: {
      welcome: {
        title: "CreatorWeave에 오신 것을 환영합니다!",
        description: "주요 기능을 안내해 드리겠습니다.",
      },
      conversations: {
        title: "대화",
        description:
          "AI와 채팅하여 코드베이스를 분석합니다. 각 대화에는 전용 워크스페이스가 있습니다.",
      },
      fileTree: {
        title: "파일 브라우저",
        description:
          "프로젝트 파일과 폴더를 탐색합니다. 파일을 클릭하여 내용을 미리 봅니다.",
      },
      skills: {
        title: "스킬",
        description:
          "일반적인 작업을 위한 재사용 가능한 스킬을 관리하고 실행합니다.",
      },
      tools: {
        title: "도구 패널",
        description: "빠른 작업, 추론 시각화, 스마트 제안에 액세스합니다.",
      },
      complete: {
        title: "준비 완료!",
        description:
          "이러한 기능은 언제든지 도구 모음이나 키보드 단축키에서 액세스할 수 있습니다.",
      },
    },
  },

  workspace: {
    title: "워크스페이스",
  },

  // 프로젝트 홈
  projectHome: {
    hero: {
      badge: "로컬 우선",
      title: "여기서 창작을 시작하세요",
      description: "로컬 AI 워크스페이스에서 자연어로 파일과 대화하세요.",
      descriptionSuffix: "데이터는 당신의 기기에 남습니다.",
      projectCount: "{count} 프로젝트",
      workspaceCount: "{count} 워크스페이스",
      docsHub: "문서 센터",
      userDocs: "사용자 문서",
      developerDocs: "개발자 문서",
    },
    sidebar: {
      continueWork: "계속하기",
      createNew: "새로 만들기",
      createNewDescription: "새 프로젝트를 만들어 창작 여정을 시작하세요.",
      shortcutHint: "단축키: N",
      createProject: "프로젝트 생성",
      startFresh: "처음부터 시작",
      startFreshDescription:
        "문제가 있나요? 처음부터 시작할 수 있습니다. 모든 프로젝트와 대화가 삭제됩니다.",
      resetApp: "앱 초기화",
      resetting: "초기화 중...",
      helpDocs: "도움말 문서",
      helpDocsDescription:
        "사용자/개발자 문서를 확인해 사용 가이드와 기술 정보를 빠르게 찾으세요.",
      openDocs: "문서 센터 열기",
      appearance: "외관",
      cache: "캐시",
      cacheDescription:
        "브라우저 캐시를 삭제하여 응답 헤더와 정적 리소스를 새로고침합니다.",
      clearCache: "캐시 삭제",
      clearing: "삭제 중...",
    },
    theme: {
      modeTitle: "테마 모드",
      light: "라이트",
      dark: "다크",
      system: "시스템",
      accentColorTitle: "강조 색상",
      languageTitle: "언어",
    },
    accentColors: {
      teal: "틸",
      rose: "로즈",
      amber: "앰버",
      violet: "바이올렛",
      emerald: "에메랄드",
      slate: "슬레이트",
    },
    activity: {
      title: "활동",
      less: "적음",
      more: "많음",
      count: "회 활동",
    },
    timeline: {
      today: "오늘",
      yesterday: "어제",
      thisWeek: "이번 주",
      thisMonth: "이번 달",
      older: "이전",
    },
    filters: {
      searchPlaceholder: "프로젝트 검색...",
      all: "전체",
      active: "활성",
      archived: "보관됨",
    },
    project: {
      archived: "보관됨",
      workspaceCount: "{count} 워크스페이스",
      open: "열기",
      rename: "이름 변경",
      archive: "보관",
      unarchive: "보관 해제",
      delete: "삭제",
    },
    dialogs: {
      createProject: "새 프로젝트 생성",
      createProjectDescription:
        "새 프로젝트의 이름을 지정하여 다른 워크스페이스를 구성하고 구별하세요.",
      projectNamePlaceholder: "프로젝트 이름 입력",
      createButton: "프로젝트 생성",
      creating: "생성 중...",
      renameProject: "프로젝트 이름 변경",
      renamePlaceholder: "새 프로젝트 이름 입력",
      archiveProject: "프로젝트 보관",
      archiveConfirm:
        '프로젝트 "{name}"을(를) 보관하시겠습니까? 보관된 프로젝트는 기본적으로 표시되지 않지만 언제든지 보관 해제할 수 있습니다.',
      dontAskAgain: "다시 묻지 않기",
      deleteProject: "프로젝트 삭제",
      deleteConfirm:
        '프로젝트 "{name}"을(를) 삭제하시겠습니까? 연관된 워크스페이스 레코드도 삭제되며 되돌릴 수 없습니다.',
      deleteConfirmHint: "확인을 위해 프로젝트 이름을 입력하세요:",
      startFreshTitle: "처음부터 시작",
      startFreshDescription: "이 앱에서 만든 모든 것이 삭제됩니다:",
      startFreshItems: {
        projects: "모든 프로젝트와 워크스페이스",
        conversations: "모든 대화 기록",
        files: "모든 업로드된 파일",
      },
      startFreshNote: "처음 앱을 열었을 때와 같은 상태가 됩니다.",
      startFreshConfirmHint: '확인을 위해 "처음부터 시작"을 입력하세요:',
      startFreshConfirmPlaceholder: "처음부터 시작",
      confirmReset: "초기화 확인",
      resetting: "초기화 중...",
    },
    empty: {
      noProjects: "아직 프로젝트가 없습니다",
      noResults: "일치하는 프로젝트를 찾을 수 없습니다",
      createFirst: "첫 번째 프로젝트 생성",
    },
  },

  // 파일 트리
  fileTree: {
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
  },

  // 에이전트 관련
  agent: {
    inputHint: "@를 입력하여 일시적으로 에이전트 전환",
    createNew: "새 에이전트 생성...",
    noAgents: "사용 가능한 에이전트 없음",
    create: "생성",
    delete: "{id} 삭제",
    confirmDelete: '에이전트 "{id}"을(를) 삭제하시겠습니까?',
    thinking: "생각 중...",
    callingTool: "도구 호출 중...",
    callingToolWithName: "{name} 도구 호출 중...",
  },

  // 사이드바 컴포넌트
  sidebar: {
    expandSidebar: "사이드바 펼치기",
    collapseSidebar: "사이드바 접기",
    closeSidebar: "사이드바 닫기",
    workspace: "워크스페이스",
    clearWorkspace: "현재 프로젝트 워크스페이스 지우기",
    clear: "지우기",
    newWorkspace: "새 워크스페이스",
    workspaceLabel: "워크스페이스: {name}",
    pendingReviewCount: "{count}개 변경 검토 대기",
    workspaceDeleted: "워크스페이스가 삭제되었습니다",
    emptyStateNoWorkspace:
      "이 프로젝트의 워크스페이스가 아직 없습니다. 첫 대화를 시작하면 워크스페이스가 자동으로 생성됩니다.",
    createFirstWorkspace: "첫 번째 워크스페이스 만들기",
    deleteWorkspaceFailed: "워크스페이스 삭제 실패",
    deleteWorkspace: "워크스페이스 삭제",
    renameWorkspace: "워크스페이스 이름 변경",
    pinWorkspace: "워크스페이스 고정",
    unpinWorkspace: "고정 해제",
    dragToResizeHeight: "드래그하여 높이 조정",
    centerDot: "중앙 점",
    files: "파일",
    changes: "변경",
    snapshots: "스냅샷",

    // Snapshot List
    snapshotList: {
      title: "스냅샷 목록",
      noSnapshots: "스냅샷 기록이 없습니다",
      loading: "스냅샷 로드 중...",
      current: "현재",
      delete: "삭제",
      switch: "전환",
      switching: "처리 중...",
      deleting: "삭제 중...",
      clear: "지우기",
      clearing: "지우는 중...",
      workspaceNotFound: "워크스페이스를 찾을 수 없습니다: {name}",
      switchPartial:
        "스냅샷 전환이 완전히 성공하지 못했습니다(실패한 스냅샷 {failedSnapshotId}), {count}개 파일이 아직 복원되지 않았습니다",
      switchFailed:
        "전환이 실패하고 자동 복구도 완전히 성공하지 못했습니다. 스냅샷 상태를 수동으로 확인하세요",
      switchFailedWithCount:
        "최신으로의 전환이 완전히 성공하지 못했습니다, {count}개 파일이 아직 복원되지 않았습니다",
      loadFailed: "스냅샷 로드 실패",
      loadDetailFailed: "스냅샷 상세 정보 로드 실패",
      deleteFailed: "스냅샷 삭제 실패",
      clearFailed: "스냅샷 지우기 실패",
      noActiveProject: "활성 프로젝트가 없습니다",
      snapshotNotFound: "스냅샷을 찾을 수 없습니다",
      switchToLatestFailed: "최신으로의 전환 실패",
      pendingCount: "{count}개 변경",
      fileOpCreate: "추가됨",
      fileOpModify: "수정됨",
      fileOpDelete: "삭제됨",
      contentKindBinary: "바이너리",
      contentKindText: "텍스트",
      contentKindNone: "없음",
      confirmClearTitle: "지우기 확인",
      confirmClearMessage:
        "이 프로젝트의 모든 스냅샷을 지우시겠습니까? 이 작업은 취소할 수 없습니다.",
      confirmDeleteTitle: "삭제 확인",
      confirmDeleteMessage:
        "이 스냅샷을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.",
      approved: "승인됨",
      committed: "커밋됨",
      draft: "초안",
      rolledBack: "롤백됨",
      unnamedSnapshot: "이름 없는 스냅샷",
      processing: "처리 중 {current}/{total}",
      loadingDetails: "상세 정보 로드 중...",
      noDetails: "이 스냅샷의 파일 상세 정보가 없습니다",
      before: "이전",
      after: "이후",
    },

    // Snapshot Approval Dialog
    snapshotApproval: {
      title: "스냅샷 생성",
      description:
        '<span class="font-semibold">{count}</span>개 변경을 승인하고 스냅샷 레코드를 생성합니다.',
      summaryLabel: "스냅샷 설명",
      generateAI: "AI 생성",
      generating: "생성 중...",
      summaryPlaceholder:
        "스냅샷 설명 입력 (여러 줄 가능, 첫 줄을 제목으로 사용)",
      summaryError: "요약 생성 실패",
      cancel: "취소",
      confirm: "승인 확인",
      processing: "처리 중...",
    },
    plugins: "플러그인",
    pluginTitle: "플러그인",
    pluginManagerHint: "플러그인 관리가 여기에 표시됩니다",
    clearWorkspaceTitle: "워크스페이스 지우기",
    confirmClearWorkspace:
      "현재 프로젝트의 모든 워크스페이스를 지우시겠습니까? 이 작업은 취소할 수 없습니다.",
    clearedCount: "{count}개의 워크스페이스를 지웠습니다",
    clearFailed: "지우기 실패 ({count}개 실패)",
    deletePartial: "{success}개 삭제, {failed}개 실패",
    clearing: "지우는 중...",
    dragToResizeWidth: "드래그하여 너비 조정",

    // Sync Progress Dialog
    syncProgress: {
      syncingFile: "파일 동기화",
      syncCompleted: "동기화 완료",
      syncFailed: "동기화 실패",
      syncing: "동기화 중...",
      totalProgress: "전체 진행률",
      filesProgress: "{completed} / {total} 파일",
      estimatedTime: "예상 남은 시간",
      remaining: "남은",
      syncSuccess: "동기화 성공",
      preparing: "동기화 준비 중...",
      close: "닫기",
      cancel: "취소",
    },

    // File Diff Viewer
    fileDiffViewer: {
      selectFile: "세부 정보를 보려면 파일을 선택하세요",
      selectFileHint:
        "왼쪽 목록에서 파일을 선택하여 버전과 현재 파일의 차이를 확인하세요",
      loadingFile: "파일 내용을 불러오는 중...",
      loadFailed: "불러오기 실패",
      afterSnapshot: "스냅샷 후",
      beforeSnapshot: "스냅샷 전",
      currentFile: "현재 파일",
      changedVersion: "변경된 버전",
      binarySnapshot: "바이너리 스냅샷 비교",
      binaryContent:
        "바이너리 내용은 텍스트 레벨 차이를 지원하지 않습니다. 파일을 다운로드하거나 전용 바이너리 비교 도구를 사용하세요.",
      noImageContent: "이미지 내용 없음",
      fileDeleted: "파일 삭제됨 (변경된 버전에 내용 없음)",
      cannotReadChangedVersion: "변경된 버전을 읽을 수 없습니다",
      loadingMonaco: "Monaco 에디터를 불러오는 중...",
      modified: "변경",
      current: "현재",
      addComment: "댓글 추가...",
      send: "보내기",
      commentsCount: "{count}개 댓글",
      reviewElements: "요소 검토",
      previewHTMLNewTab: "새 탭에서 HTML 미리보기 및 요소 검토",
      mergeView: "병합 보기",
      splitView: "분할 보기",
      template: "템플릿",
      comments: "댓글",
      deleteWarning: "(삭제 예정)",
      cannotReadNativeImage: "네이티브 이미지를 읽을 수 없습니다",
      cannotReadChangedImage: "변경된 버전의 이미지를 읽을 수 없습니다",
      imageWillBeDeleted: "이미지가 삭제됩니다 (변경된 버전에 내용 없음)",
      currentFileComments: "현재 파일 댓글",
      filesWithComments: "파일에 댓글 있음",
      copyCommentsToAI: "AI에 복사",
      commentsSummary: "{files}개 파일에 댓글 있음, 총 {comments}개",
      close: "닫기",
      // AI review prompt
      reviewPromptIntro:
        "다음 파일 스냅샷을 검토하고 수정 제안을 제공해 주세요:",
      file: "파일",
      changeType: "변경 유형",
      snapshot: "스냅샷",
      recordedAt: "기록 시간",
      reviewOutput: "다음을 출력해 주세요:",
      issueList: "문제 목록 (심각도순)",
      actionableSuggestions: "직접 실행 가능한 수정 제안",
      codePatch: "코드 변경이 필요한 경우 최소 패치를 제공하세요",
      noWorkspace: "활성 워크스페이스 없음",
      // Error messages
      loadFailedError: "파일 불러오기 실패",
      cannotReadNativeContent:
        "네이티브 파일 내용을 보려면 프로젝트 디렉토리를 선택하세요",
      readNativeFileFailed: "네이티브 파일 읽기 실패",
      // Snapshot comparison
      beforeSnapshotLabel: "스냅샷 전",
      afterSnapshotLabel: "스냅샷 후",
      binary: "바이너리",
      text: "텍스트",
      none: "없음",
      size: "크기",
      // Lazy diff viewer mode
      changesOnly: "변경만",
      fullEditor: "전체 에디터",
      switchToChangesOnly: "변경만 보기로 전환",
      switchToFullEditor: "전체 에디터로 전환",
    },

    // Monaco Diff Editor
    monacoDiffEditor: {
      lineHasComment: "이 줄에는 댓글이 있습니다",
    },

    // Lazy Diff Viewer (hunk-based)
    lazyDiffViewer: {
      noChanges: "변경 없음",
      oneChangeBlock: "1개 변경 블록（+{additions} −{deletions}）",
      changeBlocks: "{count}개 변경 블록（+{additions} −{deletions}）",
      loadMore: "{count}줄 불러오기",
      remaining: "남음",
      fullEditor: "전체 에디터",
      openInFullEditor: "전체 에디터에서 열기",
    },
  },

  // Workflow
  workflow: {
    label: "워크플로우",
    description: "멀티스텝 AI 협업, 자동 계획, 생성, 리뷰.",
    advancedSettings: "고급 설정",
    customRubricName: "커스텀 루브릭 규칙",
    enableCustomRubric: "커스텀 루브릭 규칙 활성화",
    passScore: "통과 점수",
    passScoreAria: "통과 점수",
    maxRepairRounds: "최대修复 라운드",
    maxRepairRoundsAria: "최대修复 라운드",
    paragraphRule: "단락 문장 규칙",
    paragraphMin: "최소 문장 수",
    paragraphMinAria: "단락 최소 문장 수",
    paragraphMax: "최대 문장 수",
    paragraphMaxAria: "단락 최대 문장 수",
    dialoguePolicy: "대화 정책",
    allowSingleDialogue: "단일 대화 허용",
    hookRule: "오프닝 훅 규칙",
    ctaRule: "CTA 완전성 규칙",
    customEditor: "커스텀 워크플로우 에디터",
    manageWorkflows: "내 워크플로우 관리",
    simulateRun: "시뮬레이션 실행",
    realRun: "실제 실행",
    // Template names
    templateNovelDaily: "소설 일간 워크플로우",
    templateShortVideo: "짧은 영상 스크립트 워크플로우",
    templateEducationLesson: "教案 노트 워크플로우",
    templateQualityLoop: "품질 루프 워크플로우",
    // Template labels (short)
    templateNovelDailyLabel: "소설 일간",
    templateShortVideoLabel: "짧은 영상",
    templateEducationLessonLabel: "教案 노트",
    templateQualityLoopLabel: "품질 루프",
    // Rubric names
    rubricNovelDaily: "소설 일간 루브릭",
    rubricShortVideo: "짧은 영상 루브릭",
    rubricEducationLesson: "教案 노트 루브릭",
    rubricQualityLoop: "품질 루프 루브릭",
    // Execution progress
    thinking: "생각 중...",
    thinkingProcess: "생각 과정",
    executing: "실행 중, 기다려 주세요...",
    running: "실행 중",
    completed: "완료",
    failed: "실패",
    stopRunning: "실행 중지",
    contextSummary: "컨텍스트 압축 요약",
    status: "상태",
    template: "템플릿",
    repairRounds: "수정 라운드",
    input: "입력",
    output: "출력",
    validation: {
      rubricNameRequired: "루브릭 규칙 이름을 입력하세요",
      passScoreRange: "통과 점수는 0-100 사이여야 합니다",
      repairRoundsRange: "修复 라운드는 0-10 사이여야 합니다",
      paragraphRangeInvalid: "단락 문장 범위가 유효하지 않습니다",
      atLeastOneRule: "최소 하나의 점수 규칙을 활성화해야 합니다",
    },
  },

  // Question Card (ask_user_question tool)
  questionCard: {
    answered: "답변 완료",
    title: "에이전트 질문",
    affectedFiles: "관련 파일",
    yes: "예",
    no: "아니오",
    confirm: "확인",
    placeholder: "답변을 입력하세요…",
    submitHint: "Ctrl+Enter로 제출",
    submit: "제출",
    customInput: "직접 입력",
    customInputHint: "직접 답변 입력",
    userAnswer: "사용자 답변",
  },
} as const;

export default koKR;
