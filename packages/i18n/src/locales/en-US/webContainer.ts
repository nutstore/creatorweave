export const webContainer = {
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
} as const
