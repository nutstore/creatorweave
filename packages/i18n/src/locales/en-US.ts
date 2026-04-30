export const enUS = {
  common: {
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    close: "Close",
    search: "Search",
    refresh: "Refresh",
    loading: "Loading...",
    processing: "Processing...",
    error: "Error",
    success: "Success",
    copy: "Copy",
    copied: "Copied",
    seconds: "s",
    minutes: "min",
  },

  // App Initialization
  app: {
    initializing: "Initializing...",
    preparing: "Preparing...",
    loadProgress: "Load Progress",
    firstLoadHint: "First load may take a few seconds",
    productName: "CreatorWeave",
    initComplete: "Initialization complete",
    initFailed: "Initialization failed",
    sessionStorageOnly:
      "Data is saved for current session only, will be lost on refresh",
    localStorageMode: "Using local storage mode",
    migrationInProgress: "Migrating data",
    migrationComplete: "Migration complete",
    conversationsMigrated: "{count} conversations",
    // App toast messages
    resetDatabaseFailed:
      "Failed to reset database, please refresh the page manually",
    localDataCleared: "Local data cleared, you can start fresh",
    clearFailedCloseOtherTabs:
      "Failed to clear: please close other tabs/windows of this app first and retry",
    clearLocalDataFailed: "Failed to clear local data",
    storageInitError: "Storage initialization error",
    projectNotFound: "Project not found or has been deleted",
    switchProjectFailed: "Failed to switch project, please try again later",
    noWorkspaceInProject: "Current project has no workspace yet",
    projectCreated: 'Project "{name}" created',
    projectCreatedButSwitchFailed:
      "Project created but failed to switch, please try manually",
    createProjectFailed: "Failed to create project, please try again later",
    projectRenamed: "Project renamed",
    renameFailed: "Failed to rename, please try again later",
    projectArchived: "Project archived",
    projectUnarchived: "Project unarchived",
    archiveFailed: "Failed to archive, please try again later",
    unarchiveFailed: "Failed to unarchive, please try again later",
    projectDeleted: "Project deleted",
    deleteFailed: "Failed to delete, please try again later",
    // Database refresh dialog
    databaseConnectionLost: "Database connection lost",
    whatHappened: "What happened?",
    databaseHandleInvalidExplanation:
      "After browser tab hibernation, the database file handle becomes invalid. This is normal browser behavior.",
    ifJustClearedData:
      'If you just executed "Clear Data", please close other tabs/windows of the same origin first, then refresh the current page.',
    yourDataIsSafe: "Your conversation data is safe!",
    dataStoredInOPFS:
      "Data is stored in browser OPFS, just temporarily inaccessible.",
    willAutoRecoverAfterRefresh:
      "Database connection will automatically recover after page refresh.",
    refreshPage: "Refresh Page",
    cannotCloseDialog:
      "This dialog cannot be closed - please click the button above to refresh the page",
    // Storage loading screen
    databaseInitFailed: "Database initialization failed",
    databaseResetExplanation:
      "This may be due to database corruption or migration failure. Resetting the database will clear all data and recreate.",
    resetDatabase: "Reset Database",
    reloadPage: "Reload Page",
  },

  topbar: {
    productName: "CreatorWeave",
    openFolder: "Open Folder",
    switchFolder: "Switch Project Folder",
    noApiKey: "No API Key",
    settings: "Settings",
    skillsManagement: "Skills",
    projectLabel: "Project: {name}",
    workspaceLabel: "Workspace: {name}",
    tooltips: {
      backToProjects: "Back to Project List",
      menu: "Menu",
      openApiKeySettings: "Open API Key Settings",
      workspaceSettings: "Workspace Layout & Preferences",
      toolsPanel: "Tools Panel",
      commandPalette: "Command Palette (Cmd/Ctrl+K)",
      skillsManager: "Skills Manager",
      mcpSettings: "MCP Service Settings",
      appSettings: "App Settings",
      docs: "Documentation",
      more: "More",
      webContainer: "WebContainer",
    },
    projectSwitcher: {
      createProject: "New Project",
      manageProjects: "Manage All Projects",
      noProjects: "No projects yet",
      workspaceCount: "{count} workspaces",
      shortcut: "⌘P",
    },
    mobile: {
      workDirectory: "Working Directory",
      workspaceSettings: "Workspace Settings",
      skills: "Skills",
      commandPalette: "Command Palette",
      mcpSettings: "MCP Settings",
      docs: "Documentation",
      connection: "Connection",
      storage: "Storage",
      language: "Language",
      theme: "Theme",
    },
  },

  // Folder Selector
  folderSelector: {
    openFolder: "Select Folder",
    switchFolder: "Switch Folder",
    releaseHandle: "Release Handle",
    copyPath: "Copy Folder Name",
    permissionDenied: "Permission denied",
    selectionFailed: "Selection failed",
    sandboxMode: "Sandbox Mode (OPFS)",
    restorePermission: "Restore Permission",
    needsPermissionRestore: "Needs permission restore",
    loading: "Loading...",
    unknown: "Unknown",
    // Persistent storage
    storageWarning: "Cache",
    storageTooltip:
      "Persistent storage not granted. Click to retry. Cache may be cleared on refresh.",
    storageSuccess: "Storage persisted",
    storageFailed: "Cannot get persistent storage",
    storageRequestFailed: "Request failed",
  },

  settings: {
    title: "Settings",
    llmProvider: "LLM Provider",
    apiKey: "API Key",
    apiKeyPlaceholder: "Enter API Key...",
    save: "Save",
    saved: "Saved",
    apiKeyNote: "Key is encrypted with AES-256 and stored locally",
    modelName: "Model Name",
    temperature: "Temperature",
    maxTokens: "Max Tokens",

    // Sync tabs
    sync: "Cross-device Sync",
    offline: "Offline Tasks",
    experimental: "Experimental",

    // Experimental features
    experimentalWarning: "These features are experimental",
    experimentalWarningDesc: "Enabling them may cause stability issues. Some features depend on your provider's concurrency capacity.",
    batchSpawn: "Parallel Subagents (batch_spawn)",
    batchSpawnDesc: "Allow AI to launch multiple subtasks in parallel. Requires provider support for high concurrency, otherwise rate limit errors may occur.",

    // Sync panel
    syncPanel: {
      upload: "Upload",
      downloadManage: "Download / Manage",
      downloadSession: "Download this session",
      currentDevice: "Current Device",
      deviceId: "Device ID",
      endToEndEncryption: "End-to-End Encryption",
      encryptionNotice:
        "Your session data is encrypted before uploading. The server only stores encrypted data and cannot access your original content.",
      preparingData: "Preparing data...",
      uploadingToCloud: "Uploading to cloud...",
      syncCurrentSession: "Sync Current Session",
      syncedSessions: "Synced Sessions",
      noSyncedSessions: "No synced sessions",
      manageAfterUpload: "Upload sessions to manage them here",
      viewAll: "View All",
      refresh: "Refresh",
      expiresAt: "Expires at",
      deleteSession: "Delete this session",
      server: "Server",
      status: "Status",

      // Time formatting
      minutesAgo: "{count} min ago",
      hoursAgo: "{count} hr ago",
      daysAgo: "{count} days ago",

      // Error messages
      encryptionFailed: "Encryption failed",
      decryptionFailed: "Decryption failed, data may be corrupted",
      noSessionToSync: "No session data to sync",
      downloadFailed: "Download failed",
      sessionParseFailed: "Session data parse failed",
      uploadFailed: "Upload failed, please retry",
      deleteFailed: "Delete failed, please retry",
      sessionRestored: "Session restored, please refresh to view",
      sessionDeleted: "Session deleted",
      sessionSynced: "Session synced! Sync ID: {syncId}",
      sessionDownloadSuccess: "Session downloaded successfully!",
      confirmDelete:
        "Are you sure you want to delete this synced session? This cannot be undone.",
      crossDeviceSync: "Cross-device Sync",
      syncDescription:
        "Sync current session to cloud, or download session from cloud. Supports end-to-end encryption, only encrypted data is stored.",
      loading: "Loading...",
      close: "Close",

      // Conflict Resolution Dialog
      conflictResolution: {
        title: "File Conflict",
        conflictDescription: "{path} has a conflict during sync",
        opfsVersionTime: "OPFS Version Time:",
        nativeVersionTime: "Native Version Time:",
        selectResolution: "Select Resolution",
        keepOpfsVersion: "Keep OPFS Version",
        keepOpfsDescriptionModified: "Version modified after Python execution",
        keepOpfsDescriptionNew: "Keep newly created file",
        keepNativeVersion: "Keep Native Version",
        keepNativeDescription:
          "Keep original version in filesystem, discard OPFS changes",
        skipThisFile: "Skip This File",
        skipThisFileDescription: "Do not sync this file, keep current state",
        opfsVersion: "OPFS Version",
        nativeVersion: "Native Version",
        noContent: "No Content",
        fileNotExist: "File does not exist",
        binaryFilePreview:
          "[{source} version is an image or binary file, text preview not supported]",
        noReadableContent: "[{source} version has no readable text content]",
        emptyFile: "[{source} version is empty file]",
        contentTruncated:
          "...[Content too long, truncated {charCount} characters]",
        whyConflict: "Why did this conflict happen?",
        conflictExplanation:
          "The file in OPFS was also modified in the local filesystem. The system detected that the modification times of the two versions are different, and you need to decide which version to keep.",
        ifKeepNativeExists:
          'Choosing "Keep Native Version" will discard changes in OPFS.',
        ifKeepNativeNotExists:
          'Native file does not exist. If you choose "Keep Native Version", this file will be deleted.',
        skipThisConflict: "Skip This Conflict",
        applySelection: "Apply Selection",
        nativeNotConnected:
          "[Native directory not connected, cannot read native version]",
      },

      // Sync Preview Panel (Empty State)
      syncPreview: {
        emptyStateTitle: "Changes Pending Review",
        emptyStateDescription:
          "File system changes detected after executing Python code will appear here. You can preview the details and then approve or reject these changes.",
        step1Title: "Execute Python Code",
        step1Desc: "Run Python file operation code in Agent conversation",
        step2Title: "Preview File Changes",
        step2Desc: "View all modified, added and deleted files",
        step3Title: "Review and Process",
        step3Desc: "After checking diffs, approve or reject changes",
        detectedFiles: "{count} file changes detected",
        added: "added",
        modified: "modified",
        deleted: "deleted",
        reviewChanges: "Review Changes",
        reviewing: "Reviewing...",
        backToList: "Back to List",
        aiSummaryFailed: "AI generation failed, please fill in manually",
        noActiveWorkspace: "Please select a project directory first",
        approvalFailed: "Approval failed",
        keepNativeFailed: "Failed to keep native version",
        noFilesAfterConflict: "No files to sync after conflict resolution",
        reviewRequestSent: "Review request sent",
        reviewRequestFailed: "Failed to send review request",
        conflictHint: ", {count} have conflicts",
        syncFailedCount: "{failed} files failed to apply approval{conflicts}",
      },

      // File Change List
      fileChangeList: {
        noFileChanges: "No file changes",
        noChangesDescription:
          "No file system changes detected after Python execution",
        added: "Added",
        modified: "Modified",
        deleted: "Deleted",
        fileChangesCount: "{count} file changes",
        totalCount: "Total: {count}",
        size: "Size: {size}",
        time: "Time: {time}",
        viewChange: "View change for {path}",
      },

    },

    // Pending Sync Panel
    pendingSyncPanel: {
      title: "Changed Files",
      noPendingChanges: "No pending changes to review",
      newChangesAppearHere: "New changes will appear here automatically",
      refreshTooltip: "Refresh list",
      viewDetailsTooltip: "View details",
      selectedCount: "{count} selected",
      selectAll: "Select All",
      removeFromList: "Remove from list",
      selectFile: "Select",
      reviewInProgress: "Reviewing...",
      review: "Review",
      rejectAll: "Reject All Changes",
      reject: "Reject",
      approveSelected: "Approve Selected",
      approvingInProgress: "Approving...",
      syncComplete: "Done!",
      approveSelectedCount: "Approve ({count})",
      approveAll: "Approve All",
      totalSize: "Total: {size}",
      confirmRejectTitle: "Confirm Rejection",
      confirmRejectMessage:
        "Are you sure you want to reject all changes? This cannot be undone.",
      cancel: "Cancel",
      confirmReject: "Confirm Rejection",
      reviewSuccess: "Review successful!",
      rejectedAllSuccess: "All changes rejected",
      rejectedCountWithFailure:
        "Rejected {successCount} changes, {failedCount} kept in list due to missing local file baseline",
      rejectChangeFailed: "Failed to reject changes, please retry",
      syncFailed: "Approval failed, please retry",
      keepNativeVersionFailed: "Failed to keep native version",
      noFilesToSyncAfterConflict: "No files to sync after conflict resolution",
      reviewRequestSent: "Review request sent",
      sendReviewRequestFailed: "Failed to send review request",
      aiSummaryFailed: "AI generation failed, please fill in manually",
      createSnapshot: "Create approval snapshot",
      onlySyncWithLocalDir: "Only sync to disk when local directory exists",
      syncSuccessMarkSnapshot: "Mark snapshot as synced after successful sync",
      syncFailedCount: "{failed} files failed to apply approval{conflicts}",
      conflictCount: ", {count} have conflicts",
      detectConflict: "Detect conflicts",
      conflictDetectFailed:
        "Conflict detection failed, continuing with approval",
      noConflictShowDialog: "No conflicts, showing approval dialog",
      pendingChanges: "Pending Changes",
      skipConflict: "Skip this conflict",
      currentDraft: "Current Draft",
      snapshotLabel: "Snapshot {id}",
      saved: "Saved",
      approved: "Approved",
      rolledBack: "Rolled Back",
      reviewElements: "Review Elements",
      copyPath: "Copy Path",
      processing: "Processing...",
      draft: "Draft",
      // Error messages for review-request.ts
      noActiveWorkspace: "No active workspace available",
      noChangesToReview: "No changes to review",
      pleaseConfigureApiKey: "Please configure API Key first",
      conversationRunningPleaseWait:
        "Current conversation is running, please try again later",
      reviewConversationTitle: "Change Review",
    },

    // Model Settings - Category Labels
    categories: {
      international: "International",
      chinese: "Chinese",
      custom: "Custom",
    },

    // Model Capabilities
    capabilities: {
      code: "Code",
      writing: "Writing",
      reasoning: "Reasoning",
      vision: "Vision",
      fast: "Fast",
      "long-context": "Long Context",
    },

    // Token Stats
    tokenStats: {
      title: "Usage Statistics",
      noUsage: "No usage statistics yet",
      totalTokens: "Total Tokens",
      requestCount: "Requests",
      inputTokens: "Input Tokens",
      outputTokens: "Output Tokens",
    },

    // Toast Messages
    toast: {
      apiKeyCleared: "API Key cleared",
      providerNameRequired:
        "Please enter provider name, Base URL and model name",
      customProviderAdded: "Custom provider added",
      invalidProviderInfo: "Please enter valid provider information",
      customProviderUpdated: "Custom provider updated",
      selectProviderFirst: "Please create and select a provider first",
      modelNameRequired: "Model name cannot be empty",
      modelAdded: "Model added",
      apiKeyRequired: "Please save an API key first",
      modelsRefreshed: "Models refreshed from API",
    },

    // Model Management
    modelManagement: {
      title: "Custom Provider",
      selectProvider: "Select Provider",
      noCustomProviders: "No custom providers added yet",
      providerName: "Provider Name",
      defaultModel: "Default model, e.g. gpt-4o-mini",
      save: "Save",
      add: "Add",
      deleteProvider: "Delete Provider",
      modelList: "Model List",
      newModelName: "New model name",
      addModel: "Add Model",
      removeModel: "Remove model {name}",
    },

    // Model Selection
    modelSelection: {
      useCustomModelName: "Manual input",
      customModelHint:
        "Enable to enter any model name, suitable for newly released models",
      refreshModels: "Refresh models from API",
    },

    // Custom Base URL
    customBaseUrl: {
      label: "API Base URL",
      placeholder: "https://api.example.com/v1",
      hint: "Supports OpenAI-compatible API endpoints",
    },

    // Advanced Parameters
    advancedParameters: "Advanced Parameters",
    temperatureOptions: {
      precise: "Precise",
      creative: "Creative",
    },
    maxIterations: "Max Iterations",
    maxIterationsHint:
      "Limit the maximum assistant turns in a single Agent Loop",
    maxIterationsUnlimited: "Unlimited",
    maxIterationsUnlimitedHint:
      "Allow unlimited assistant turns in a single Agent Loop",

    // Thinking Mode
    thinkingMode: "Thinking Mode",
    thinkingLevels: {
      minimal: "Minimal",
      low: "Low",
      medium: "Medium",
      high: "Deep",
      xhigh: "Ultra",
    },
    thinkingModeFast: "Fast",
    thinkingModeDeep: "Deep",

    // External Links
    getApiKey: "Get API Key",
    notConfigured: "Not configured",
  },

  workspaceSettings: {
    title: "Workspace Settings",
    close: "Close",
    done: "Done",
    tabs: {
      layout: "Layout",
      display: "Display",
      shortcuts: "Shortcuts",
      data: "Data",
      ariaLabel: "Settings options",
    },
    layout: {
      title: "Layout Settings",
      description: "Adjust panel sizes and ratios in your workspace",
      sidebarWidth: "Sidebar Width: {value}px",
      conversationArea: "Conversation Area: {value}%",
      previewPanel: "Preview Panel: {value}%",
      resetLayout: "Reset Layout",
      resetLayoutConfirm: "Are you sure you want to reset layout settings?",
    },
    display: {
      themeTitle: "Theme Settings",
      themeDescription: "Choose your preferred interface theme",
      theme: {
        light: "Light",
        dark: "Dark",
        system: "System",
      },
      editorTitle: "Editor Display",
      editorDescription: "Configure editor appearance and behavior",
      fontSize: "Font Size",
      font: {
        small: "Small",
        medium: "Medium",
        large: "Large",
      },
      showLineNumbers: "Show Line Numbers",
      wordWrap: "Word Wrap",
      showMiniMap: "Show Mini Map",
    },
    shortcuts: {
      title: "Shortcuts",
      description: "Manage and view keyboard shortcuts",
      showAllTitle: "View All Shortcuts",
      showAllDescription: "Open the keyboard shortcuts help panel",
      view: "View",
      tipLabel: "Tip:",
      tipCommand: "/key",
      tipSuffix: "to quickly open the shortcuts list.",
    },
    data: {
      title: "Data Management",
      description: "Manage recent files and workspace preferences",
      recentFilesTitle: "Recent Files",
      recentFilesCount: "{count} file(s) total",
      clear: "Clear",
      clearRecentConfirm: "Are you sure you want to clear recent files?",
      warningTitle: "Warning:",
      warningDescription:
        "The following actions will affect current workspace settings.",
      resetAllTitle: "Reset All Preferences",
      resetAllDescription:
        "Restore layout, display, and editor settings to defaults.",
      resetAll: "Reset All",
      resetAllConfirm:
        "Are you sure you want to reset all workspace preferences?",
    },
  },

  welcome: {
    title: "CreatorWeave",
    tagline: "AI-Native Creator Workspace for Knowledge & Multi-Agent Flows",
    placeholder: "Type a message to start...",
    placeholderNoKey: "Please configure API Key in settings first",
    send: "Send",
    openLocalFolder: "Open Local Folder",
    recentHint:
      "Select a conversation from the left, or type to start a new one",
    viewCapabilities: "View Capabilities",
    // Drag and drop overlay
    dropFilesHere: "Drop files here",
    supportsFileTypes: "Supports CSV, Excel, PDF, images, and more",
    apiKeyRequiredHint:
      "Please configure API Key in model settings first to start",
    filesReady: "{count} file(s) ready",
    personas: {
      developer: {
        title: "Developer",
        description: "Code understanding, debugging, refactoring",
        examples: {
          0: "Explain how this function works",
          1: "Find bugs in this code",
          2: "Refactor for better performance",
        },
      },
      analyst: {
        title: "Data Analyst",
        description: "Data processing, visualization, insights",
        examples: {
          0: "Analyze sales data in CSV",
          1: "Create charts from Excel",
          2: "Summarize key metrics",
        },
      },
      researcher: {
        title: "Student / Researcher",
        description: "Document reading, learning, knowledge organization",
        examples: {
          0: "Summarize this documentation",
          1: "Explain technical concepts",
          2: "Find information across files",
        },
      },
      office: {
        title: "Office Worker",
        description: "Document processing, reporting, content creation",
        examples: {
          0: "Draft a report from data",
          1: "Format and organize documents",
          2: "Process multiple files",
        },
      },
    },
  },

  skills: {
    title: "Skills Manager",
    searchPlaceholder: "Search skills by name, description or tags...",
    filterAll: "All",
    filterEnabled: "Enabled",
    filterDisabled: "Disabled",
    projectSkills: "Project Skills",
    mySkills: "My Skills",
    builtinSkills: "Builtin Skills",
    enabledCount: "{count} / {total} enabled",
    createNew: "Create Skill",
    deleteConfirm: "Are you sure you want to delete this skill?",
    deleteTitle: "Delete Skill",
    deleteConfirmMessage: 'Are you sure you want to delete "{name}"? This action cannot be undone.',
    noResults: "No skills match your search",
    edit: "Edit",
    delete: "Delete",
    enabled: "Enabled",
    disabled: "Disabled",
    empty: "No skills",
    // Skill categories
    categories: {
      codeReview: "Code Review",
      testing: "Testing",
      debugging: "Debugging",
      refactoring: "Refactoring",
      documentation: "Documentation",
      security: "Security",
      performance: "Performance",
      architecture: "Architecture",
      general: "General",
    },
    // Project Skills Discovery Dialog
    projectDialog: {
      title: "Project Skills Discovered",
      description:
        "Discovered {count} skill(s) in the project. Load them into the workspace?",
      selectAll: "Select All",
      deselectAll: "Deselect All",
      selected: "Selected",
      load: "Load",
      loadAll: "Load All",
      skip: "Skip",
    },
  },

  skillCard: {
    enabled: "Enabled",
    disabled: "Disabled",
    project: "Project",
    viewDetails: "View details",
    edit: "Edit",
    delete: "Delete",
    category: {
      codeReview: "Code Review",
      testing: "Testing",
      debugging: "Debugging",
      refactoring: "Refactoring",
      documentation: "Documentation",
      security: "Security",
      performance: "Performance",
      architecture: "Architecture",
      general: "General",
    },
  },

  skillEditor: {
    editSkill: "Edit Skill",
    createSkill: "Create Skill",
    editDescription: "Modify existing skill configuration and content",
    createDescription: "Create custom skill to extend AI capabilities",
    preview: "Preview",
    edit: "Edit",
    editMode: "Edit Mode",
    createMode: "Create Mode",
    cancel: "Cancel",
    close: "Close",
    saving: "Saving...",
    save: "Save",
    basicInfo: "Basic Information",
    skillName: "Skill Name",
    category: "Category",
    selectCategory: "Select Category",
    skillNamePlaceholder: "e.g. code-reviewer",
    description: "Description",
    descriptionPlaceholder: "Briefly describe this skill's functionality",
    tagsPlaceholder: "review, quality",
    tags: "Tags",
    tagsHelp: "Comma separated, for categorization and search",
    fileExtensions: "File Extensions",
    fileExtensionsHelp: "Optional, activate for specific file types",
    skillContent: "Skill Content",
    instruction: "Instruction",
    instructionPlaceholder:
      "You are a code review expert. When user asks to review code:\n1. Analyze type safety\n2. Check for performance issues\n3. Evaluate readability",
    exampleDialog: "Example Dialog",
    exampleDialogPlaceholder:
      'User: "Help me review this component"\nAI: "Let me check..."',
    exampleDialogHelp: "Optional, helps AI understand through examples",
    outputTemplate: "Output Template",
    outputTemplatePlaceholder:
      "## Review Report\n- File: {{filename}}\n- Issues: {{issues}}",
    outputTemplateHelp: "Optional, defines standard output format",
    uncategorized: "Uncategorized",
    readOnly: "Read-only",
    lines: "lines",
    characters: "characters",
    skillMdPreview: "SKILL.md Preview",
    // Validation errors
    nameRequired: "Skill name is required",
    descriptionRequired: "Description is required",
    saveFailed: "Failed to save",
    // Category labels
    categories: {
      codeReview: "Code Review",
      testing: "Testing",
      debugging: "Debugging",
      refactoring: "Refactoring",
      documentation: "Documentation",
      security: "Security",
      performance: "Performance",
      architecture: "Architecture",
      general: "General",
    },
  },

  skillDetail: {
    tabOverview: "Overview",
    tabContent: "Content",
    tabRaw: "SKILL.md",
    category: "Category",
    sourceBuiltin: "Builtin",
    sourceUser: "User",
    sourceImport: "Imported",
    sourceProject: "Project",
    tags: "Tags",
    triggerKeywords: "Trigger Keywords",
    fileExtensions: "File Extensions",
  },

  webContainer: {
    // Status labels
    statusIdle: "Idle",
    statusBooting: "Starting container",
    statusSyncing: "Syncing files",
    statusInstalling: "Installing dependencies",
    statusStarting: "Starting service",
    statusRunning: "Running",
    statusStopping: "Stopping",
    statusError: "Error",
    // Project info
    unrecognisedProject: "Unrecognised project",
    // Config section
    startupConfig: "Startup Configuration",
    startupConfigHelp:
      "Select subdirectory and script to support monorepo or multi-app directory structures.",
    directorySelect: "Directory",
    selectDirectory: "Select Directory",
    currentStartupDir: "Current Startup Directory",
    dirChangeRequiresRestart: "Changes require restart to take effect",
    advancedOptions: "Advanced Options",
    startupDirManual: "Startup Directory (Manual)",
    startupDirPlaceholder: "e.g. apps/web (default .)",
    startupScript: "Startup Script",
    selectStartupScript: "Select startup script",
    autoScript: "Auto (current: {name})",
    // Buttons
    start: "Start",
    stop: "Stop",
    restart: "Restart",
    sync: "Sync",
    reinstallDeps: "Reinstall",
    // Log section
    logOutput: "Log Output ({count})",
    clearLogs: "Clear",
    copyLogs: "Copy",
    openPreview: "Open Preview",
    noOutputYet: 'No output yet, click "Start" to begin',
    // Directory picker dialog
    selectStartupDir: "Select Startup Directory",
    selected: "Selected: {path}",
    resetToProjectRoot: "Reset to Project Root",
    confirm: "Confirm",
    cancel: "Cancel",
    projectDirectory: "Project Directory",
    // Toast messages
    logsCopied: "Logs copied to clipboard",
    copyLogsFailed: "Failed to copy logs, check browser permissions",
  },

  workflowEditor: {
    // Node Properties Panel
    properties: "Properties",
    selectNodeToEdit: "Select a node to edit properties",
    clickCanvasNode:
      "Click on a node in the canvas or add a new node from the right",
    kind: "Type",
    role: "Role",
    outputKey: "Output Key",
    taskInstruction: "Task Instruction",
    taskInstructionHint: "Clear to restore default",
    setAsWorkflowEntry: "Set as workflow entry",
    maxRetries: "Max Retries",
    timeout: "Timeout (ms)",
    advancedConfig: "Advanced",
    // Model config
    modelConfig: "Model Configuration",
    modelProvider: "Model Provider",
    useDefault: "Use Default",
    modelId: "Model ID",
    temperature: "Temperature",
    maxTokens: "Max Tokens",
    resetToDefault: "Reset to Default",
    // Prompt template
    promptTemplate: "Prompt Template",
    templateContent: "Template Content",
    templateContentHint: "Supports {{variable}} syntax",
    templatePlaceholder:
      "Custom prompt template, use {{outputKey}} to reference upstream output...",
    availableVariables: "Available variables:",
    upstreamOutput: "upstream node output",
    useDefaultTemplate: "Use Default Template",
    // Node kinds
    plan: "Plan",
    produce: "Produce",
    review: "Review",
    repair: "Repair",
    assemble: "Assemble",
    condition: "Condition",
    planDescription: "Define goals and strategy",
    produceDescription: "Execute creation tasks",
    reviewDescription: "Check output quality",
    repairDescription: "Fix review issues",
    assembleDescription: "Integrate final output",
    conditionDescription: "Conditional branching",
    // Add node toolbar
    add: "Add",
    addNodeTooltip: "Add {kind} node - {description}",
    // Canvas context menu
    addNodes: "Add Nodes",
    fitView: "Fit View",
    editProperties: "Edit Properties",
    setAsEntry: "Set as Entry",
    deleteNodeContext: "Delete Node",
    // Node card
    entry: "Entry",
    retry: "Retry",
    timeoutSec: "Timeout",
    // Actions
    deleteNode: "Delete Node",
    // Canvas empty state
    noWorkflowYet: "No workflow yet",
    createOrOpenWorkflow: "Create a new workflow or open an existing one",
    // Custom workflow manager
    myWorkflows: "My Workflows",
    createWorkflow: "Create Workflow",
    editWorkflow: "Edit Workflow",
    deleteWorkflow: "Delete Workflow",
    workflowName: "Workflow Name",
    workflowNamePlaceholder: "e.g. Code Review Pipeline",
    workflowDescription: "Description",
    workflowDescriptionPlaceholder: "Describe what this workflow does...",
    confirmDelete: "Confirm Delete",
    workflowDeleted: "Workflow deleted",
    createFailed: "Failed to create workflow",
    updateFailed: "Failed to update workflow",
    deleteFailed: "Failed to delete workflow",
    importFailed: "Failed to import workflow",
  },

  customWorkflowManager: {
    title: "Workflow Management",
    subtitle: "Manage your custom workflows",
    createNew: "Create Workflow",
    searchPlaceholder: "Search workflows...",
    noResultsWithSearch: "No matching workflows found",
    noResultsWithoutSearch: "No custom workflows yet",
    tryDifferentKeyword: "Try using a different keyword",
    clickToCreateFirst: 'Click "Create Workflow" to create your first workflow',
    // Domain labels
    generic: "Generic",
    novel: "Novel Writing",
    video: "Video Script",
    course: "Course Creation",
    custom: "Custom",
    nodesCount: "{count} nodes",
    // Status
    enabled: "Enabled",
    disabled: "Disabled",
    updatedAt: "Updated {date}",
    // Delete dialog
    confirmDelete: "Confirm Delete",
    deleteConfirmMessage:
      'Are you sure you want to delete workflow "{name}"? This action cannot be undone.',
    cancel: "Cancel",
    delete: "Delete",
    // Footer
    totalWorkflows: "{count} workflows total",
    close: "Close",
  },

  workflowEditorDialog: {
    // Header
    back: "Back",
    workflowEditor: "Workflow Editor",
    // Template selector
    switchTemplate: "Switch Template",
    newWorkflow: "New Workflow",
    myWorkflows: "My Workflows",
    builtInTemplates: "Built-in Templates",
    // Display names
    untitledWorkflow: "Untitled Workflow",
    customWorkflow: "Custom Workflow",
    workflow: "Workflow",
    // Confirm dialog
    unsavedChangesConfirm:
      "You have unsaved changes. Are you sure you want to switch templates?",
    // Status
    valid: "Valid",
    errors: "{count} errors",
    // Actions
    reset: "Reset",
    save: "Save",
    runSimulation: "Run Simulation",
    // Aria labels
    close: "Close",
  },

  remote: {
    title: "Remote Control",
    label: "Remote",
    host: "HOST",
    remote: "REMOTE",
    disconnect: "Disconnect",
    showQrCode: "Show QR Code",
    waitingForRemote: "Waiting for remote device...",
    // Remote Control Panel
    relayServer: "Relay Server",
    scanToConnect: "Scan with mobile to connect",
    scanHint: "Scan QR code or open link on mobile device",
    copySessionId: "Copy session ID",
    copied: "Copied!",
    clickToCreate: 'Click "Create Session" to generate QR code',
    connected: "Connected",
    connecting: "Connecting...",
    peers: "{count} peer(s)",
    createSession: "Create Session",
    cancel: "Cancel",
    direct: "Direct",
  },

  session: {
    current: "Current Conversation",
    switch: "Switch Conversation",
    new: "New Conversation",
    delete: "Delete Conversation",
    deleteConfirm: "Are you sure you want to delete this conversation?",
    storageLocation: "Storage Location",
    // Status
    notInitialized: "Not Initialized",
    unknownSession: "Unknown Conversation",
    initializing: "Initializing...",
    noSession: "No Conversation",
    pendingCount: "{count} pending",
    undoCount: "{count} undo",
    pendingChanges: "{count} pending changes",
    undoOperations: "{count} undo operations",
    noChanges: "No changes",
    // Conversation Switcher
    conversationSwitcher: {
      deleteConfirm:
        "Are you sure you want to delete this workspace cache? All file caches, pending syncs, and undo records will be deleted.",
      selectConversation: "Select Conversation",
      unknownConversation: "Unknown Conversation",
      conversationList: "Conversation List ({count})",
      noConversations: "No conversations",
      pendingSync: "{count} pending",
      noChanges: "No changes",
      deleteCache: "Delete conversation cache",
      newConversation: "New Conversation",
    },
  },

  fileViewer: {
    pendingFiles: "Pending Files",
    undoChanges: "Undo Changes",
    noFiles: "No files",
  },

  standalonePreview: {
    cannotLoadPreview: "Cannot load preview content",
    clickToRetry: "Click to retry",
    copiedToClipboard: "Copied to clipboard",
    refreshed: "Refreshed",
    refresh: "Refresh",
    inspectorEnabled: "Inspector enabled - click page element to copy info",
    inspectorDisabled: "Inspector disabled",
    inspectorActive: "Inspecting - click to disable",
    clickToEnableInspector: "Click to enable inspector",
    inspecting: "Inspecting",
    inspect: "Inspect",
  },

  storageStatusBanner: {
    cacheUnstable: "Cache is unstable",
    retry: "Retry",
  },

  pendingSync: {
    justNow: "Just now",
    minutesAgo: "{count} min ago",
    hoursAgo: "{count} hr ago",
    create: "Create",
    modify: "Modify",
    delete: "Delete",
    noActiveConversations: "No active conversations",
    allChangesSynced: "All changes synced",
    pendingCount: "Pending ({count})",
    syncAllToDisk: "Sync all pending changes to disk",
    selectProjectFolder: "Please select a project folder first",
    syncing: "Syncing...",
    sync: "Sync",
    syncComplete: "Sync complete: {success} success",
    failed: "failed",
    skipped: "skipped",
    pendingChangesWillBeWritten:
      "Pending changes will be written to the real filesystem. Please make sure you have selected the correct project folder.",
  },

  themeToggle: {
    currentTheme: "Current theme: {theme}",
    rightClickMenu: "Right-click to open theme menu",
  },

  conversation: {
    thinking: "Thinking...",
    reasoning: "Reasoning",
    toolCall: "Tool Call",
    regenerate: "Regenerate",
    regenerateConfirmMessage:
      "Are you sure you want to resend this message? The current reply will be replaced.",
    regenerateConfirmAction: "Confirm",
    regenerateCancelAction: "Cancel",
    stopAndResend: "Stop and Resend",
    resend: "Resend",
    stopAndResendMessage: "Stop and resend this message",
    resendMessage: "Resend this message",
    editAndResend: "Edit and Resend",
    thinkingMode: "Thinking Mode",
    thinkingLevels: {
      minimal: "Minimal",
      low: "Low",
      medium: "Medium",
      high: "High",
      xhigh: "Ultra",
    },
    tokenBudget:
      "Effective input budget {effectiveBudget} = Total limit {modelMaxTokens} - Reserve {reserveTokens}",
    // Empty state
    empty: {
      title: "Start New Conversation",
      description:
        "I can help you with code, data analysis, documentation, and more. Ask me anything!",
      onlineStatus: "Always Online",
      smartConversation: "Smart Conversation",
    },
    // Input
    input: {
      placeholder: "Type a message... (Shift+Enter for new line)",
      placeholderNoKey: "Please configure API Key in settings first",
      ariaLabel: "Type a message",
    },
    // Buttons
    buttons: {
      stop: "Stop",
      send: "Send",
      deleteTurn: "Delete this turn",
      scrollToBottom: "Scroll to bottom",
    },
    // Toast
    toast: {
      noApiKey: "Please configure API Key in settings first",
      deletedTurn: "Deleted complete conversation turn",
    },
    // Error
    error: {
      requestFailed: "Request failed:",
    },
    // Token usage
    usage: {
      highRisk: "High Risk",
      nearLimit: "Near Limit",
      comfortable: "Comfortable",
      tokenUsage:
        "Input {promptTokens} + Output {completionTokens} = {totalTokens} tokens",
    },

    // Export conversation
    export: {
      title: "Export Conversation",
      format: "Format",
      markdownDesc: "Readable, great for sharing",
      jsonDesc: "Structured data, good for backup",
      htmlDesc: "Styled page, good for printing",
      options: "Options",
      includeToolCalls: "Include tool calls",
      includeReasoning: "Include reasoning",
      addTimestamp: "Add timestamp to filename",
      messages: "messages",
      user: "user",
      assistant: "assistant",
      preparing: "Preparing...",
      complete: "Export complete!",
      failed: "Export failed",
      saved: "Saved",
      button: "Export",
    },
  },

  conversationStorage: {
    statusOk: "OK",
    statusWarning: "Low Space",
    statusUrgent: "Needs Cleanup",
    statusCritical: "Critical",
    calculateSize: "Calculate size per conversation (may be slow)",
    refresh: "Refresh",
    sessionDeleted: "Conversation deleted",
    deleteFailed: "Failed to delete conversation",
    noOldConversations: "No conversations inactive for 30 days",
    noCleanupNeeded: "No cache to clean",
    getCleanupInfoFailed: "Failed to get cleanup info",
    cleanupSuccess: "Cleaned up {count} conversation file caches, freed {size}",
    cleanupFailed: "Cleanup failed, please retry",
    // Cleanup dialog
    cleanupTitle: "Cleanup Conversation Cache",
    attention: "Attention:",
    willDiscard: "Will discard {count} unsaved changes",
    willCleanup: "Will cleanup:",
    conversationCount: "{count} conversations",
    daysInactive: "(inactive for 30 days)",
    fileCacheSize: "~{size} file cache",
    unsavedChanges: "{count} unsaved changes",
    selectScope: "Select Cleanup Scope",
    cleanupOldSessions: "Cleanup old conversations only (inactive for 30 days)",
    cleanupAll: "Cleanup all conversation cache",
    cleanupHelpText:
      "Conversation records will not be deleted. They will be reloaded from disk on next access.",
    canceling: "Cancel",
    cleaning: "Cleaning up...",
    confirmCleanup: "Confirm Cleanup",
    // Delete dialog
    deleteTitle: "Delete Conversation",
    deleteConfirm: 'Are you sure you want to delete "{name}"?',
    warningUnsaved: "Warning: Unsaved changes",
    pendingSync: "{count} pending sync changes",
    willDelete: "Will delete",
    conversationRecords: "Conversation records",
    fileCache: "File cache",
    unsavedCannotRecover: "Unsaved changes (cannot recover)",
    cannotRecover: "Cannot recover after deletion",
    deleting: "Deleting...",
    confirmDelete: "Confirm Delete",
    // Dropdown
    storageSpace: "Storage Space",
    browserQuota: "(Browser Quota)",
    loading: "Loading...",
    quotaExplanation:
      "Quota is the browser limit, not actual free space. Writing beyond actual space will cause errors.",
    cannotGetStorage: "Cannot get storage info",
    currentConversation: "Current Conversation",
    allConversations: "All Conversations ({count})",
    noSessions: "No conversations yet",
    noChanges: "No changes",
    deleteConversation: "Delete conversation",
    cleanupOldDescription:
      "Cleanup old conversations file cache to free up space",
    cleanupFileCache: "Cleanup File Cache",
    cleanupFileCacheHelp:
      "Only cleans file cache, does not affect conversation records",
  },

  workspaceStorage: {
    statusOk: "OK",
    statusWarning: "Low Space",
    statusUrgent: "Needs Cleanup",
    statusCritical: "Critical",
    calculateSize: "Calculate size per workspace (may be slow)",
    refresh: "Refresh",
    sessionDeleted: "Workspace deleted",
    deleteFailed: "Failed to delete workspace",
    noOldConversations: "No workspaces inactive for 30 days",
    noCleanupNeeded: "No cache to clean",
    getCleanupInfoFailed: "Failed to get cleanup info",
    cleanupSuccess: "Cleaned up {count} workspace file caches, freed {size}",
    cleanupFailed: "Cleanup failed, please retry",
    cleanupTitle: "Cleanup Workspace Cache",
    attention: "Attention:",
    willDiscard: "Will discard {count} unsaved changes",
    willCleanup: "Will cleanup:",
    conversationCount: "{count} workspaces",
    daysInactive: "(inactive for 30 days)",
    fileCacheSize: "~{size} file cache",
    unsavedChanges: "{count} unsaved changes",
    selectScope: "Select Cleanup Scope",
    cleanupOldSessions: "Cleanup old workspaces only (inactive for 30 days)",
    cleanupAll: "Cleanup all workspace cache",
    cleanupHelpText:
      "Workspace records will not be deleted. They will be reloaded from disk on next access.",
    canceling: "Cancel",
    cleaning: "Cleaning up...",
    confirmCleanup: "Confirm Cleanup",
    deleteTitle: "Delete Workspace",
    deleteConfirm: 'Are you sure you want to delete "{name}"?',
    warningUnsaved: "Warning: Unsaved changes",
    pendingSync: "{count} pending sync changes",
    willDelete: "Will delete",
    conversationRecords: "Workspace records",
    fileCache: "File cache",
    unsavedCannotRecover: "Unsaved changes (cannot recover)",
    cannotRecover: "Cannot recover after deletion",
    deleting: "Deleting...",
    confirmDelete: "Confirm Delete",
    storageSpace: "Storage Space",
    browserQuota: "(Browser Quota)",
    loading: "Loading...",
    quotaExplanation:
      "Quota is the browser limit, not actual free space. Writing beyond actual space will cause errors.",
    cannotGetStorage: "Cannot get storage info",
    currentConversation: "Current Workspace",
    allConversations: "All Workspaces ({count})",
    noSessions: "No workspaces yet",
    noChanges: "No changes",
    deleteConversation: "Delete workspace",
    cleanupOldDescription:
      "Cleanup old workspaces file cache to free up space",
    cleanupFileCache: "Cleanup File Cache",
    cleanupFileCacheHelp:
      "Only cleans file cache, does not affect workspace records",
  },

  toolCallDisplay: {
    executing: "Executing...",
    arguments: "Arguments",
    result: "Result",
  },

  // 移动端专属
  mobile: {
    menu: "Menu",
    back: "Back",
    home: "Home",
    profile: "Profile",
    // Settings page
    settings: {
      connectionStatus: "Connection Status",
      status: "Status",
      statusConnected: "Connected",
      statusConnecting: "Connecting...",
      statusDisconnected: "Disconnected",
      directory: "Directory",
      encryption: "Encryption",
      encryptionReady: "End-to-end encryption enabled",
      encryptionExchanging: "Exchanging keys...",
      encryptionError: "Encryption error",
      encryptionNone: "No encryption",
      sessionId: "Session ID",
      sessionManagement: "Session Management",
      clearLocalData: "Clear local session data",
      clearDataConfirm: "Are you sure you want to clear local session data?",
      about: "About",
      disconnect: "Disconnect",
    },
    // Session input page
    sessionInput: {
      title: "Join Remote Session",
      subtitle: "Enter the session ID displayed on PC",
      placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      inputLabel: "Session ID input",
      joinSession: "Join Session",
      connecting: "Connecting...",
      reconnecting: "Reconnecting...",
      cancel: "Cancel",
      errorRequired: "Please enter session ID",
      errorInvalidFormat:
        "Invalid session ID format, should be UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
      formatHint: "Session ID format: UUID (8-4-4-4-12)",
      qrHint: "Or scan QR code with iOS camera to join automatically",
    },
  },

  // Offline Queue
  offlineQueue: {
    justNow: "Just now",
    minutesAgo: "{count} min ago",
    hoursAgo: "{count} hr ago",
    retry: "Retry",
    delete: "Delete",
    syncing: "Syncing",
    pending: "Pending",
    failed: "Failed",
    completed: "Completed",
    clearCompleted: "Clear completed",
    online: "Online",
    offline: "Offline",
    syncingCount: "Syncing {count}",
    pendingCount: "Pending {count}",
    failedCount: "Failed {count}",
    connectedToNetwork: "Connected to network",
    offlineMode: "Offline mode",
    tasksWillSyncAutomatically: "Tasks will sync automatically",
    tasksWillSyncWhenReconnected: "Tasks will sync when connection is restored",
    syncAll: "Sync All",
    noOfflineTasks: "No offline tasks",
    tasksSavedAutomatically:
      "Tasks are automatically saved to queue when network is interrupted",
  },

  // Activity Heatmap
  activityHeatmap: {
    months: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    days: ["", "Mon", "", "Wed", "", "Fri", ""],
  },

  // Error Boundary
  errorBoundary: {
    renderError: "Render Error",
    componentRenderError:
      "An error occurred while rendering this component. This may be a temporary issue, please try refreshing the page.",
    errorDetails: "Error Details",
    retry: "Retry",
    streamingError: "Streaming Output Error",
  },

  // Plugin Dialog
  pluginDialog: {
    confirm: "Confirm",
    cancel: "Cancel",
    alert: "Alert",
    info: "Information",
    deleteConfirm: "Confirm Delete",
    delete: "Delete",
    gotIt: "Got it",
  },

  // HTML Preview
  htmlPreview: {
    preview: "Preview",
    loading: "Loading...",
  },

  // File Preview
  filePreview: {
    cannotReadFile: "Cannot read file",
    fileTooLarge: "File too large ({size}), maximum supported is {maxSize}",
    readFileFailed: "Failed to read file: {error}",
    clickFileTreeToPreview: "Click a file in the file tree to preview",
    conflict: "Conflict",
    diskFileNewer: "Disk file is newer than OPFS, there may be a conflict",
    copyContent: "Copy content",
    close: "Close",
    binaryFile: "Binary file",
  },

  // Phase 4: Workspace Features
  recentFiles: {
    title: "Recent Files",
    empty: "No recent files",
    emptyHint: "Files you open will appear here",
    remove: "Remove from recent",
    confirmClear: "Are you sure you want to clear all recent files?",
    count: "{count} recent files",
  },

  commandPalette: {
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
  },

  mcp: {
    dialog: {
      title: "MCP Service Settings",
    },
    title: "MCP Servers",
    description: "Manage external MCP service connections",
    addServer: "Add MCP Server",
    editServer: "Edit Server",
    add: "Add",
    update: "Update",
    saving: "Saving...",
    toolsCount: "{count} tool(s)",
    confirmDelete: "Are you sure you want to delete this MCP server?",
    badge: {
      builtin: "Builtin",
      disabled: "Disabled",
    },
    empty: {
      title: "No MCP servers",
      hint: "Click the button above to add a server",
    },
    actions: {
      clickToDisable: "Click to disable",
      clickToEnable: "Click to enable",
      editConfig: "Edit configuration",
      deleteServer: "Delete server",
    },
    toast: {
      loadFailed: "Failed to load MCP servers",
      updated: "Server configuration updated",
      added: "Server added",
      saveFailed: "Save failed",
      deleted: "Server deleted",
      deleteFailed: "Delete failed",
      updateStatusFailed: "Failed to update status",
    },
    validation: {
      invalidServerId: "Invalid server ID",
      nameRequired: "Please enter server name",
      urlRequired: "Please enter server URL",
      urlInvalid: "Please enter a valid URL",
      timeoutRange: "Timeout must be between 1000-300000ms",
      serverIdExists: "Server ID already exists",
      serverIdValid: "ID format is valid",
    },
    form: {
      serverId: "Server ID",
      serverIdPlaceholder: "e.g. excel-analyzer",
      serverIdHint:
        "Used for tool calls, e.g. excel-analyzer:analyze_spreadsheet",
      displayName: "Display Name",
      displayNamePlaceholder: "e.g. Excel Analyzer",
      description: "Description",
      descriptionPlaceholder: "Server capability description",
      serverUrl: "Server URL",
      transportType: "Transport Type",
      authTokenOptional: "Auth Token (Optional)",
      timeoutMs: "Timeout (ms)",
      transport: {
        sse: "SSE (Server-Sent Events)",
        streamableHttp: "Streamable HTTP",
        streamableHttpExperimental: "Streamable HTTP (Experimental)",
      },
    },
  },

  onboarding: {
    dontShowAgain: "Don't show again",
    previous: "Previous",
    next: "Next",
    complete: "Complete",
    stepProgress: "Step {current} of {total}",
    steps: {
      welcome: {
        title: "Welcome to CreatorWeave!",
        description: "Let us show you around the key features.",
      },
      conversations: {
        title: "Conversations",
        description:
          "Interact with AI using natural language. Each conversation has its own workspace.",
      },
      fileTree: {
        title: "File Browser",
        description:
          "Browse your project files and folders. Click any file to preview its contents.",
      },
      skills: {
        title: "Skills",
        description: "Manage and execute reusable skills for common tasks.",
      },
      multiAgent: {
        title: "Multi-Agent",
        description:
          "Create multiple AI agents to work together on complex tasks.",
      },
      tools: {
        title: "Tools Panel",
        description:
          "Access quick actions, reasoning visualization, and smart suggestions.",
      },
      complete: {
        title: "All Set!",
        description:
          "You can always access these features from the toolbar or keyboard shortcuts.",
      },
    },
  },

  workspace: {
    title: "Workspace",
  },

  // Project Home
  projectHome: {
    // Hero section
    hero: {
      badge: "Local First",
      title: "Start Creating Here",
      description:
        "Chat with your files in natural language in your local AI workspace.",
      descriptionSuffix: "Your data stays on your device.",
      projectCount: "{count} projects",
      workspaceCount: "{count} workspaces",
      docsHub: "Docs Hub",
      userDocs: "User Docs",
      developerDocs: "Developer Docs",
    },
    // Sidebar cards
    sidebar: {
      continueWork: "Continue",
      createNew: "New",
      createNewDescription:
        "Create a new project to start your creative journey.",
      shortcutHint: "Shortcut: N",
      createProject: "Create Project",
      startFresh: "Start Fresh",
      startFreshDescription:
        "Having issues? Start from scratch. This deletes all projects and conversations.",
      resetApp: "Reset App",
      resetting: "Resetting...",
      helpDocs: "Docs",
      helpDocsDescription:
        "Browse user and developer documentation for guides and technical references.",
      openDocs: "Open Docs Hub",
      appearance: "Appearance",
      cache: "Cache",
      cacheDescription:
        "Clear browser cache to refresh response headers and static resources.",
      clearCache: "Clear Cache",
      clearing: "Clearing...",
    },
    // Theme settings
    theme: {
      modeTitle: "Theme Mode",
      light: "Light",
      dark: "Dark",
      system: "System",
      accentColorTitle: "Accent Color",
      languageTitle: "Language",
    },
    // Accent color names
    accentColors: {
      teal: "Teal",
      rose: "Rose",
      amber: "Amber",
      violet: "Violet",
      emerald: "Emerald",
      slate: "Slate",
    },
    activity: {
      title: "Activity",
      less: "Less",
      more: "More",
      count: "activities",
    },
    // Project timeline
    timeline: {
      today: "Today",
      yesterday: "Yesterday",
      thisWeek: "This Week",
      thisMonth: "This Month",
      older: "Older",
    },
    // Search and filters
    filters: {
      searchPlaceholder: "Search projects...",
      all: "All",
      active: "Active",
      archived: "Archived",
    },
    // Project item
    project: {
      archived: "Archived",
      workspaceCount: "{count} workspaces",
      open: "Open",
      rename: "Rename",
      archive: "Archive",
      unarchive: "Unarchive",
      delete: "Delete",
    },
    // Dialogs
    dialogs: {
      createProject: "Create New Project",
      createProjectDescription:
        "Give your new project a name to organize and distinguish different workspaces.",
      projectNamePlaceholder: "Enter project name",
      createButton: "Create Project",
      creating: "Creating...",
      renameProject: "Rename Project",
      renamePlaceholder: "Enter new project name",
      archiveProject: "Archive Project",
      archiveConfirm:
        'Archive project "{name}"? Archived projects won\'t be shown by default, but can be unarchived anytime.',
      dontAskAgain: "Don't ask again",
      deleteProject: "Delete Project",
      deleteConfirm:
        'Delete project "{name}"? This will delete associated workspace records and cannot be undone.',
      deleteConfirmHint: "Type project name to confirm:",
      startFreshTitle: "Start Fresh",
      startFreshDescription:
        "This will delete everything you've created in this app:",
      startFreshItems: {
        projects: "All projects and workspaces",
        conversations: "All conversation history",
        files: "All uploaded files",
      },
      startFreshNote: "Like opening the app for the first time.",
      startFreshConfirmHint: 'Type "Start Fresh" to confirm:',
      startFreshConfirmPlaceholder: "Start Fresh",
      confirmReset: "Confirm Reset",
      resetting: "Resetting...",
    },
    // Empty state
    empty: {
      noProjects: "No projects yet",
      noResults: "No matching projects found",
      createFirst: "Create First Project",
    },
  },

  // File Tree
  fileTree: {
    pending: {
      create: "Added",
      modify: "Modified",
      delete: "Deleted",
    },
    copyPath: "Copy Path",
    inspectElement: "Inspect Element",
    emptyStateHint: "You can continue without selecting a local directory",
    emptyStateDescription:
      "File changes will appear here in pure OPFS sandbox mode",
    draftFiles: "Draft Files",
    approvedNotSynced: "Approved, pending disk sync",
  },

  // Agent
  agent: {
    inputHint: "Type @ to temporarily switch agent",
    createNew: "Create New Agent...",
    noAgents: "No agents available",
    create: "Create",
    delete: "Delete {id}",
    confirmDelete: 'Delete agent "{id}"?',
    thinking: "Thinking...",
    callingTool: "Calling tool...",
    callingToolWithName: "Calling tool {name}...",
  },

  // Sidebar component
  sidebar: {
    expandSidebar: "Expand Sidebar",
    collapseSidebar: "Collapse Sidebar",
    closeSidebar: "Close Sidebar",
    workspace: "Workspace",
    clearWorkspace: "Clear current project workspace",
    clear: "Clear",
    activeTab: "Active",
    archivedTab: "Archived",
    newWorkspace: "New Workspace",
    workspaceLabel: "Workspace: {name}",
    pendingReviewCount: "{count} changes pending review",
    workspaceDeleted: "Workspace deleted",
    emptyStateNoWorkspace:
      "No workspace for this project yet. A workspace will be automatically created when you start your first conversation.",
    createFirstWorkspace: "Create First Workspace",
    deleteWorkspaceFailed: "Failed to delete workspace",
    deleteWorkspace: "Delete Workspace",
    renameWorkspace: "Rename Workspace",
    archiveWorkspace: "Archive Workspace",
    unarchiveWorkspace: "Unarchive Workspace",
    workspaceArchived: "Workspace archived",
    workspaceUnarchived: "Workspace restored",
    archiveFailed: "Failed to archive workspace",
    unarchiveFailed: "Failed to unarchive workspace",
    pinWorkspace: "Pin Workspace",
    unpinWorkspace: "Unpin Workspace",
    moreActions: "More Actions",
    dragToResizeHeight: "Drag to resize height",
    centerDot: "Center",
    files: "Files",
    changes: "Changes",
    snapshots: "Snapshots",

    // Snapshot List
    snapshotList: {
      title: "Snapshot List",
      noSnapshots: "No snapshot records yet",
      loading: "Loading snapshots...",
      current: "Current",
      delete: "Delete",
      switch: "Switch",
      switching: "Switching...",
      deleting: "Deleting...",
      clear: "Clear",
      clearing: "Clearing...",
      workspaceNotFound: "Workspace not found: {name}",
      switchPartial:
        "Switch to snapshot not fully successful ({failedSnapshotId}), {count} files still not restored",
      switchFailed:
        "Switch failed and auto recovery not fully successful, please manually check snapshot status",
      switchFailedWithCount:
        "Switch to latest not fully successful, {count} files still not restored",
      loadFailed: "Failed to load snapshot",
      loadDetailFailed: "Failed to load snapshot details",
      deleteFailed: "Failed to delete snapshot",
      clearFailed: "Failed to clear snapshots",
      noActiveProject: "No active project",
      noLatestSnapshot: "No latest snapshot to switch to",
      snapshotNotFound: "Snapshot not found",
      switchToLatestFailed: "Failed to switch to latest",
      pendingCount: "{count} changes",
      fileOpCreate: "Added",
      fileOpModify: "Modified",
      fileOpDelete: "Deleted",
      contentKindBinary: "Binary",
      contentKindText: "Text",
      contentKindNone: "None",
      confirmClearTitle: "Confirm Clear",
      confirmClearMessage:
        "Are you sure you want to clear all snapshots for this project? This cannot be undone.",
      confirmDeleteTitle: "Confirm Delete",
      confirmDeleteMessage:
        "Are you sure you want to delete this snapshot? This cannot be undone.",
      approved: "Approved",
      committed: "Committed",
      draft: "Draft",
      rolledBack: "Rolled Back",
      unnamedSnapshot: "Unnamed Snapshot",
      processing: "Processing {current}/{total}",
      loadingDetails: "Loading details...",
      noDetails: "No file details for this snapshot",
      before: "Before",
      after: "After",
    },

    // Snapshot Approval Dialog
    snapshotApproval: {
      title: "Create Snapshot",
      description:
        'Will approve <span class="font-semibold">{count}</span> changes and create a snapshot record.',
      summaryLabel: "Snapshot Description",
      generateAI: "AI Generate",
      generating: "Generating...",
      summaryPlaceholder:
        "Enter snapshot description (multi-line, first line can be used as title)",
      summaryError: "Summary generation failed",
      cancel: "Cancel",
      confirm: "Confirm Approval",
      processing: "Processing...",
    },
    plugins: "Plugins",
    pluginTitle: "Plugins",
    pluginManagerHint: "Plugin management will be displayed here",
    clearWorkspaceTitle: "Clear Workspace",
    confirmClearWorkspace:
      "Clear all workspace for current project? This cannot be undone.",
    clearedCount: "Cleared {count} workspace(s)",
    clearFailed: "Clear failed ({count} failed)",
    deletePartial: "Deleted {success}, failed {failed}",
    clearing: "Clearing...",
    dragToResizeWidth: "Drag to resize width",
    exportWorkspace: "Export conversation",

    // Sync Progress Dialog
    syncProgress: {
      syncingFile: "Syncing File",
      syncCompleted: "Sync Completed",
      syncFailed: "Sync Failed",
      syncing: "Syncing...",
      totalProgress: "Total Progress",
      filesProgress: "{completed} / {total} files",
      estimatedTime: "Estimated time remaining",
      remaining: "Remaining",
      syncSuccess: "Sync Success",
      preparing: "Preparing...",
      close: "Close",
      cancel: "Cancel",
    },

    // File Diff Viewer
    fileDiffViewer: {
      selectFile: "Select a file to view details",
      selectFileHint:
        "Select a file from the list on the left to view diff between version and current file",
      loadingFile: "Loading file content...",
      loadFailed: "Load Failed",
      afterSnapshot: "After Snapshot",
      beforeSnapshot: "Before Snapshot",
      currentFile: "Current File",
      changedVersion: "Changed Version",
      binarySnapshot: "Binary Snapshot Comparison",
      binaryContent:
        "Binary content does not support text-level diff. Download the file or use a dedicated binary comparison tool.",
      noImageContent: "No image content",
      fileDeleted: "File deleted (no content in changed version)",
      cannotReadChangedVersion: "Cannot read changed version content",
      loadingMonaco: "Loading Monaco editor...",
      modified: "Modified",
      current: "Current",
      addComment: "Add comment...",
      send: "Send",
      commentsCount: "{count} comments",
      reviewElements: "Review Elements",
      previewHTMLNewTab: "Preview HTML in new tab",
      mergeView: "Merge View",
      splitView: "Split View",
      template: "Template",
      comments: "Comments",
      deleteWarning: "(will be deleted)",
      cannotReadNativeImage: "Cannot read native image",
      cannotReadChangedImage: "Cannot read changed version image",
      imageWillBeDeleted:
        "Image will be deleted (no content in changed version)",
      currentFileComments: "Current file comments",
      filesWithComments: "files with comments",
      copyCommentsToAI: "Copy to AI",
      commentsSummary: "{files} files with comments, {comments} total",
      close: "Close",
      // AI review prompt
      reviewPromptIntro:
        "Please review the following file snapshot and provide modification suggestions:",
      file: "File",
      changeType: "Change Type",
      snapshot: "Snapshot",
      recordedAt: "Recorded at",
      reviewOutput: "Please output:",
      issueList: "Issue list (by severity)",
      actionableSuggestions: "Directly actionable modification suggestions",
      codePatch: "If code changes are needed, provide minimal patch",
      noWorkspace: "No active workspace",
      // Error messages
      loadFailedError: "Failed to load file",
      cannotReadNativeContent:
        "Cannot read native file content. Please select a project directory first.",
      readNativeFileFailed: "Failed to read native file",
      // Snapshot comparison
      beforeSnapshotLabel: "Before Snapshot",
      afterSnapshotLabel: "After Snapshot",
      binary: "Binary",
      text: "Text",
      none: "None",
      size: "Size",
      // Lazy diff viewer mode
      changesOnly: "Changes Only",
      fullEditor: "Full Editor",
      switchToChangesOnly: "Switch to changes-only view",
      switchToFullEditor: "Switch to full editor",
    },

    // Monaco Diff Editor
    monacoDiffEditor: {
      lineHasComment: "This line has a comment",
    },

    // Lazy Diff Viewer (hunk-based)
    lazyDiffViewer: {
      noChanges: "No changes",
      oneChangeBlock: "1 change block (+{additions} −{deletions})",
      changeBlocks: "{count} change blocks (+{additions} −{deletions})",
      loadMore: "Load {count} lines",
      remaining: "remaining",
      fullEditor: "Full Editor",
      openInFullEditor: "Open in full editor",
    },
  },

  // Workflow
  workflow: {
    label: "Workflow",
    description:
      "Multi-step AI collaboration with automatic planning, creation, and review.",
    advancedSettings: "Advanced Settings",
    customRubricName: "Custom Rubric Rule",
    enableCustomRubric: "Enable Custom Rubric Rule",
    passScore: "Pass Score",
    passScoreAria: "Pass score",
    maxRepairRounds: "Max Repair Rounds",
    maxRepairRoundsAria: "Maximum repair rounds",
    paragraphRule: "Paragraph Sentence Rule",
    paragraphMin: "Min Sentences",
    paragraphMinAria: "Minimum paragraph sentences",
    paragraphMax: "Max Sentences",
    paragraphMaxAria: "Maximum paragraph sentences",
    dialoguePolicy: "Dialogue Policy",
    allowSingleDialogue: "Allow Single Dialogue",
    hookRule: "Opening Hook Rule",
    ctaRule: "CTA Completeness Rule",
    customEditor: "Custom Workflow Editor",
    manageWorkflows: "Manage My Workflows",
    simulateRun: "Simulate Run",
    realRun: "Real Run",
    // Template names
    templateNovelDaily: "Novel Daily Workflow",
    templateShortVideo: "Short Video Script Workflow",
    templateEducationLesson: "Lesson Note Workflow",
    templateQualityLoop: "Quality Loop Workflow",
    // Template labels (short)
    templateNovelDailyLabel: "Novel Daily",
    templateShortVideoLabel: "Short Video",
    templateEducationLessonLabel: "Lesson Note",
    templateQualityLoopLabel: "Quality Loop",
    // Rubric names
    rubricNovelDaily: "Novel Daily Rubric",
    rubricShortVideo: "Short Video Rubric",
    rubricEducationLesson: "Lesson Note Rubric",
    rubricQualityLoop: "Quality Loop Rubric",
    // Execution progress
    thinking: "Thinking...",
    thinkingProcess: "Thinking process",
    executing: "Executing, please wait...",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    stopRunning: "Stop running",
    contextSummary: "Context Summary",
    status: "Status",
    template: "Template",
    repairRounds: "Repair Rounds",
    input: "Input",
    output: "Output",
    validation: {
      rubricNameRequired: "Please enter a rubric rule name",
      passScoreRange: "Pass score must be between 0-100",
      repairRoundsRange: "Repair rounds must be between 0-10",
      paragraphRangeInvalid: "Paragraph sentence range is invalid",
      atLeastOneRule: "At least one scoring rule must be enabled",
    },
  },

  // Question Card (ask_user_question tool)
  questionCard: {
    answered: "Answered",
    title: "Agent Question",
    affectedFiles: "Related Files",
    yes: "Yes",
    no: "No",
    confirm: "Confirm",
    placeholder: "Type your answer…",
    submitHint: "Ctrl+Enter to submit",
    submit: "Submit",
    customInput: "Custom input",
    customInputHint: "Type your own answer",
    userAnswer: "Your answer",
  },
} as const;

export default enUS;
