// 대화
export const conversation = {
    thinking: "생각：끔",
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
    branch: "여기서 분기",
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
      placeholderQueuing: "메시지 대기열에 추가... (Shift+Enter 줄바꿈)",
      ariaLabel: "메시지 입력",
      hints: {
        fileMention: "#로 파일 언급",
        agentMention: "@로 에이전트 언급",
        slashCommand: "/로 명령 사용",
      },
    },
    buttons: {
      stop: "중지",
      send: "전송",
      deleteTurn: "이 턴 삭제",
      scrollToBottom: "하단으로 스크롤",
    },
    toast: {
      noApiKey: "먼저 설정에서 API Key를 구성하세요",
      deletedTurn: "완전한 대화 턴 삭제됨",
      branchCreated: "분기 대화가 생성되었습니다",
      messageQueued: "메시지가 대기열에 추가되었습니다 (위치 {position})",
      queueFull: "대기열이 가득 찼습니다. 현재 작업이 완료될 때까지 기다려주세요.",
    },
    error: {
      requestFailed: "요청 실패:",
      retry: "재시도",
    },
    // 반복 횟수 제한
    iterationLimit: {
      reached: "최대 반복 횟수에 도달했습니다 ({count}회)",
      continue: "계속",
      hint: "작업이 완료되지 않았을 수 있습니다. 메시지를 보내 에이전트가 계속 작업하도록 할 수 있습니다",
    },
    // 이미지 생성
    imageGen: {
      title: "이미지 생성",
      model: "모델",
      aspectRatio: "기본 화면 비율",
      previewFullscreen: "전체 화면 미리보기",
      downloadImage: "이미지 다운로드",
      generating: "이미지 생성 중...",
      generated: "이미지가 생성되었습니다",
      noResult: "이미지 생성 완료 (결과 없음)",
      failed: "이미지 생성 실패: {error}",
      emptyPrompt: "이미지 설명을 입력하세요. 예: /image 주황색 고양이",
      emptyPromptRegenerate: "이미지 설명이 비어 있어 재생성할 수 없습니다",
      waitRunning: "현재 작업이 완료될 때까지 기다려 주세요",
      configureProvider: "먼저 공급자를 구성해 주세요",
      apiKeyMissing: "API Key가 설정되지 않았습니다. 설정에서 구성해 주세요",
      aspectRatios: {
        '1:1': "정사각형",
        '16:9': "와이드",
        '9:16': "세로",
        '4:3': "가로",
        '3:4': "세로형",
        '3:2': "사진",
        '2:3': "포스터",
      },
    },
    codex: {
      error: {
        authRequired: "Codex 인증 필요",
        authRequiredDesc: "Codex 세션이 만료되었거나 인증되지 않았습니다. 브라우저 확장 프로그램을 열어 다시 인증해주세요.",
        openExtension: "확장 프로그램 열기",
        extensionRequired: "확장 프로그램 없음",
        extensionRequiredDesc: "Codex 제공자는 CreatorWeave 브라우저 확장 프로그램이 설치되어 있고 활성화되어야 합니다.",
        installExtension: "확장 프로그램 설치",
        rateLimited: "Codex 요청 제한",
        rateLimitedDesc: "요청이 너무 많거나 5시간/주간 할당량이 모두 소진되었을 수 있습니다. 잠시 후 다시 시도해주세요.",
        networkError: "네트워크 연결 오류",
        networkErrorDesc: "Codex 서비스에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.",
      },
    },
    usage: {
      highRisk: "고위험",
      nearLimit: "한계 근접",
      comfortable: "여유 있음",
      tokenUsage:
        "입력 {promptTokens} + 출력 {completionTokens} = {totalTokens} tokens",
    },

    // 내비게이션
    nav: {
      label: "메시지 내비게이션",
    },
    // 메시지 대기열
    queue: {
      badge: "{count}개 대기 중",
      divider: "{count}개의 메시지가 대기 중",
      remove: "대기열에서 제거",
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
} as const

export const toolCallDisplay = {
    executing: "실행 중...",
    arguments: "인수",
    result: "결과",
} as const

// Question Card (ask_user_question tool)
export const questionCard = {
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
} as const
