// 도구 패널 컴포넌트
export const tools = {
  // ToolsPanel
  availableTools: '사용 가능한 도구',
  toolCount: '{count}개 도구 사용 가능',
  searchTools: '도구 검색...',
  noToolsFound: '"{query}"와 일치하는 도구를 찾을 수 없습니다',
  toolsAvailableHint: '이 도구들은 AI가 요청을 처리할 때 사용할 수 있습니다',

  // Tool Detail Modal
  description: '설명',
  parameters: '매개변수',
  required: '필수',
  gotIt: '확인',

  // Category
  toolCountInCategory: '{count}개 도구',

  // QuickActionsPanel
  quickActions: '빠른 작업',
  commonTasks: '일반 작업 및 바로 가기',
  actions: '작업',
  smart: '스마트',
  upload: '업로드',
  searchActions: '작업 검색...',
  suggestedForYou: '추천',
  refreshSuggestions: '추천 새로고침',
  recentFiles: '최근 파일',
  typeScriptActions: 'TypeScript 작업',
  analyzeTypes: '타입 및 인터페이스 분석',
  findReactComponents: 'React 컴포넌트 찾기',
  selectProjectFolder: '프로젝트 폴더 선택',
  chooseFolderToAnalyze: '분석할 폴더 선택',
  browseFolders: '폴더 찾아보기',
  folderSelected: '폴더 선택됨',
  openQuickActions: '{shortcut}으로 빠른 작업 열기',

  // Quick Actions Categories
  categories: {
    all: '전체',
    discovery: '검색',
    code: '코드',
    analysis: '분석',
    automation: '자동화',
  },

  // Quick Actions Items
  quickActionsItems: {
    findFiles: '파일 찾기',
    findFilesDesc: '패턴으로 파일 검색',
    searchCode: '코드 검색',
    searchCodeDesc: '파일에서 텍스트 검색',
    explainCode: '코드 설명',
    explainCodeDesc: '코드 설명 받기',
    runPython: 'Python 실행',
    runPythonDesc: 'Python 코드 실행',
    analyzeCSV: 'CSV 분석',
    analyzeCSVDesc: 'CSV 데이터 분석',
    createChart: '차트 만들기',
    createChartDesc: '데이터에서 차트 생성',
    batchRename: '일괄 이름 변경',
    batchRenameDesc: '여러 파일 이름 변경',
    convertFiles: '파일 변환',
    convertFilesDesc: '파일 형식 변환',
  },

  // SmartSuggestions
  smartSuggestions: '스마트 제안',
  dropFilesToAnalyze: '파일을 드롭하여 분석',
  selectFolderForSuggestions: '폴더를 선택하여 맞춤 제안 받기',
  noSuggestionsAvailable: '사용 가능한 제안이 없습니다',
  suggestions: '제안',
  analyzeProjectCode: '프로젝트 코드 분석',
  analyzeProjectCodeDesc: '구조, 함수, 타입, 종속성 검사',
  selectProjectFolderShort: '프로젝트 폴더 선택',
  selectFolderToAnalyzeShort: '분석할 폴더 선택',

  // InlineSuggestions
  showAvailableTools: '사용 가능한 모든 도구 및 기능 표시',
  findFilesMatchingPattern: '패턴과 일치하는 파일 찾기',
  searchTextInsideFiles: '파일 내 텍스트 검색',
  analyzeProjectStructure: '프로젝트 구조 분석',
  explainHowCodeWorks: '코드 작동 방식 설명',

  // ToolRecommendations
  recommendedTools: '추천 도구',
  basedOnMessage: '메시지를 기반으로 이 도구들이 도움이 될 수 있습니다',
  toolSuggestion: '{count}개 도구 제안',
  toolSuggestions: '{count}개 도구 제안',
  autoSuggestedHint: '이 도구들은 의도를 기반으로 자동 제안됩니다',
  tryLabel: '시도：',
} as const
