export const fileViewer = {
    pendingFiles: "Pending Files",
    undoChanges: "Undo Changes",
    noFiles: "No files",
} as const

export const standalonePreview = {
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
} as const

// File Preview
export const filePreview = {
    cannotReadFile: "Cannot read file",
    fileTooLarge: "File too large ({size}), maximum supported is {maxSize}",
    readFileFailed: "Failed to read file: {error}",
    clickFileTreeToPreview: "Click a file in the file tree to preview",
    conflict: "Conflict",
    diskFileNewer: "Disk file is newer than OPFS, there may be a conflict",
    copyContent: "Copy content",
    close: "Close",
    binaryFile: "Binary file",
    preview: "Preview",
    source: "Source",
    // Comment feature
    clickLineToComment: "Click line number to comment",
    addComment: "Add comment...",
    send: "Send",
    commentsCount: "{count} comments",
    sendToAI: "Send to AI",
    clearComments: "Clear all comments",
} as const

// Office file preview
export const officePreview = {
    uploading: "Uploading file...",
    creatingToken: "Generating preview...",
    loadingEditor: "Loading editor...",
    retry: "Retry",
    openInNewTab: "Preview in new tab",
} as const

// Phase 4: Workspace Features
export const recentFiles = {
    title: "Recent Files",
    empty: "No recent files",
    emptyHint: "Files you open will appear here",
    remove: "Remove from recent",
    confirmClear: "Are you sure you want to clear all recent files?",
    count: "{count} recent files",
} as const
