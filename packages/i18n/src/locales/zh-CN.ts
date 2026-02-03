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

  // 顶部导航
  topbar: {
    productName: 'BFOSA',
    openFolder: '打开文件夹',
    switchFolder: '切换项目文件夹',
    noApiKey: '未配置 API Key',
    settings: '设置',
    skillsManagement: '技能管理',
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
  },

  // 远程控制
  remote: {
    title: '远程控制',
    host: 'HOST',
    remote: 'REMOTE',
    disconnect: 'Disconnect',
    showQrCode: '显示二维码',
    waitingForRemote: '等待远程设备连接...',
  },

  // 会话管理
  session: {
    current: '当前会话',
    switch: '切换会话',
    new: '新建会话',
    delete: '删除会话',
    deleteConfirm: '确定要删除这个会话吗？',
    storageLocation: '存储位置',
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
  },
} as const

export default zhCN
