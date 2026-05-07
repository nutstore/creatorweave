export const welcome = {
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
} as const
