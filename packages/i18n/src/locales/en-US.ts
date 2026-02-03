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

  topbar: {
    productName: 'BFOSA',
    openFolder: 'Open Folder',
    switchFolder: 'Switch Project Folder',
    noApiKey: 'No API Key',
    settings: 'Settings',
    skillsManagement: 'Skills',
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
      glm: 'Zhipu GLM',
      'glm-coding': 'Zhipu GLM (Coding)',
      kimi: 'Kimi (Moonshot)',
      minimax: 'MiniMax',
      qwen: 'Qwen',
    },
  },

  welcome: {
    title: 'BFOSA',
    tagline: 'Browser-Native AI Workspace',
    placeholder: 'Type a message to start...',
    placeholderNoKey: 'Please configure API Key in settings first',
    send: 'Send',
    openLocalFolder: 'Open Local Folder',
    recentHint: 'Select a conversation from the left, or type to start a new one',
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
  },

  remote: {
    title: 'Remote Control',
    host: 'HOST',
    remote: 'REMOTE',
    disconnect: 'Disconnect',
    showQrCode: 'Show QR Code',
    waitingForRemote: 'Waiting for remote device...',
  },

  session: {
    current: 'Current Session',
    switch: 'Switch Session',
    new: 'New Session',
    delete: 'Delete Session',
    deleteConfirm: 'Are you sure you want to delete this session?',
    storageLocation: 'Storage Location',
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

  mobile: {
    menu: 'Menu',
    back: 'Back',
    home: 'Home',
    profile: 'Profile',
  },
} as const

export default enUS
