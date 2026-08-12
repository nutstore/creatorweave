// 에이전트 관련
export const agent = {
    inputHint: "@를 입력하여 일시적으로 에이전트 전환",
    createNew: "새 에이전트 생성...",
    noAgents: "사용 가능한 에이전트 없음",
    create: "생성",
    delete: "{id} 삭제",
    confirmDelete: '에이전트 "{id}"을(를) 삭제하시겠습니까?',
    thinking: "생각 중...",
    callingTool: "도구 호출 중...",
    callingToolWithName: "{name} 도구 호출 중...",
    mode: {
        plan: "계획",
        act: "실행",
        planDescription: "읽기 전용 모드. 에이전트는 분석과 계획은 가능하지만 파일을 수정할 수 없습니다.",
        actDescription: "전체 접근 모드. 에이전트가 파일을 읽고, 쓰고, 수정할 수 있습니다.",
        planShort: "읽기 전용 분석",
        actShort: "전체 접근 활성화",
        planLabel: "읽기 전용 분석 모드",
        actLabel: "전체 읽기/쓰기 접근",
        switchTo: "전환",
        currentAriaLabel: "현재: {mode} 모드. 클릭하여 전환.",
        switchAriaLabel: "{mode} 모드로 전환",
        planModeTitle: "계획 모드",
        actModeTitle: "실행 모드",
        planReadonly: "읽기 전용",
        actFullAccess: "전체 접근",
    },

    runEndPolicy: {
        manual: "수동 적용",
        auto: "완료 후 자동 적용",
        manualDescription: "검토한 뒤 로컬 폴더에 수정을 적용합니다.",
        autoDescription: "이 설정은 현재 작업 공간에 저장됩니다. 새로 만들기와 편집만 자동 적용되며, 삭제는 항상 수동 확인이 필요합니다.",
        menuLabel: "완료 후 적용 정책",
        currentAriaLabel: "완료 후 적용 정책: {policy}. 클릭하여 변경합니다.",
    },

    toolSearch: {
        aiLabel: "AI",
        aiSearchInProgress: "AI 시맨틱 검색 중...",
        aiSearchBadge: "AI 시맨틱 검색",
        bm25Fallback: "BM25 대체",
    },
    folderTip: {
        title: "로컬 폴더 열기",
        description:
            "폴더 권한을 부여하면 AI가 파일을 읽고 편집하고 로컬에 저장할 수 있습니다.",
        selectFolder: "폴더 선택",
        later: "나중에",
    },

    // 대화 검색 도구
    searchConversations: {
        failed: "실패",
        modeKeyword: "키워드",
        modeList: "목록",
        match_one: "{count}개 일치",
        match_other: "{count}개 일치",
        noResults: "일치하는 대화가 없습니다.",
        projectsHeader: "프로젝트 ({count})",
        fullDay: "하루 종일",
        moreResults: "+{count}개 더 (총 {total}개)",
        moreAvailable: "더 많은 결과 사용 가능",
        untitled: "(제목 없음)",
    },

    // Mermaid 다이어그램 렌더러
    mermaid: {
        preparing: "다이어그램 준비 중…",
        rendering: "다이어그램 렌더링 중…",
        syntaxError: "Mermaid 구문 오류 — 소스 표시",
        preview: "미리보기",
        source: "소스",
        copy: "복사",
        copied: "복사됨",
        copySource: "소스 복사",
        zoom: {
            zoomOut: "축소",
            zoomIn: "확대",
            resetPercent: "초기 보기로 복원",
            fitToWindow: "창에 맞춤",
            fitToWindowTitle: "창에 맞춤 (전체가 보이도록 축척)",
            reset: "재설정",
            resetTitle: "보기 재설정",
        },
    },
} as const
