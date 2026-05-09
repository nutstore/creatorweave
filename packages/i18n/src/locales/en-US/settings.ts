export const settings = {
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

    // Tabs
    general: "General",
    mcp: "MCP Services",
    sync: "Cross-device Sync",
    offline: "Offline Tasks",
    experimental: "Experimental",

    // General tab
    generalDescription: "Language, theme and basic settings",
    language: "Language",
    languageDescription: "Choose the interface language",
    theme: "Theme",
    themeDescription: "Switch between light/dark/system theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    docs: "Documentation",
    docsDescription: "View usage docs and help",

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
      myProviders: "My Providers",
      selectProvider: "Select Provider",
      noCustomProviders: "No custom providers added yet",
      emptyHint: "Click \"Add Provider\" to connect an OpenAI-compatible API",
      providerName: "Provider Name",
      providerNamePlaceholder: "e.g. Ollama Local, My Relay",
      defaultModel: "Default Model",
      defaultModelPlaceholder: "e.g. gpt-4o, deepseek-chat",
      save: "Save",
      add: "Add Provider",
      cancel: "Cancel",
      create: "Create",
      newProvider: "New Provider",
      editProvider: "Edit Provider",
      deleteProvider: "Delete Provider",
      confirmDeleteTitle: "Delete Provider",
      confirmDeleteMessage: "Are you sure you want to delete \"{name}\"? The associated API Key will also be removed. This action cannot be undone.",
      confirmDelete: "Confirm Delete",
      modelList: "Model List",
      newModelName: "Enter model name",
      addModel: "Add Model",
      addModelShort: "Add",
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

    // API Mode
    apiMode: {
      label: "API Mode",
      hint: "Choose the API endpoint format. Chat Completions uses /chat/completions, Responses API uses /responses (OpenAI's newer API)",
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

    // Default Model Selection
    defaultModel: {
      title: "Default Model",
      description: "Select provider and model for conversations",
      selectModel: "Select Model",
      noProviders: "Please configure an API Key below first",
      manualInput: "Manual Input",
      manualPlaceholder: "Enter model name, e.g. gpt-4o",
    },

    // Provider Management
    providerManager: {
      title: "Provider Management",
      defaultModels: "(default)",
    },

    // Pinned Models (user-selected subset)
    pinnedModels: {
      title: "My Models",
      count: "{count} selected",
      empty: "No models added yet. Click below to add.",
      addFromApi: "Add from model library",
      addManual: "Manual input",
      dialogTitle: "Add Models",
      searchPlaceholder: "Search models...",
      noApiModels: "No models available. Click refresh to fetch the model list first.",
      noMatch: "No matching models",
      dialogHint: "{count} models available. Click to add.",
    },
} as const
