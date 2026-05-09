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
} as const
