// Project Home
export const projectHome = {
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
} as const
