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
    productName: 'Browser FS Analyzer',
    initComplete: 'Initialization complete',
    initFailed: 'Initialization failed',
    sessionStorageOnly: 'Data is saved for current session only, will be lost on refresh',
    localStorageMode: 'Using local storage mode',
    migrationInProgress: 'Migrating data',
    migrationComplete: 'Migration complete',
    conversationsMigrated: '{count} conversations',
  },

  topbar: {
    productName: 'BFOSA',
    openFolder: 'Open Folder',
    switchFolder: 'Switch Project Folder',
    noApiKey: 'No API Key',
    settings: 'Settings',
    skillsManagement: 'Skills',
  },

  // Folder Selector
  folderSelector: {
    openFolder: 'Select Folder',
    switchFolder: 'Switch Folder',
    releaseHandle: 'Release Handle',
    copyPath: 'Copy Folder Name',
    permissionDenied: 'Permission denied',
    selectionFailed: 'Selection failed',
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

  welcome: {
    title: 'Browser FS Analyzer',
    tagline: 'Browser-Native AI Workspace',
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
    placeholder: 'Type a command or search...',
  },

  onboarding: {
    dontShowAgain: "Don't show again",
    previous: 'Previous',
    next: 'Next',
    complete: 'Complete',
  },

  workspace: {
    title: 'Workspace',
  },
} as const

export default enUS
