export const welcome = {
    title: "CreatorWeave",
    tagline: "AI-Native Workspace for Creators",
    placeholder: "Type a message to start...",
    placeholderNoKey: "Please configure an AI model first",
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
    // Shown while the async API-key check is in flight (avoids flashing the
    // "no API key" setup card before SQLite has been consulted).
    checkingConfig: "Checking AI configuration...",
    // Setup card (shown when no API key configured)
    setupCardTitle: "Choose how to connect AI before you start",
    setupGatewayTitle: "Login with Jianguoyun Account",
    setupGatewayDesc: "Have a Jianguoyun account? Login instantly — no API Key needed",
    setupGatewayRecommend: "Recommended",
    setupApiKeyTitle: "Configure Your Own API Key",
    setupApiKeyDesc: "Supports OpenAI, OpenRouter, Anthropic, and more",
    setupLocalFirstHint: "All data is stored locally in your browser, never uploaded",
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
    gateway: {
        title: "Login to Jianguoyun AI",
        close: "Close",
        requesting: "Creating authorization session...",
        enterCode: "Enter the following code on the authorization page",
        authCodeLabel: "Authorization Code",
        copy: "Copy",
        openAuthPage: "Open Authorization Page",
        waiting: "Waiting for authorization...",
        success: "Login successful!",
        clientIdMissing:
            "Client ID not configured. Set VITE_JIANGUOYUN_AI_CLIENT_ID env variable.",
        authFailedFallback: "Authentication failed",
    },
    quickActionPrompt: "What can you help me with?",
    commandPaletteHint: "Open command palette",
} as const
