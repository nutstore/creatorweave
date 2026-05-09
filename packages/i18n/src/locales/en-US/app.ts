// App Initialization
export const app = {
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
} as const
