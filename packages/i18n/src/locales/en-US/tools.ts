// Tools Panel component
export const tools = {
  // ToolsPanel
  availableTools: 'Available Tools',
  toolCount: '{count} tools available',
  searchTools: 'Search tools...',
  noToolsFound: 'No tools found matching "{query}"',
  toolsAvailableHint: 'These tools are available to the AI when processing your requests',

  // Tool Detail Modal
  description: 'Description',
  parameters: 'Parameters',
  required: 'required',
  gotIt: 'Got it',

  // Category
  toolCountInCategory: '{count} tools',

  // QuickActionsPanel
  quickActions: 'Quick Actions',
  commonTasks: 'Common tasks and shortcuts',
  actions: 'Actions',
  smart: 'Smart',
  upload: 'Upload',
  searchActions: 'Search actions...',
  suggestedForYou: 'Suggested for You',
  refreshSuggestions: 'Refresh suggestions',
  recentFiles: 'Recent Files',
  typeScriptActions: 'TypeScript Actions',
  analyzeTypes: 'Analyze Types & Interfaces',
  findReactComponents: 'Find React Components',
  selectProjectFolder: 'Select Project Folder',
  chooseFolderToAnalyze: 'Choose a folder to analyze its contents',
  browseFolders: 'Browse Folders',
  folderSelected: 'Folder Selected',
  openQuickActions: 'Press {shortcut} to open quick actions',

  // Quick Actions Categories
  categories: {
    all: 'All',
    discovery: 'Discovery',
    code: 'Code',
    analysis: 'Analysis',
    automation: 'Automation',
  },

  // Quick Actions Items
  quickActionsItems: {
    findFiles: 'Find Files',
    findFilesDesc: 'Search for files by pattern',
    searchCode: 'Search Code',
    searchCodeDesc: 'Search for text in files',
    explainCode: 'Explain Code',
    explainCodeDesc: 'Get an explanation of code',
    runPython: 'Run Python',
    runPythonDesc: 'Execute Python code',
    analyzeCSV: 'Analyze CSV',
    analyzeCSVDesc: 'Analyze CSV data',
    createChart: 'Create Chart',
    createChartDesc: 'Generate charts from data',
    batchRename: 'Batch Rename',
    batchRenameDesc: 'Rename multiple files',
    convertFiles: 'Convert Files',
    convertFilesDesc: 'Convert file formats',
  },

  // SmartSuggestions
  smartSuggestions: 'Smart Suggestions',
  dropFilesToAnalyze: 'Drop files to analyze',
  selectFolderForSuggestions: 'Select a folder to get personalized suggestions',
  noSuggestionsAvailable: 'No suggestions available',
  suggestions: 'Suggestions',
  analyzeProjectCode: 'Analyze Project Code',
  analyzeProjectCodeDesc: 'Inspect structure, functions, types, and dependencies',
  selectProjectFolderShort: 'Select Project Folder',
  selectFolderToAnalyzeShort: 'Choose a folder to analyze',

  // InlineSuggestions
  showAvailableTools: 'Show me all available tools and capabilities',
  findFilesMatchingPattern: 'Find all files matching a pattern',
  searchTextInsideFiles: 'Search for text inside files',
  analyzeProjectStructure: 'Analyze the project structure',
  explainHowCodeWorks: 'Explain how the code works',

  // ToolRecommendations
  recommendedTools: 'Recommended Tools',
  basedOnMessage: 'Based on your message, these tools might help',
  toolSuggestion: '{count} tool suggestion',
  toolSuggestions: '{count} tool suggestions',
  autoSuggestedHint: 'These tools are automatically suggested based on your intent',
  tryLabel: 'Try:',
} as const
