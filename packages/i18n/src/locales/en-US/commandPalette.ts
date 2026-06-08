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
