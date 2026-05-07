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
} as const
