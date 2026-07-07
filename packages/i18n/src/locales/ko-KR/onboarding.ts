export const onboarding = {
    dontShowAgain: "다시 표시하지 않기",
    previous: "이전",
    next: "다음",
    complete: "완료",
    skip: "건너뛰기",
    stepProgress: "단계 {current} / {total}",
    steps: {
      model: {
        title: "AI 모델 연결",
        description: "가장 적합한 방법을 선택하세요",
        done: "모델이 준비되었습니다",
        pending: "아래 버튼을 클릭하여 설정",
      },
      firstMessage: {
        title: "첫 번째 메시지 보내기",
        description: "입력 상자에 입력하거나 아래 예시를 사용해보세요",
        tip: "AI가 즉시 응답을 시작합니다",
      },
      files: {
        title: "AI가 파일 읽기",
        description: "인증 후, AI가 지정된 로컬 파일을 읽고 쓸 수 있습니다",
        tip: "사이드바의「폴더 열기」클릭",
      },
      explore: {
        title: "더 많은 기능 탐색",
        description: "⌘K로 명령 팔레트를 열어 스킬, 스케줄 등을 발견하세요",
        tip: "명령 팔레트에서 언제든 모든 기능에 접근할 수 있습니다",
      },
    },
} as const
