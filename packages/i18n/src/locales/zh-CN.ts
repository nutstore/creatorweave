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
    productName: 'Browser FS Analyzer',
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
    productName: 'BFOSA',
    openFolder: '打开文件夹',
    switchFolder: '切换项目文件夹',
    noApiKey: '未配置 API Key',
    settings: '设置',
    skillsManagement: '技能管理',
  },

  // 文件夹选择器
  folderSelector: {
    openFolder: '选择文件夹',
    switchFolder: '切换文件夹',
    releaseHandle: '释放文件夹句柄',
    copyPath: '复制文件夹名称',
    permissionDenied: '权限被拒绝',
    selectionFailed: '选择失败',
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
      glm: '智谱 GLM',
      'glm-coding': '智谱 GLM (Coding)',
      kimi: 'Kimi (Moonshot)',
      minimax: 'MiniMax',
      qwen: '通义千问 (Qwen)',
    },
  },

  // 欢迎页
  welcome: {
    title: 'BFOSA',
    tagline: '浏览器原生 AI 工作台',
    placeholder: '输入消息开始对话...',
    placeholderNoKey: '请先在设置中配置 API Key',
    send: '发送',
    openLocalFolder: '打开本地文件夹',
    recentHint: '从左侧选择已有对话，或输入消息开始新对话',
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
} as const

export default zhCN
