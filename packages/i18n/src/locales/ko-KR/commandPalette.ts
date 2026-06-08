// 명령 팔레트
export const commandPalette = {
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
} as const
