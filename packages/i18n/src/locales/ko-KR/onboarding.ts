// 온보딩
export const onboarding = {
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
} as const
