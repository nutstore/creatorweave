export const zhCN = {
  // 通用
  common: {
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    delete: '删除',
    close: '关闭',
    search: '搜索',
    refresh: '刷新',
    loading: '加载中...',
    processing: '处理中...',
    error: '出错了',
    success: '成功',
    copy: '复制',
    copied: '已复制',
  },

  // 应用初始化
  app: {
    initializing: '正在初始化...',
    preparing: '正在准备...',
    loadProgress: '加载进度',
    firstLoadHint: '首次加载可能需要几秒钟时间',
    productName: 'AI Workspace',
    initComplete: '初始化完成',
    initFailed: '初始化失败',
    sessionStorageOnly: '数据仅在当前会话保存，刷新后将丢失',
    localStorageMode: '使用本地存储模式',
    migrationInProgress: '正在迁移数据',
    migrationComplete: '数据迁移完成',
    conversationsMigrated: '{count} 个对话',
  },

  // 顶部导航
  topbar: {
    productName: 'AI Workspace',
    openFolder: '打开文件夹',
    switchFolder: '切换项目文件夹',
    noApiKey: '未配置 API Key',
    settings: '设置',
    skillsManagement: '技能管理',
    projectLabel: '项目：{name}',
    workspaceLabel: '工作区：{name}',
    tooltips: {
      backToProjects: '返回项目列表',
      menu: '菜单',
      openApiKeySettings: '打开 API Key 设置',
      workspaceSettings: '工作区布局与偏好',
      toolsPanel: '工具面板',
      commandPalette: '命令面板 (Cmd/Ctrl+K)',
      skillsManager: '技能管理',
      mcpSettings: 'MCP 服务配置',
      appSettings: '应用设置',
      docs: '帮助文档',
    },
    projectSwitcher: {
      createProject: '新建项目',
      manageProjects: '管理所有项目',
      noProjects: '暂无项目',
      workspaceCount: '{count} 个工作区',
      shortcut: '⌘P',
    },
  },

  // 文件夹选择器
  folderSelector: {
    openFolder: '选择文件夹',
    switchFolder: '切换文件夹',
    releaseHandle: '释放文件夹句柄',
    copyPath: '复制文件夹名称',
    permissionDenied: '权限被拒绝',
    selectionFailed: '选择失败',
    // 持久化存储
    storageWarning: '缓存',
    storageTooltip: '浏览器未授予持久化存储，点击重试。刷新页面时缓存可能被清理。',
    storageSuccess: '存储已持久化',
    storageFailed: '无法获取持久化存储',
    storageRequestFailed: '请求失败',
  },

  // 设置对话框
  settings: {
    title: '设置',
    llmProvider: 'LLM 服务商',
    apiKey: 'API Key',
    apiKeyPlaceholder: '输入 API Key...',
    save: '保存',
    saved: '已保存',
    apiKeyNote: '密钥使用 AES-256 加密存储在本地浏览器中',
    modelName: '模型名称',
    temperature: 'Temperature',
    maxTokens: '最大输出 Tokens',

    providers: {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      groq: 'Groq',
      mistral: 'Mistral',
      glm: '智谱 GLM',
      'glm-coding': '智谱 GLM (Coding)',
      kimi: 'Kimi (Moonshot)',
      minimax: 'MiniMax',
      qwen: '通义千问 (Qwen)',
      custom: '自定义 (OpenAI 兼容)',
    },
  },

  workspaceSettings: {
    title: '工作区设置',
    close: '关闭',
    done: '完成',
    tabs: {
      layout: '布局',
      display: '显示',
      shortcuts: '快捷键',
      data: '数据',
    },
    layout: {
      title: '布局设置',
      description: '调整工作区各面板的尺寸和比例',
      sidebarWidth: '侧边栏宽度: {value}px',
      conversationArea: '对话区域比例: {value}%',
      previewPanel: '预览面板比例: {value}%',
      resetLayout: '重置布局',
      resetLayoutConfirm: '确定要重置布局设置吗？',
    },
    display: {
      themeTitle: '主题设置',
      themeDescription: '选择你偏好的界面主题',
      theme: {
        light: '浅色',
        dark: '深色',
        system: '跟随系统',
      },
      editorTitle: '编辑器显示',
      editorDescription: '设置编辑器的外观和行为',
      fontSize: '字体大小',
      font: {
        small: '小',
        medium: '中',
        large: '大',
      },
      showLineNumbers: '显示行号',
      wordWrap: '自动换行',
      showMiniMap: '显示迷你地图',
    },
    shortcuts: {
      title: '快捷键',
      description: '管理和查看快捷键',
      showAllTitle: '查看全部快捷键',
      showAllDescription: '打开快捷键帮助面板',
      view: '查看',
      tipLabel: '提示：',
      tipCommand: '/key',
      tipSuffix: '可快速打开快捷键列表。',
    },
    data: {
      title: '数据管理',
      description: '管理最近文件和工作区偏好设置',
      recentFilesTitle: '最近文件',
      recentFilesCount: '共 {count} 个文件',
      clear: '清空',
      clearRecentConfirm: '确定要清空最近文件记录吗？',
      warningTitle: '注意：',
      warningDescription: '以下操作将影响当前工作区设置，请谨慎执行。',
      resetAllTitle: '重置所有偏好',
      resetAllDescription: '将布局、显示和编辑器设置恢复为默认值。',
      resetAll: '重置全部',
      resetAllConfirm: '确定要重置所有工作区偏好吗？',
    },
  },

  // 欢迎页
  welcome: {
    title: 'AI Workspace',
    tagline: '面向创作者的 AI 原生工作台（知识库与多 Agent 编排）',
    placeholder: '输入消息开始对话...',
    placeholderNoKey: '请先在设置中配置 API Key',
    send: '发送',
    openLocalFolder: '打开本地文件夹',
    recentHint: '从左侧选择已有对话，或输入消息开始新对话',
    viewCapabilities: '查看功能',
    personas: {
      developer: {
        title: '开发者',
        description: '代码理解、调试、重构',
        examples: {
          0: '解释这个函数是如何工作的',
          1: '查找代码中的 bug',
          2: '重构以提高性能',
        },
      },
      analyst: {
        title: '数据分析师',
        description: '数据处理、可视化、洞察',
        examples: {
          0: '分析 CSV 销售数据',
          1: '从 Excel 创建图表',
          2: '汇总关键指标',
        },
      },
      researcher: {
        title: '学生 / 研究员',
        description: '文档阅读、学习、知识整理',
        examples: {
          0: '总结这份文档',
          1: '解释技术概念',
          2: '跨文件查找信息',
        },
      },
      office: {
        title: '办公人员',
        description: '文档处理、报告、内容创作',
        examples: {
          0: '根据数据起草报告',
          1: '整理和格式化文档',
          2: '批量处理多个文件',
        },
      },
    },
  },

  // 技能管理
  skills: {
    title: '技能管理',
    searchPlaceholder: '搜索技能名称、描述或标签...',
    filterAll: '全部',
    filterEnabled: '已启用',
    filterDisabled: '已禁用',
    projectSkills: '项目技能',
    mySkills: '我的技能',
    builtinSkills: '内置技能',
    enabledCount: '{count} / {total} 已启用',
    createNew: '新建技能',
    deleteConfirm: '确定要删除这个技能吗？',
    edit: '编辑',
    delete: '删除',
    enabled: '已启用',
    disabled: '已禁用',
    empty: '暂无技能',
    // 技能分类
    categories: {
      codeReview: '代码审查',
      testing: '测试',
      debugging: '调试',
      refactoring: '重构',
      documentation: '文档',
      security: '安全',
      performance: '性能',
      architecture: '架构',
      general: '通用',
    },
    // 项目技能发现对话框
    projectDialog: {
      title: '发现项目技能',
      description: '在项目中发现了 {count} 个技能，是否加载到工作区？',
      selectAll: '全选',
      deselectAll: '取消全选',
      selected: '已选',
      load: '加载',
      loadAll: '加载全部',
      skip: '跳过',
    },
  },

  // 远程控制
  remote: {
    title: '远程控制',
    label: '远程',
    host: 'HOST',
    remote: 'REMOTE',
    disconnect: '断开连接',
    showQrCode: '显示二维码',
    waitingForRemote: '等待远程设备连接...',
    // Remote Control Panel
    relayServer: '中继服务器',
    scanToConnect: '使用手机扫描连接',
    scanHint: '扫描二维码或在手机设备上打开链接',
    copySessionId: '复制会话 ID',
    copied: '已复制',
    clickToCreate: '点击"创建会话"生成二维码',
    connected: '已连接',
    connecting: '连接中...',
    peers: '{count} 个设备',
    createSession: '创建会话',
    cancel: '取消',
    direct: '直连',
  },

  // 会话管理
  session: {
    current: '当前会话',
    switch: '切换会话',
    new: '新建会话',
    delete: '删除会话',
    deleteConfirm: '确定要删除这个会话吗？',
    storageLocation: '存储位置',
    // 状态
    notInitialized: '未初始化',
    unknownSession: '未知会话',
    initializing: '初始化中...',
    noSession: '无会话',
    pendingCount: '{count} 个待同步',
    undoCount: '{count} 个可撤销',
    pendingChanges: '{count} 个待同步变更',
    undoOperations: '{count} 个可撤销操作',
    noChanges: '无变更',
  },

  // 文件查看器
  fileViewer: {
    pendingFiles: '待处理文件',
    undoChanges: '撤销修改',
    noFiles: '暂无文件',
  },

  // 对话相关
  conversation: {
    thinking: '思考中...',
    reasoning: '推理过程',
    toolCall: '工具调用',
    regenerate: '重新生成',
    // 空状态
    empty: {
      title: '开始新的对话',
      description: '我可以帮助你处理代码、分析数据、编写文档等各种任务。输入你的问题，让我们开始吧！',
      onlineStatus: '随时在线',
      smartConversation: '智能对话',
    },
    // 输入框
    input: {
      placeholder: '输入消息... (Shift+Enter 换行)',
      placeholderNoKey: '请先在设置中配置 API Key',
      ariaLabel: '输入消息',
    },
    // 按钮
    buttons: {
      stop: '停止',
      send: '发送',
    },
    // 提示
    toast: {
      noApiKey: '请先在设置中配置 API Key',
      deletedTurn: '已删除完整对话轮次',
    },
    // 错误
    error: {
      requestFailed: '请求失败：',
    },
    // Token 使用
    usage: {
      highRisk: '高风险',
      nearLimit: '接近上限',
      comfortable: '宽裕',
    },
  },

  // 移动端专属
  mobile: {
    menu: '菜单',
    back: '返回',
    home: '首页',
    profile: '我的',
    // 设置页
    settings: {
      connectionStatus: '连接状态',
      status: '状态',
      statusConnected: '已连接',
      statusConnecting: '连接中...',
      statusDisconnected: '未连接',
      directory: '目录',
      encryption: '加密',
      encryptionReady: '端到端加密已启用',
      encryptionExchanging: '密钥交换中...',
      encryptionError: '加密错误',
      encryptionNone: '未加密',
      sessionId: 'Session ID',
      sessionManagement: '会话管理',
      clearLocalData: '清除本地会话数据',
      clearDataConfirm: '确定要清除本地会话数据吗？',
      about: '关于',
      disconnect: '断开连接',
    },
    // 会话输入页
    sessionInput: {
      title: '加入远程会话',
      subtitle: '输入 PC 端显示的会话 ID',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      inputLabel: '会话 ID 输入框',
      joinSession: '加入会话',
      connecting: '连接中...',
      reconnecting: '正在重连...',
      cancel: '取消连接',
      errorRequired: '请输入会话 ID',
      errorInvalidFormat: '无效的会话 ID 格式，应为 UUID 格式 (如 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
      formatHint: '会话 ID 格式: UUID (8-4-4-4-12)',
      qrHint: '或者使用 iOS 相机扫描二维码自动加入',
    },
  },

  // Phase 4: 工作区功能
  recentFiles: {
    title: '最近文件',
    empty: '暂无最近文件',
    emptyHint: '您打开的文件将显示在这里',
    remove: '从最近移除',
    confirmClear: '确定要清除所有最近文件吗？',
    count: '{count} 个最近文件',
  },

  commandPalette: {
    title: '命令面板',
    placeholder: '输入命令或搜索...',
    noResults: '未找到与“{query}”匹配的命令',
    navigate: '导航',
    select: '选择',
    close: '关闭',
    general: '通用',
    categories: {
      conversations: '对话',
      files: '文件',
      developer: '开发',
      dataAnalyst: '数据分析',
      student: '学习',
      office: '办公',
      view: '视图',
      tools: '工具',
      settings: '设置',
      help: '帮助',
    },
    commands: {
      'new-conversation': {
        label: '新建对话',
        description: '开始一个新的对话',
      },
      'continue-last': {
        label: '继续上次对话',
        description: '返回最近一次对话',
      },
      'open-file': {
        label: '打开文件...',
        description: '从工作区打开文件',
      },
      'recent-files': {
        label: '最近文件',
        description: '查看最近访问的文件',
      },
      'analyze-code': {
        label: '分析代码',
        description: '分析代码结构与质量',
      },
      'find-bugs': {
        label: '查找潜在 Bug',
        description: '搜索代码异味与潜在问题',
      },
      'refactor-code': {
        label: '重构建议',
        description: '为当前代码提供重构建议',
      },
      'explain-code': {
        label: '解释代码',
        description: '详细说明代码功能与逻辑',
      },
      'search-code': {
        label: '搜索代码库',
        description: '跨文件查找模式与引用',
      },
      'analyze-data': {
        label: '分析数据',
        description: '处理并分析已加载的数据',
      },
      'generate-chart': {
        label: '生成可视化',
        description: '从数据创建图表',
      },
      'run-statistics': {
        label: '运行统计检验',
        description: '执行统计分析',
      },
      'data-summary': {
        label: '数据摘要',
        description: '生成汇总统计信息',
      },
      'export-data': {
        label: '导出结果',
        description: '导出分析结果',
      },
      'export-csv': {
        label: '导出为 CSV',
        description: '将数据导出为 CSV 格式',
      },
      'export-json': {
        label: '导出为 JSON',
        description: '将数据导出为 JSON 格式',
      },
      'export-excel': {
        label: '导出为 Excel',
        description: '将数据导出为 Excel 工作簿',
      },
      'export-chart-image': {
        label: '导出图表为图片',
        description: '将图表导出为 PNG 图片',
      },
      'export-pdf': {
        label: '导出为 PDF',
        description: '将报告导出为 PDF 格式',
      },
      'export-code-review-pdf': {
        label: '导出代码审查 PDF',
        description: '将代码审查结果导出为 PDF',
      },
      'export-test-report-pdf': {
        label: '导出测试报告 PDF',
        description: '将测试结果导出为 PDF',
      },
      'export-project-analysis-pdf': {
        label: '导出项目分析 PDF',
        description: '将项目分析导出为 PDF',
      },
      'explain-concept': {
        label: '解释概念',
        description: '获取某个概念的教学式讲解',
      },
      'create-study-plan': {
        label: '创建学习计划',
        description: '生成个性化学习方案',
      },
      'solve-problem': {
        label: '分步解题',
        description: '按步骤引导解决问题',
      },
      'process-excel': {
        label: '处理 Excel 文件',
        description: '读取并处理 Excel 表格',
      },
      'query-data': {
        label: '查询数据',
        description: '使用自然语言查询数据',
      },
      'transform-data': {
        label: '转换数据',
        description: '清洗并转换数据',
      },
      'toggle-sidebar': {
        label: '切换侧边栏',
        description: '显示或隐藏侧边栏',
      },
      'toggle-theme': {
        label: '切换主题',
        description: '在浅色与深色模式间切换',
      },
      'open-skills': {
        label: '技能管理',
        description: '管理你的技能',
      },
      'open-tools': {
        label: '工具面板',
        description: '打开工具面板',
      },
      'open-mcp': {
        label: 'MCP 服务',
        description: '管理 MCP 服务',
      },
      'workspace-settings': {
        label: '工作区设置',
        description: '配置工作区偏好',
      },
      'keyboard-shortcuts': {
        label: '快捷键',
        description: '查看全部快捷键',
      },
    },
  },

  mcp: {
    dialog: {
      title: 'MCP 服务配置',
    },
    title: 'MCP 服务器',
    description: '管理外部 MCP 服务连接',
    addServer: '添加 MCP 服务器',
    editServer: '编辑服务器',
    add: '添加',
    update: '更新',
    saving: '保存中...',
    toolsCount: '{count} 个工具',
    confirmDelete: '确定要删除此 MCP 服务器吗？',
    badge: {
      builtin: '内置',
      disabled: '已禁用',
    },
    empty: {
      title: '暂无 MCP 服务器',
      hint: '点击上方按钮添加服务器',
    },
    actions: {
      clickToDisable: '点击禁用',
      clickToEnable: '点击启用',
      editConfig: '编辑配置',
      deleteServer: '删除服务器',
    },
    toast: {
      loadFailed: '加载 MCP 服务器失败',
      updated: '服务器配置已更新',
      added: '服务器已添加',
      saveFailed: '保存失败',
      deleted: '服务器已删除',
      deleteFailed: '删除失败',
      updateStatusFailed: '更新状态失败',
    },
    validation: {
      invalidServerId: '无效的服务器 ID',
      nameRequired: '请输入服务器名称',
      urlRequired: '请输入服务器 URL',
      urlInvalid: '请输入有效的 URL',
      timeoutRange: '超时时间应在 1000-300000ms 之间',
      serverIdExists: '服务器 ID 已存在',
      serverIdValid: 'ID 格式正确',
    },
    form: {
      serverId: '服务器 ID',
      serverIdPlaceholder: '如: excel-analyzer',
      serverIdHint: '用于工具调用，如: excel-analyzer:analyze_spreadsheet',
      displayName: '显示名称',
      displayNamePlaceholder: '如: Excel 文档分析器',
      description: '描述',
      descriptionPlaceholder: '服务器功能描述',
      serverUrl: '服务器 URL',
      transportType: '传输类型',
      authTokenOptional: '认证 Token（可选）',
      timeoutMs: '超时时间 (ms)',
      transport: {
        sse: 'SSE (Server-Sent Events)',
        streamableHttp: 'Streamable HTTP',
        streamableHttpExperimental: 'Streamable HTTP (实验性)',
      },
    },
  },

  onboarding: {
    dontShowAgain: '不再显示',
    previous: '上一步',
    next: '下一步',
    complete: '完成',
    stepProgress: '第 {current} / {total} 步',
    steps: {
      welcome: {
        title: '欢迎使用 AI Workspace！',
        description: '让我们为您介绍主要功能。',
      },
      conversations: {
        title: '对话',
        description: '通过自然语言与 AI 交互。每个对话都有独立的工作区。',
      },
      fileTree: {
        title: '文件浏览器',
        description: '浏览项目文件和文件夹。点击任意文件预览内容。',
      },
      skills: {
        title: '技能',
        description: '管理和执行可复用的技能任务。',
      },
      multiAgent: {
        title: '多智能体',
        description: '创建多个 AI 智能体协同工作，分工处理复杂任务。',
      },
      tools: {
        title: '工具面板',
        description: '访问快捷操作、推理可视化和智能建议。',
      },
      complete: {
        title: '准备就绪！',
        description: '您可以随时从工具栏或键盘快捷键访问这些功能。',
      },
    },
  },

  workspace: {
    title: '工作区',
  },

  // 首页
  projectHome: {
    // Hero 区域
    hero: {
      badge: '本地优先',
      title: '创作从这里开始',
      description: '在本地 AI 工作空间中，用自然语言与你的文件对话。',
      descriptionSuffix: '数据始终在你的设备上。',
      projectCount: '{count} 项目',
      workspaceCount: '{count} 工作区',
      docsHub: '文档中心',
      userDocs: '用户文档',
      developerDocs: '开发者文档',
    },
    // 侧边栏卡片
    sidebar: {
      continueWork: '继续工作',
      createNew: '新建',
      createNewDescription: '创建一个新项目，开始你的创作之旅。',
      shortcutHint: '快捷键: N',
      createProject: '创建项目',
      startFresh: '重新开始',
      startFreshDescription: '遇到问题？可以从头开始。这会删除所有项目和对话记录。',
      resetApp: '重置应用',
      resetting: '重置中...',
      helpDocs: '帮助文档',
      helpDocsDescription: '查看用户与开发者文档，快速找到使用说明和技术资料。',
      openDocs: '打开文档中心',
      appearance: '外观',
    },
    // 主题设置
    theme: {
      modeTitle: '主题模式',
      light: '浅色',
      dark: '深色',
      system: '跟随系统',
      accentColorTitle: '主题色',
      languageTitle: '语言',
    },
    // 主题色名称
    accentColors: {
      teal: '青色',
      rose: '玫瑰',
      amber: '琥珀',
      violet: '紫罗兰',
      emerald: '翡翠',
      slate: '石墨',
    },
    activity: {
      title: '活跃度',
      less: '少',
      more: '多',
      count: '次活动',
    },
    // 项目时间线
    timeline: {
      today: '今天',
      yesterday: '昨天',
      thisWeek: '本周',
      thisMonth: '本月',
      older: '更早',
    },
    // 搜索和过滤
    filters: {
      searchPlaceholder: '搜索项目...',
      all: '全部',
      active: '活跃',
      archived: '已归档',
    },
    // 项目项
    project: {
      archived: '已归档',
      workspaceCount: '{count} 工作区',
      open: '打开',
      rename: '重命名',
      archive: '归档',
      unarchive: '取消归档',
      delete: '删除',
    },
    // 对话框
    dialogs: {
      createProject: '创建新项目',
      createProjectDescription: '为你的新项目起一个名字，用于组织和区分不同的工作区。',
      projectNamePlaceholder: '输入项目名称',
      createButton: '创建项目',
      creating: '创建中...',
      renameProject: '重命名项目',
      renamePlaceholder: '输入新的项目名称',
      archiveProject: '归档项目',
      archiveConfirm: '确认归档项目「{name}」？归档后项目不会默认展示，但可随时取消归档。',
      dontAskAgain: '下次不再提示',
      deleteProject: '删除项目',
      deleteConfirm: '确认删除项目「{name}」？该操作会删除项目关联的工作区记录，且不可撤销。',
      deleteConfirmHint: '请输入项目名称以确认删除：',
      startFreshTitle: '重新开始',
      startFreshDescription: '这会删除你在这个应用中创建的所有内容：',
      startFreshItems: {
        projects: '所有项目和工作区',
        conversations: '所有对话记录',
        files: '所有上传的文件',
      },
      startFreshNote: '就像第一次打开这个应用一样。',
      startFreshConfirmHint: '输入 重新开始 确认：',
      startFreshConfirmPlaceholder: '重新开始',
      confirmReset: '确认重置',
      resetting: '重置中...',
    },
    // 空状态
    empty: {
      noProjects: '还没有项目',
      noResults: '没有找到匹配的项目',
      createFirst: '创建第一个项目',
    },
  },

  // 文件树
  fileTree: {
    pending: {
      create: '新增',
      modify: '修改',
      delete: '删除',
    },
  },

  // Agent 相关
  agent: {
    inputHint: '输入 @ 临时切换 Agent',
    createNew: '创建新 Agent...',
    noAgents: '暂无可用 Agent',
    create: '创建',
    delete: '删除 {id}',
    confirmDelete: '确认删除 Agent "{id}"？',
  },
} as const

export default zhCN
