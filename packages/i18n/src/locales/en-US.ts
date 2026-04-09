export const enUS = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    close: 'Close',
    search: 'Search',
    refresh: 'Refresh',
    loading: 'Loading...',
    processing: 'Processing...',
    error: 'Error',
    success: 'Success',
    copy: 'Copy',
    copied: 'Copied',
  },

  // App Initialization
  app: {
    initializing: 'Initializing...',
    preparing: 'Preparing...',
    loadProgress: 'Load Progress',
    firstLoadHint: 'First load may take a few seconds',
    productName: 'AI Workspace',
    initComplete: 'Initialization complete',
    initFailed: 'Initialization failed',
    sessionStorageOnly: 'Data is saved for current session only, will be lost on refresh',
    localStorageMode: 'Using local storage mode',
    migrationInProgress: 'Migrating data',
    migrationComplete: 'Migration complete',
    conversationsMigrated: '{count} conversations',
  },

  topbar: {
    productName: 'AI Workspace',
    openFolder: 'Open Folder',
    switchFolder: 'Switch Project Folder',
    noApiKey: 'No API Key',
    settings: 'Settings',
    skillsManagement: 'Skills',
    projectLabel: 'Project: {name}',
    workspaceLabel: 'Workspace: {name}',
    tooltips: {
      backToProjects: 'Back to Project List',
      menu: 'Menu',
      openApiKeySettings: 'Open API Key Settings',
      workspaceSettings: 'Workspace Layout & Preferences',
      toolsPanel: 'Tools Panel',
      commandPalette: 'Command Palette (Cmd/Ctrl+K)',
      skillsManager: 'Skills Manager',
      mcpSettings: 'MCP Service Settings',
      appSettings: 'App Settings',
      docs: 'Documentation',
    },
    projectSwitcher: {
      createProject: 'New Project',
      manageProjects: 'Manage All Projects',
      noProjects: 'No projects yet',
      workspaceCount: '{count} workspaces',
      shortcut: '⌘P',
    },
  },

  // Folder Selector
  folderSelector: {
    openFolder: 'Select Folder',
    switchFolder: 'Switch Folder',
    releaseHandle: 'Release Handle',
    copyPath: 'Copy Folder Name',
    permissionDenied: 'Permission denied',
    selectionFailed: 'Selection failed',
    // Persistent storage
    storageWarning: 'Cache',
    storageTooltip: 'Persistent storage not granted. Click to retry. Cache may be cleared on refresh.',
    storageSuccess: 'Storage persisted',
    storageFailed: 'Cannot get persistent storage',
    storageRequestFailed: 'Request failed',
  },

  settings: {
    title: 'Settings',
    llmProvider: 'LLM Provider',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'Enter API Key...',
    save: 'Save',
    saved: 'Saved',
    apiKeyNote: 'Key is encrypted with AES-256 and stored locally',
    modelName: 'Model Name',
    temperature: 'Temperature',
    maxTokens: 'Max Tokens',

    providers: {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      groq: 'Groq',
      mistral: 'Mistral',
      glm: 'Zhipu GLM',
      'glm-coding': 'Zhipu GLM (Coding)',
      kimi: 'Kimi (Moonshot)',
      minimax: 'MiniMax',
      qwen: 'Qwen',
      custom: 'Custom (OpenAI Compatible)',
    },
  },

  workspaceSettings: {
    title: 'Workspace Settings',
    close: 'Close',
    done: 'Done',
    tabs: {
      layout: 'Layout',
      display: 'Display',
      shortcuts: 'Shortcuts',
      data: 'Data',
    },
    layout: {
      title: 'Layout Settings',
      description: 'Adjust panel sizes and ratios in your workspace',
      sidebarWidth: 'Sidebar Width: {value}px',
      conversationArea: 'Conversation Area: {value}%',
      previewPanel: 'Preview Panel: {value}%',
      resetLayout: 'Reset Layout',
      resetLayoutConfirm: 'Are you sure you want to reset layout settings?',
    },
    display: {
      themeTitle: 'Theme Settings',
      themeDescription: 'Choose your preferred interface theme',
      theme: {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
      },
      editorTitle: 'Editor Display',
      editorDescription: 'Configure editor appearance and behavior',
      fontSize: 'Font Size',
      font: {
        small: 'Small',
        medium: 'Medium',
        large: 'Large',
      },
      showLineNumbers: 'Show Line Numbers',
      wordWrap: 'Word Wrap',
      showMiniMap: 'Show Mini Map',
    },
    shortcuts: {
      title: 'Shortcuts',
      description: 'Manage and view keyboard shortcuts',
      showAllTitle: 'View All Shortcuts',
      showAllDescription: 'Open the keyboard shortcuts help panel',
      view: 'View',
      tipLabel: 'Tip:',
      tipCommand: '/key',
      tipSuffix: 'to quickly open the shortcuts list.',
    },
    data: {
      title: 'Data Management',
      description: 'Manage recent files and workspace preferences',
      recentFilesTitle: 'Recent Files',
      recentFilesCount: '{count} file(s) total',
      clear: 'Clear',
      clearRecentConfirm: 'Are you sure you want to clear recent files?',
      warningTitle: 'Warning:',
      warningDescription: 'The following actions will affect current workspace settings.',
      resetAllTitle: 'Reset All Preferences',
      resetAllDescription: 'Restore layout, display, and editor settings to defaults.',
      resetAll: 'Reset All',
      resetAllConfirm: 'Are you sure you want to reset all workspace preferences?',
    },
  },

  welcome: {
    title: 'AI Workspace',
    tagline: 'AI-Native Creator Workspace for Knowledge & Multi-Agent Flows',
    placeholder: 'Type a message to start...',
    placeholderNoKey: 'Please configure API Key in settings first',
    send: 'Send',
    openLocalFolder: 'Open Local Folder',
    recentHint: 'Select a conversation from the left, or type to start a new one',
    viewCapabilities: 'View Capabilities',
    personas: {
      developer: {
        title: 'Developer',
        description: 'Code understanding, debugging, refactoring',
        examples: {
          0: 'Explain how this function works',
          1: 'Find bugs in this code',
          2: 'Refactor for better performance',
        },
      },
      analyst: {
        title: 'Data Analyst',
        description: 'Data processing, visualization, insights',
        examples: {
          0: 'Analyze sales data in CSV',
          1: 'Create charts from Excel',
          2: 'Summarize key metrics',
        },
      },
      researcher: {
        title: 'Student / Researcher',
        description: 'Document reading, learning, knowledge organization',
        examples: {
          0: 'Summarize this documentation',
          1: 'Explain technical concepts',
          2: 'Find information across files',
        },
      },
      office: {
        title: 'Office Worker',
        description: 'Document processing, reporting, content creation',
        examples: {
          0: 'Draft a report from data',
          1: 'Format and organize documents',
          2: 'Process multiple files',
        },
      },
    },
  },

  skills: {
    title: 'Skills Manager',
    searchPlaceholder: 'Search skills by name, description or tags...',
    filterAll: 'All',
    filterEnabled: 'Enabled',
    filterDisabled: 'Disabled',
    projectSkills: 'Project Skills',
    mySkills: 'My Skills',
    builtinSkills: 'Builtin Skills',
    enabledCount: '{count} / {total} enabled',
    createNew: 'Create Skill',
    deleteConfirm: 'Are you sure you want to delete this skill?',
    edit: 'Edit',
    delete: 'Delete',
    enabled: 'Enabled',
    disabled: 'Disabled',
    empty: 'No skills',
    // Skill categories
    categories: {
      codeReview: 'Code Review',
      testing: 'Testing',
      debugging: 'Debugging',
      refactoring: 'Refactoring',
      documentation: 'Documentation',
      security: 'Security',
      performance: 'Performance',
      architecture: 'Architecture',
      general: 'General',
    },
    // Project Skills Discovery Dialog
    projectDialog: {
      title: 'Project Skills Discovered',
      description: 'Discovered {count} skill(s) in the project. Load them into the workspace?',
      selectAll: 'Select All',
      deselectAll: 'Deselect All',
      selected: 'Selected',
      load: 'Load',
      loadAll: 'Load All',
      skip: 'Skip',
    },
  },

  remote: {
    title: 'Remote Control',
    label: 'Remote',
    host: 'HOST',
    remote: 'REMOTE',
    disconnect: 'Disconnect',
    showQrCode: 'Show QR Code',
    waitingForRemote: 'Waiting for remote device...',
    // Remote Control Panel
    relayServer: 'Relay Server',
    scanToConnect: 'Scan with mobile to connect',
    scanHint: 'Scan QR code or open link on mobile device',
    copySessionId: 'Copy session ID',
    copied: 'Copied!',
    clickToCreate: 'Click "Create Session" to generate QR code',
    connected: 'Connected',
    connecting: 'Connecting...',
    peers: '{count} peer(s)',
    createSession: 'Create Session',
    cancel: 'Cancel',
    direct: 'Direct',
  },

  session: {
    current: 'Current Session',
    switch: 'Switch Session',
    new: 'New Session',
    delete: 'Delete Session',
    deleteConfirm: 'Are you sure you want to delete this session?',
    storageLocation: 'Storage Location',
    // Status
    notInitialized: 'Not Initialized',
    unknownSession: 'Unknown Session',
    initializing: 'Initializing...',
    noSession: 'No Session',
    pendingCount: '{count} pending',
    undoCount: '{count} undo',
    pendingChanges: '{count} pending changes',
    undoOperations: '{count} undo operations',
    noChanges: 'No changes',
  },

  fileViewer: {
    pendingFiles: 'Pending Files',
    undoChanges: 'Undo Changes',
    noFiles: 'No files',
  },

  conversation: {
    thinking: 'Thinking...',
    reasoning: 'Reasoning',
    toolCall: 'Tool Call',
    regenerate: 'Regenerate',
    // Empty state
    empty: {
      title: 'Start New Conversation',
      description: 'I can help you with code, data analysis, documentation, and more. Ask me anything!',
      onlineStatus: 'Always Online',
      smartConversation: 'Smart Conversation',
    },
    // Input
    input: {
      placeholder: 'Type a message... (Shift+Enter for new line)',
      placeholderNoKey: 'Please configure API Key in settings first',
      ariaLabel: 'Type a message',
    },
    // Buttons
    buttons: {
      stop: 'Stop',
      send: 'Send',
    },
    // Toast
    toast: {
      noApiKey: 'Please configure API Key in settings first',
      deletedTurn: 'Deleted complete conversation turn',
    },
    // Error
    error: {
      requestFailed: 'Request failed:',
    },
    // Token usage
    usage: {
      highRisk: 'High Risk',
      nearLimit: 'Near Limit',
      comfortable: 'Comfortable',
    },
  },

  // 移动端专属
  mobile: {
    menu: 'Menu',
    back: 'Back',
    home: 'Home',
    profile: 'Profile',
    // Settings page
    settings: {
      connectionStatus: 'Connection Status',
      status: 'Status',
      statusConnected: 'Connected',
      statusConnecting: 'Connecting...',
      statusDisconnected: 'Disconnected',
      directory: 'Directory',
      encryption: 'Encryption',
      encryptionReady: 'End-to-end encryption enabled',
      encryptionExchanging: 'Exchanging keys...',
      encryptionError: 'Encryption error',
      encryptionNone: 'No encryption',
      sessionId: 'Session ID',
      sessionManagement: 'Session Management',
      clearLocalData: 'Clear local session data',
      clearDataConfirm: 'Are you sure you want to clear local session data?',
      about: 'About',
      disconnect: 'Disconnect',
    },
    // Session input page
    sessionInput: {
      title: 'Join Remote Session',
      subtitle: 'Enter the session ID displayed on PC',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      inputLabel: 'Session ID input',
      joinSession: 'Join Session',
      connecting: 'Connecting...',
      reconnecting: 'Reconnecting...',
      cancel: 'Cancel',
      errorRequired: 'Please enter session ID',
      errorInvalidFormat: 'Invalid session ID format, should be UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
      formatHint: 'Session ID format: UUID (8-4-4-4-12)',
      qrHint: 'Or scan QR code with iOS camera to join automatically',
    },
  },

  // Phase 4: Workspace Features
  recentFiles: {
    title: 'Recent Files',
    empty: 'No recent files',
    emptyHint: 'Files you open will appear here',
    remove: 'Remove from recent',
    confirmClear: 'Are you sure you want to clear all recent files?',
    count: '{count} recent files',
  },

  commandPalette: {
    title: 'Command Palette',
    placeholder: 'Type a command or search...',
    noResults: 'No commands found for "{query}"',
    navigate: 'Navigate',
    select: 'Select',
    close: 'Close',
    general: 'General',
    categories: {
      conversations: 'Conversations',
      files: 'Files',
      developer: 'Developer',
      dataAnalyst: 'Data Analyst',
      student: 'Student',
      office: 'Office',
      view: 'View',
      tools: 'Tools',
      settings: 'Settings',
      help: 'Help',
    },
    commands: {
      'new-conversation': {
        label: 'New Conversation',
        description: 'Start a new conversation',
      },
      'continue-last': {
        label: 'Continue Last Conversation',
        description: 'Return to your most recent conversation',
      },
      'open-file': {
        label: 'Open File...',
        description: 'Open a file from your workspace',
      },
      'recent-files': {
        label: 'Recent Files',
        description: 'View recently accessed files',
      },
      'analyze-code': {
        label: 'Analyze Code',
        description: 'Analyze code structure and quality',
      },
      'find-bugs': {
        label: 'Find Potential Bugs',
        description: 'Search for code smells and potential issues',
      },
      'refactor-code': {
        label: 'Suggest Refactoring',
        description: 'Get refactoring suggestions for selected code',
      },
      'explain-code': {
        label: 'Explain Code',
        description: 'Get detailed explanation of code functionality',
      },
      'search-code': {
        label: 'Search in Codebase',
        description: 'Find patterns and references across files',
      },
      'analyze-data': {
        label: 'Analyze Data',
        description: 'Process and analyze loaded data',
      },
      'generate-chart': {
        label: 'Generate Visualization',
        description: 'Create charts from data',
      },
      'run-statistics': {
        label: 'Run Statistical Tests',
        description: 'Perform statistical analysis',
      },
      'data-summary': {
        label: 'Data Summary',
        description: 'Generate summary statistics',
      },
      'export-data': {
        label: 'Export Results',
        description: 'Export analysis results',
      },
      'export-csv': {
        label: 'Export as CSV',
        description: 'Export data to CSV format',
      },
      'export-json': {
        label: 'Export as JSON',
        description: 'Export data to JSON format',
      },
      'export-excel': {
        label: 'Export as Excel',
        description: 'Export data to Excel workbook',
      },
      'export-chart-image': {
        label: 'Export Chart as Image',
        description: 'Export chart to PNG image',
      },
      'export-pdf': {
        label: 'Export as PDF',
        description: 'Export report to PDF format',
      },
      'export-code-review-pdf': {
        label: 'Export Code Review as PDF',
        description: 'Export code review results to PDF',
      },
      'export-test-report-pdf': {
        label: 'Export Test Report as PDF',
        description: 'Export test generation results to PDF',
      },
      'export-project-analysis-pdf': {
        label: 'Export Project Analysis as PDF',
        description: 'Export project analysis to PDF',
      },
      'explain-concept': {
        label: 'Explain Concept',
        description: 'Get educational explanation of a concept',
      },
      'create-study-plan': {
        label: 'Create Study Plan',
        description: 'Generate a personalized learning plan',
      },
      'solve-problem': {
        label: 'Solve Step by Step',
        description: 'Work through a problem with guidance',
      },
      'process-excel': {
        label: 'Process Excel File',
        description: 'Read and process Excel spreadsheets',
      },
      'query-data': {
        label: 'Query Data',
        description: 'Query data using natural language',
      },
      'transform-data': {
        label: 'Transform Data',
        description: 'Clean and transform data',
      },
      'toggle-sidebar': {
        label: 'Toggle Sidebar',
        description: 'Show or hide the sidebar',
      },
      'toggle-theme': {
        label: 'Toggle Theme',
        description: 'Switch between light and dark mode',
      },
      'open-skills': {
        label: 'Skills Manager',
        description: 'Manage your skills',
      },
      'open-tools': {
        label: 'Tools Panel',
        description: 'Open tools panel',
      },
      'open-mcp': {
        label: 'MCP Services',
        description: 'Manage MCP services',
      },
      'workspace-settings': {
        label: 'Workspace Settings',
        description: 'Configure workspace preferences',
      },
      'keyboard-shortcuts': {
        label: 'Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
      },
    },
  },

  mcp: {
    dialog: {
      title: 'MCP Service Settings',
    },
    title: 'MCP Servers',
    description: 'Manage external MCP service connections',
    addServer: 'Add MCP Server',
    editServer: 'Edit Server',
    add: 'Add',
    update: 'Update',
    saving: 'Saving...',
    toolsCount: '{count} tool(s)',
    confirmDelete: 'Are you sure you want to delete this MCP server?',
    badge: {
      builtin: 'Builtin',
      disabled: 'Disabled',
    },
    empty: {
      title: 'No MCP servers',
      hint: 'Click the button above to add a server',
    },
    actions: {
      clickToDisable: 'Click to disable',
      clickToEnable: 'Click to enable',
      editConfig: 'Edit configuration',
      deleteServer: 'Delete server',
    },
    toast: {
      loadFailed: 'Failed to load MCP servers',
      updated: 'Server configuration updated',
      added: 'Server added',
      saveFailed: 'Save failed',
      deleted: 'Server deleted',
      deleteFailed: 'Delete failed',
      updateStatusFailed: 'Failed to update status',
    },
    validation: {
      invalidServerId: 'Invalid server ID',
      nameRequired: 'Please enter server name',
      urlRequired: 'Please enter server URL',
      urlInvalid: 'Please enter a valid URL',
      timeoutRange: 'Timeout must be between 1000-300000ms',
      serverIdExists: 'Server ID already exists',
      serverIdValid: 'ID format is valid',
    },
    form: {
      serverId: 'Server ID',
      serverIdPlaceholder: 'e.g. excel-analyzer',
      serverIdHint: 'Used for tool calls, e.g. excel-analyzer:analyze_spreadsheet',
      displayName: 'Display Name',
      displayNamePlaceholder: 'e.g. Excel Analyzer',
      description: 'Description',
      descriptionPlaceholder: 'Server capability description',
      serverUrl: 'Server URL',
      transportType: 'Transport Type',
      authTokenOptional: 'Auth Token (Optional)',
      timeoutMs: 'Timeout (ms)',
      transport: {
        sse: 'SSE (Server-Sent Events)',
        streamableHttp: 'Streamable HTTP',
        streamableHttpExperimental: 'Streamable HTTP (Experimental)',
      },
    },
  },

  onboarding: {
    dontShowAgain: "Don't show again",
    previous: 'Previous',
    next: 'Next',
    complete: 'Complete',
    stepProgress: 'Step {current} of {total}',
    steps: {
      welcome: {
        title: 'Welcome to AI Workspace!',
        description: 'Let us show you around the key features.',
      },
      conversations: {
        title: 'Conversations',
        description: 'Interact with AI using natural language. Each conversation has its own workspace.',
      },
      fileTree: {
        title: 'File Browser',
        description: 'Browse your project files and folders. Click any file to preview its contents.',
      },
      skills: {
        title: 'Skills',
        description: 'Manage and execute reusable skills for common tasks.',
      },
      multiAgent: {
        title: 'Multi-Agent',
        description: 'Create multiple AI agents to work together on complex tasks.',
      },
      tools: {
        title: 'Tools Panel',
        description: 'Access quick actions, reasoning visualization, and smart suggestions.',
      },
      complete: {
        title: 'All Set!',
        description: 'You can always access these features from the toolbar or keyboard shortcuts.',
      },
    },
  },

  workspace: {
    title: 'Workspace',
  },

  // Project Home
  projectHome: {
    // Hero section
    hero: {
      badge: 'Local First',
      title: 'Start Creating Here',
      description: 'Chat with your files in natural language in your local AI workspace.',
      descriptionSuffix: 'Your data stays on your device.',
      projectCount: '{count} projects',
      workspaceCount: '{count} workspaces',
      docsHub: 'Docs Hub',
      userDocs: 'User Docs',
      developerDocs: 'Developer Docs',
    },
    // Sidebar cards
    sidebar: {
      continueWork: 'Continue',
      createNew: 'New',
      createNewDescription: 'Create a new project to start your creative journey.',
      shortcutHint: 'Shortcut: N',
      createProject: 'Create Project',
      startFresh: 'Start Fresh',
      startFreshDescription: 'Having issues? Start from scratch. This deletes all projects and conversations.',
      resetApp: 'Reset App',
      resetting: 'Resetting...',
      helpDocs: 'Docs',
      helpDocsDescription: 'Browse user and developer documentation for guides and technical references.',
      openDocs: 'Open Docs Hub',
      appearance: 'Appearance',
    },
    // Theme settings
    theme: {
      modeTitle: 'Theme Mode',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
      accentColorTitle: 'Accent Color',
      languageTitle: 'Language',
    },
    // Accent color names
    accentColors: {
      teal: 'Teal',
      rose: 'Rose',
      amber: 'Amber',
      violet: 'Violet',
      emerald: 'Emerald',
      slate: 'Slate',
    },
    activity: {
      title: 'Activity',
      less: 'Less',
      more: 'More',
      count: 'activities',
    },
    // Project timeline
    timeline: {
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'This Week',
      thisMonth: 'This Month',
      older: 'Older',
    },
    // Search and filters
    filters: {
      searchPlaceholder: 'Search projects...',
      all: 'All',
      active: 'Active',
      archived: 'Archived',
    },
    // Project item
    project: {
      archived: 'Archived',
      workspaceCount: '{count} workspaces',
      open: 'Open',
      rename: 'Rename',
      archive: 'Archive',
      unarchive: 'Unarchive',
      delete: 'Delete',
    },
    // Dialogs
    dialogs: {
      createProject: 'Create New Project',
      createProjectDescription: 'Give your new project a name to organize and distinguish different workspaces.',
      projectNamePlaceholder: 'Enter project name',
      createButton: 'Create Project',
      creating: 'Creating...',
      renameProject: 'Rename Project',
      renamePlaceholder: 'Enter new project name',
      archiveProject: 'Archive Project',
      archiveConfirm: 'Archive project "{name}"? Archived projects won\'t be shown by default, but can be unarchived anytime.',
      dontAskAgain: 'Don\'t ask again',
      deleteProject: 'Delete Project',
      deleteConfirm: 'Delete project "{name}"? This will delete associated workspace records and cannot be undone.',
      deleteConfirmHint: 'Type project name to confirm:',
      startFreshTitle: 'Start Fresh',
      startFreshDescription: 'This will delete everything you\'ve created in this app:',
      startFreshItems: {
        projects: 'All projects and workspaces',
        conversations: 'All conversation history',
        files: 'All uploaded files',
      },
      startFreshNote: 'Like opening the app for the first time.',
      startFreshConfirmHint: 'Type "Start Fresh" to confirm:',
      startFreshConfirmPlaceholder: 'Start Fresh',
      confirmReset: 'Confirm Reset',
      resetting: 'Resetting...',
    },
    // Empty state
    empty: {
      noProjects: 'No projects yet',
      noResults: 'No matching projects found',
      createFirst: 'Create First Project',
    },
  },

  // File Tree
  fileTree: {
    pending: {
      create: 'Added',
      modify: 'Modified',
      delete: 'Deleted',
    },
  },

  // Agent
  agent: {
    inputHint: 'Type @ to temporarily switch agent',
    createNew: 'Create New Agent...',
    noAgents: 'No agents available',
    create: 'Create',
    delete: 'Delete {id}',
    confirmDelete: 'Delete agent "{id}"?',
  },
} as const

export default enUS
