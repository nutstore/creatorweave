// 远程控制
export const remote = {
    title: "远程控制",
    label: "远程",
    host: "HOST",
    remote: "REMOTE",
    disconnect: "断开连接",
    showQrCode: "显示二维码",
    waitingForRemote: "等待远程设备连接...",
    // Remote Control Panel
    relayServer: "中继服务器",
    scanToConnect: "使用手机扫描连接",
    scanHint: "扫描二维码或在手机设备上打开链接",
    copySessionId: "复制会话 ID",
    copied: "已复制",
    clickToCreate: '点击"创建会话"生成二维码',
    connected: "已连接",
    connecting: "连接中...",
    peers: "{count} 个设备",
    createSession: "创建会话",
    cancel: "取消",
    direct: "直连",
} as const

// 会话管理
export const session = {
    current: "当前对话",
    switch: "切换对话",
    new: "新建对话",
    delete: "删除对话",
    deleteConfirm: "确定要删除这个对话吗？",
    storageLocation: "存储位置",
    // 状态
    notInitialized: "未初始化",
    unknownSession: "未知对话",
    initializing: "初始化中...",
    noSession: "无对话",
    pendingCount: "{count} 个待同步",
    undoCount: "{count} 个可撤销",
    pendingChanges: "{count} 个待同步变更",
    undoOperations: "{count} 个可撤销操作",
    noChanges: "无变更",
    // 会话切换器
    conversationSwitcher: {
      deleteConfirm:
        "确定要删除此工作区的缓存吗？所有文件缓存、待同步和撤销记录将被删除。",
      selectConversation: "选择对话",
      unknownConversation: "未知对话",
      conversationList: "对话列表 ({count})",
      noConversations: "暂无对话",
      pendingSync: "{count} 个待同步",
      noChanges: "无变更",
      deleteCache: "删除对话缓存",
      newConversation: "新建对话",
    },
} as const
