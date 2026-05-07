export const commandPalette = {
    title: "Command Palette",
    placeholder: "Type a command or search...",
    noResults: 'No commands found for "{query}"',
    navigate: "Navigate",
    select: "Select",
    close: "Close",
    general: "General",
    categories: {
      conversations: "Conversations",
      files: "Files",
      developer: "Developer",
      dataAnalyst: "Data Analyst",
      student: "Student",
      office: "Office",
      view: "View",
      tools: "Tools",
      settings: "Settings",
      help: "Help",
    },
    commands: {
      "new-conversation": {
        label: "New Conversation",
        description: "Start a new conversation",
      },
      "continue-last": {
        label: "Continue Last Conversation",
        description: "Return to your most recent conversation",
      },
      "open-file": {
        label: "Open File...",
        description: "Open a file from your workspace",
      },
      "recent-files": {
        label: "Recent Files",
        description: "View recently accessed files",
      },
      "analyze-code": {
        label: "Analyze Code",
        description: "Analyze code structure and quality",
      },
      "find-bugs": {
        label: "Find Potential Bugs",
        description: "Search for code smells and potential issues",
      },
      "refactor-code": {
        label: "Suggest Refactoring",
        description: "Get refactoring suggestions for selected code",
      },
      "explain-code": {
        label: "Explain Code",
        description: "Get detailed explanation of code functionality",
      },
      "search-code": {
        label: "Search in Codebase",
        description: "Find patterns and references across files",
      },
      "analyze-data": {
        label: "Analyze Data",
        description: "Process and analyze loaded data",
      },
      "generate-chart": {
        label: "Generate Visualization",
        description: "Create charts from data",
      },
      "run-statistics": {
        label: "Run Statistical Tests",
        description: "Perform statistical analysis",
      },
      "data-summary": {
        label: "Data Summary",
        description: "Generate summary statistics",
      },
      "export-data": {
        label: "Export Results",
        description: "Export analysis results",
      },
      "export-csv": {
        label: "Export as CSV",
        description: "Export data to CSV format",
      },
      "export-json": {
        label: "Export as JSON",
        description: "Export data to JSON format",
      },
      "export-excel": {
        label: "Export as Excel",
        description: "Export data to Excel workbook",
      },
      "export-chart-image": {
        label: "Export Chart as Image",
        description: "Export chart to PNG image",
      },
      "export-pdf": {
        label: "Export as PDF",
        description: "Export report to PDF format",
      },
      "export-code-review-pdf": {
        label: "Export Code Review as PDF",
        description: "Export code review results to PDF",
      },
      "export-test-report-pdf": {
        label: "Export Test Report as PDF",
        description: "Export test generation results to PDF",
      },
      "export-project-analysis-pdf": {
        label: "Export Project Analysis as PDF",
        description: "Export project analysis to PDF",
      },
      "explain-concept": {
        label: "Explain Concept",
        description: "Get educational explanation of a concept",
      },
      "create-study-plan": {
        label: "Create Study Plan",
        description: "Generate a personalized learning plan",
      },
      "solve-problem": {
        label: "Solve Step by Step",
        description: "Work through a problem with guidance",
      },
      "process-excel": {
        label: "Process Excel File",
        description: "Read and process Excel spreadsheets",
      },
      "query-data": {
        label: "Query Data",
        description: "Query data using natural language",
      },
      "transform-data": {
        label: "Transform Data",
        description: "Clean and transform data",
      },
      "toggle-sidebar": {
        label: "Toggle Sidebar",
        description: "Show or hide the sidebar",
      },
      "toggle-theme": {
        label: "Toggle Theme",
        description: "Switch between light and dark mode",
      },
      "open-skills": {
        label: "Skills Manager",
        description: "Manage your skills",
      },
      "open-tools": {
        label: "Tools Panel",
        description: "Open tools panel",
      },
      "open-mcp": {
        label: "MCP Services",
        description: "Manage MCP services",
      },
      "workspace-settings": {
        label: "Workspace Settings",
        description: "Configure workspace preferences",
      },
      "keyboard-shortcuts": {
        label: "Keyboard Shortcuts",
        description: "View all keyboard shortcuts",
      },
    },
} as const
