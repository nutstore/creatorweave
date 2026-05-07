// 대화
export const conversation = {
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
      scrollToBottom: "하단으로 스크롤",
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
