// ツールパネルコンポーネント
export const tools = {
  // ToolsPanel
  availableTools: '利用可能なツール',
  toolCount: '{count} ツールが利用可能',
  searchTools: 'ツールを検索...',
  noToolsFound: '"{query}" に一致するツールが見つかりません',
  toolsAvailableHint: 'これらのツールはAIがリクエストを処理する際に利用可能です',

  // Tool Detail Modal
  description: '説明',
  parameters: 'パラメータ',
  required: '必須',
  gotIt: '了解',

  // Category
  toolCountInCategory: '{count} ツール',

  // QuickActionsPanel
  quickActions: 'クイックアクション',
  commonTasks: '一般的なタスクとショートカット',
  actions: 'アクション',
  smart: 'スマート',
  upload: 'アップロード',
  searchActions: 'アクションを検索...',
  suggestedForYou: 'おすすめ',
  refreshSuggestions: '提案を更新',
  recentFiles: '最近のファイル',
  typeScriptActions: 'TypeScript アクション',
  analyzeTypes: '型とインターフェースを分析',
  findReactComponents: 'React コンポーネントを検索',
  selectProjectFolder: 'プロジェクトフォルダを選択',
  chooseFolderToAnalyze: '分析するフォルダを選択',
  browseFolders: 'フォルダを参照',
  folderSelected: 'フォルダが選択されました',
  openQuickActions: '{shortcut} でクイックアクションを開く',

  // Quick Actions Categories
  categories: {
    all: 'すべて',
    discovery: '検出',
    code: 'コード',
    analysis: '分析',
    automation: '自動化',
  },

  // Quick Actions Items
  quickActionsItems: {
    findFiles: 'ファイルを検索',
    findFilesDesc: 'パターンでファイルを検索',
    searchCode: 'コードを検索',
    searchCodeDesc: 'ファイル内のテキストを検索',
    explainCode: 'コードの説明',
    explainCodeDesc: 'コードの説明を取得',
    runPython: 'Pythonを実行',
    runPythonDesc: 'Pythonコードを実行',
    analyzeCSV: 'CSVを分析',
    analyzeCSVDesc: 'CSVデータを分析',
    createChart: 'チャートを作成',
    createChartDesc: 'データからチャートを生成',
    batchRename: '一括リネーム',
    batchRenameDesc: '複数ファイルをリネーム',
    convertFiles: 'ファイルを変換',
    convertFilesDesc: 'ファイル形式を変換',
  },

  // SmartSuggestions
  smartSuggestions: 'スマート提案',
  dropFilesToAnalyze: 'ファイルをドロップして分析',
  selectFolderForSuggestions: 'フォルダを選択してパーソナライズされた提案を取得',
  noSuggestionsAvailable: '利用可能な提案がありません',
  suggestions: '提案',
  analyzeProjectCode: 'プロジェクトコードを分析',
  analyzeProjectCodeDesc: '構造、関数、型、依存関係を検査',
  selectProjectFolderShort: 'プロジェクトフォルダを選択',
  selectFolderToAnalyzeShort: '分析するフォルダを選択',

  // InlineSuggestions
  showAvailableTools: '利用可能なすべてのツールと機能を表示',
  findFilesMatchingPattern: 'パターンに一致するファイルを検索',
  searchTextInsideFiles: 'ファイル内のテキストを検索',
  analyzeProjectStructure: 'プロジェクト構造を分析',
  explainHowCodeWorks: 'コードの動作を説明',

  // ToolRecommendations
  recommendedTools: 'おすすめツール',
  basedOnMessage: 'メッセージに基づいて、これらのツールが役立つかもしれません',
  toolSuggestion: '{count} つのツール提案',
  toolSuggestions: '{count} つのツール提案',
  autoSuggestedHint: 'これらのツールは意図に基づいて自動的に提案されます',
  tryLabel: '試す：',
} as const
