/* eslint-disable react-refresh/only-export-components */
/**
 * Enhanced Command Palette Commands
 *
 * Comprehensive command set for all user personas:
 * - Developers: code analysis, refactoring, debugging
 * - Data Analysts: data processing, visualization, statistics
 * - Students: learning, problem-solving
 * - Office Workers: document processing, automation
 *
 * @module command-palette-commands
 */

import {
  FileCode,
  BarChart2,
  BookOpen,
  Briefcase,
  Search,
  RefreshCw,
  Plus,
  Save,
  Settings,
  HelpCircle,
  Folder,
  History,
  Terminal,
  Sparkles,
  Layout,
  Moon,
  FileText,
  FileJson,
  FileSpreadsheet,
  Image,
  FileType,
} from 'lucide-react'
import type { Command } from './CommandPalette'

// ============================================================================
// Command Categories
// ============================================================================

export const COMMAND_CATEGORIES = {
  CONVERSATIONS: 'Conversations',
  FILES: 'Files',
  DEVELOPER: 'Developer',
  DATA_ANALYST: 'Data Analyst',
  STUDENT: 'Student',
  OFFICE: 'Office',
  VIEW: 'View',
  TOOLS: 'Tools',
  SETTINGS: 'Settings',
  HELP: 'Help',
} as const

// ============================================================================
// Command Builders
// ============================================================================

/**
 * Build all enhanced commands for the palette
 */
export function buildEnhancedCommands(handlers: CommandHandlers): Command[] {
  return [
    // ========== Conversations ==========
    {
      id: 'new-conversation',
      label: 'New Conversation',
      description: 'Start a new conversation',
      category: COMMAND_CATEGORIES.CONVERSATIONS,
      icon: <Plus className="h-4 w-4" />,
      keywords: ['create', 'new', 'chat', 'conversation'],
      handler: handlers.onNewConversation,
    },
    {
      id: 'continue-last',
      label: 'Continue Last Conversation',
      description: 'Return to your most recent conversation',
      category: COMMAND_CATEGORIES.CONVERSATIONS,
      icon: <History className="h-4 w-4" />,
      keywords: ['recent', 'last', 'previous', 'resume'],
      handler: handlers.onContinueLast,
    },

    // ========== Files ==========
    {
      id: 'open-file',
      label: 'Open File...',
      description: 'Open a file from your workspace',
      category: COMMAND_CATEGORIES.FILES,
      icon: <Folder className="h-4 w-4" />,
      keywords: ['open', 'file', 'browse', 'select'],
      handler: handlers.onOpenFile,
    },
    {
      id: 'recent-files',
      label: 'Recent Files',
      description: 'View recently accessed files',
      category: COMMAND_CATEGORIES.FILES,
      icon: <History className="h-4 w-4" />,
      keywords: ['recent', 'history', 'accessed'],
      handler: handlers.onShowRecentFiles,
    },

    // ========== Developer ==========
    {
      id: 'analyze-code',
      label: 'Analyze Code',
      description: 'Analyze code structure and quality',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <FileCode className="h-4 w-4" />,
      keywords: ['analyze', 'code', 'structure', 'quality', 'review'],
      handler: () =>
        handlers.onSendMessage(
          'Analyze the code in this workspace. What is the project structure?'
        ),
    },
    {
      id: 'find-bugs',
      label: 'Find Potential Bugs',
      description: 'Search for code smells and potential issues',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <Search className="h-4 w-4" />,
      keywords: ['bug', 'issue', 'smell', 'problem', 'error', 'debug'],
      handler: () => handlers.onSendMessage('Find potential bugs and code smells in this project.'),
    },
    {
      id: 'refactor-code',
      label: 'Suggest Refactoring',
      description: 'Get refactoring suggestions for selected code',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <RefreshCw className="h-4 w-4" />,
      keywords: ['refactor', 'improve', 'optimize', 'clean'],
      handler: () => handlers.onSendMessage('Suggest refactoring opportunities for this codebase.'),
    },
    {
      id: 'explain-code',
      label: 'Explain Code',
      description: 'Get detailed explanation of code functionality',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <Terminal className="h-4 w-4" />,
      keywords: ['explain', 'understand', 'documentation', 'how it works'],
      handler: () => handlers.onSendMessage('Explain how the code works in detail.'),
    },
    {
      id: 'search-code',
      label: 'Search in Codebase',
      description: 'Find patterns and references across files',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <Search className="h-4 w-4" />,
      keywords: ['search', 'find', 'grep', 'pattern', 'reference'],
      handler: () => handlers.onSendMessage('Search for a pattern in the codebase.'),
    },

    // ========== Data Analyst ==========
    {
      id: 'analyze-data',
      label: 'Analyze Data',
      description: 'Process and analyze loaded data',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <BarChart2 className="h-4 w-4" />,
      keywords: ['data', 'analyze', 'statistics', 'insights'],
      handler: () => handlers.onSendMessage('Analyze the loaded data and provide insights.'),
    },
    {
      id: 'generate-chart',
      label: 'Generate Visualization',
      description: 'Create charts from data',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <Sparkles className="h-4 w-4" />,
      keywords: ['chart', 'visualize', 'plot', 'graph', 'figure'],
      handler: () => handlers.onSendMessage('Create a visualization from the data.'),
    },
    {
      id: 'run-statistics',
      label: 'Run Statistical Tests',
      description: 'Perform statistical analysis',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <BarChart2 className="h-4 w-4" />,
      keywords: ['statistics', 'test', 'correlation', 'anova', 'chi-square'],
      handler: () => handlers.onSendMessage('Run statistical tests on the data.'),
    },
    {
      id: 'data-summary',
      label: 'Data Summary',
      description: 'Generate summary statistics',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <BarChart2 className="h-4 w-4" />,
      keywords: ['summary', 'statistics', 'overview', 'describe'],
      handler: () => handlers.onSendMessage('Generate summary statistics for the data.'),
    },
    {
      id: 'export-data',
      label: 'Export Results',
      description: 'Export analysis results',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <Save className="h-4 w-4" />,
      keywords: ['export', 'save', 'download', 'csv', 'excel'],
      handler: () => handlers.onSendMessage('Export the analysis results.'),
    },
    {
      id: 'export-csv',
      label: 'Export as CSV',
      description: 'Export data to CSV format',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <FileText className="h-4 w-4" />,
      keywords: ['export', 'csv', 'comma', 'separated'],
      handler: () => handlers.onSendMessage('Export the current data to CSV format.'),
    },
    {
      id: 'export-json',
      label: 'Export as JSON',
      description: 'Export data to JSON format',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <FileJson className="h-4 w-4" />,
      keywords: ['export', 'json', 'structured'],
      handler: () => handlers.onSendMessage('Export the current data to JSON format.'),
    },
    {
      id: 'export-excel',
      label: 'Export as Excel',
      description: 'Export data to Excel workbook',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <FileSpreadsheet className="h-4 w-4" />,
      keywords: ['export', 'excel', 'xlsx', 'spreadsheet'],
      handler: () => handlers.onSendMessage('Export the current data to Excel format.'),
    },
    {
      id: 'export-chart-image',
      label: 'Export Chart as Image',
      description: 'Export chart to PNG image',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <Image className="h-4 w-4" />,
      keywords: ['export', 'chart', 'image', 'png', 'picture'],
      handler: () => handlers.onSendMessage('Export the current chart as a PNG image.'),
    },
    {
      id: 'export-pdf',
      label: 'Export as PDF',
      description: 'Export report to PDF format',
      category: COMMAND_CATEGORIES.DATA_ANALYST,
      icon: <FileType className="h-4 w-4" />,
      keywords: ['export', 'pdf', 'document', 'report'],
      handler: () =>
        handlers.onSendMessage('Export the current analysis or report as a PDF document.'),
    },
    {
      id: 'export-code-review-pdf',
      label: 'Export Code Review as PDF',
      description: 'Export code review results to PDF',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <FileType className="h-4 w-4" />,
      keywords: ['export', 'pdf', 'code', 'review', 'report'],
      handler: () => handlers.onSendMessage('Export the code review results as a PDF report.'),
    },
    {
      id: 'export-test-report-pdf',
      label: 'Export Test Report as PDF',
      description: 'Export test generation results to PDF',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <FileType className="h-4 w-4" />,
      keywords: ['export', 'pdf', 'test', 'report'],
      handler: () => handlers.onSendMessage('Export the test generation results as a PDF report.'),
    },
    {
      id: 'export-project-analysis-pdf',
      label: 'Export Project Analysis as PDF',
      description: 'Export project analysis to PDF',
      category: COMMAND_CATEGORIES.DEVELOPER,
      icon: <FileType className="h-4 w-4" />,
      keywords: ['export', 'pdf', 'project', 'analysis', 'report'],
      handler: () => handlers.onSendMessage('Export the project analysis summary as a PDF report.'),
    },

    // ========== Student ==========
    {
      id: 'explain-concept',
      label: 'Explain Concept',
      description: 'Get educational explanation of a concept',
      category: COMMAND_CATEGORIES.STUDENT,
      icon: <BookOpen className="h-4 w-4" />,
      keywords: ['explain', 'learn', 'teach', 'concept', 'understand'],
      handler: () => handlers.onSendMessage('Explain this concept in an educational way.'),
    },
    {
      id: 'create-study-plan',
      label: 'Create Study Plan',
      description: 'Generate a personalized learning plan',
      category: COMMAND_CATEGORIES.STUDENT,
      icon: <BookOpen className="h-4 w-4" />,
      keywords: ['study', 'plan', 'learn', 'schedule', 'roadmap'],
      handler: () => handlers.onSendMessage('Create a study plan for learning this topic.'),
    },
    {
      id: 'solve-problem',
      label: 'Solve Step by Step',
      description: 'Work through a problem with guidance',
      category: COMMAND_CATEGORIES.STUDENT,
      icon: <BookOpen className="h-4 w-4" />,
      keywords: ['solve', 'problem', 'step', 'guide', 'tutorial'],
      handler: () => handlers.onSendMessage('Help me solve this problem step by step.'),
    },

    // ========== Office ==========
    {
      id: 'process-excel',
      label: 'Process Excel File',
      description: 'Read and process Excel spreadsheets',
      category: COMMAND_CATEGORIES.OFFICE,
      icon: <Briefcase className="h-4 w-4" />,
      keywords: ['excel', 'spreadsheet', 'read', 'process'],
      handler: () =>
        handlers.onSendMessage('Process the Excel file and extract useful information.'),
    },
    {
      id: 'query-data',
      label: 'Query Data',
      description: 'Query data using natural language',
      category: COMMAND_CATEGORIES.OFFICE,
      icon: <Briefcase className="h-4 w-4" />,
      keywords: ['query', 'ask', 'question', 'data'],
      handler: () => handlers.onSendMessage('Answer this question about the data.'),
    },
    {
      id: 'transform-data',
      label: 'Transform Data',
      description: 'Clean and transform data',
      category: COMMAND_CATEGORIES.OFFICE,
      icon: <RefreshCw className="h-4 w-4" />,
      keywords: ['transform', 'clean', 'convert', 'format', 'aggregate'],
      handler: () => handlers.onSendMessage('Transform this data as requested.'),
    },

    // ========== View ==========
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      description: 'Show or hide the sidebar',
      category: COMMAND_CATEGORIES.VIEW,
      icon: <Layout className="h-4 w-4" />,
      keywords: ['sidebar', 'panel', 'navigation', 'toggle'],
      handler: handlers.onToggleSidebar,
    },
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      description: 'Switch between light and dark mode',
      category: COMMAND_CATEGORIES.VIEW,
      icon: <Moon className="h-4 w-4" />,
      keywords: ['theme', 'dark', 'light', 'mode'],
      handler: handlers.onToggleTheme,
    },

    // ========== Tools ==========
    {
      id: 'open-skills',
      label: 'Skills Manager',
      description: 'Manage your skills',
      category: COMMAND_CATEGORIES.TOOLS,
      icon: <Sparkles className="h-4 w-4" />,
      keywords: ['skills', 'manage', 'extensions'],
      handler: handlers.onOpenSkills,
    },
    {
      id: 'open-tools',
      label: 'Tools Panel',
      description: 'Open tools panel',
      category: COMMAND_CATEGORIES.TOOLS,
      icon: <Settings className="h-4 w-4" />,
      keywords: ['tools', 'panel', 'actions'],
      handler: handlers.onOpenTools,
    },
    {
      id: 'open-mcp',
      label: 'MCP Services',
      description: 'Manage MCP services',
      category: COMMAND_CATEGORIES.TOOLS,
      icon: <Settings className="h-4 w-4" />,
      keywords: ['mcp', 'services', 'extensions'],
      handler: handlers.onOpenMCP,
    },

    // ========== Settings ==========
    {
      id: 'workspace-settings',
      label: 'Workspace Settings',
      description: 'Configure workspace preferences',
      category: COMMAND_CATEGORIES.SETTINGS,
      icon: <Settings className="h-4 w-4" />,
      keywords: ['settings', 'preferences', 'config'],
      handler: handlers.onOpenSettings,
    },

    // ========== Help ==========
    {
      id: 'keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      category: COMMAND_CATEGORIES.HELP,
      icon: <HelpCircle className="h-4 w-4" />,
      keywords: ['shortcuts', 'keyboard', 'hotkeys', 'help'],
      handler: handlers.onShowShortcuts,
    },
  ]
}

// ============================================================================
// Command Handlers Interface
// ============================================================================

export interface CommandHandlers {
  // Conversations
  onNewConversation: () => void
  onContinueLast: () => void

  // Files
  onOpenFile: () => void
  onShowRecentFiles: () => void

  // View
  onToggleSidebar: () => void
  onToggleTheme: () => void

  // Tools
  onOpenSkills: () => void
  onOpenTools: () => void
  onOpenMCP: () => void

  // Settings & Help
  onOpenSettings: () => void
  onShowShortcuts: () => void

  // Messages
  onSendMessage: (text: string) => void
}

// ============================================================================
// Default Handlers (stub implementations)
// ============================================================================

export function createDefaultHandlers(overrides: Partial<CommandHandlers> = {}): CommandHandlers {
  const defaultHandlers: CommandHandlers = {
    onNewConversation: () => console.log('[CommandPalette] New conversation'),
    onContinueLast: () => console.log('[CommandPalette] Continue last conversation'),
    onOpenFile: () => console.log('[CommandPalette] Open file dialog'),
    onShowRecentFiles: () => console.log('[CommandPalette] Show recent files'),
    onToggleSidebar: () => console.log('[CommandPalette] Toggle sidebar'),
    onToggleTheme: () => console.log('[CommandPalette] Toggle theme'),
    onOpenSkills: () => console.log('[CommandPalette] Open skills manager'),
    onOpenTools: () => console.log('[CommandPalette] Open tools panel'),
    onOpenMCP: () => console.log('[CommandPalette] Open MCP settings'),
    onOpenSettings: () => console.log('[CommandPalette] Open settings'),
    onShowShortcuts: () => console.log('[CommandPalette] Show shortcuts'),
    onSendMessage: (text: string) => console.log('[CommandPalette] Send message:', text),
  }

  return { ...defaultHandlers, ...overrides }
}
