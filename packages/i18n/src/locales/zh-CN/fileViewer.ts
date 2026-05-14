// 文件查看器
export const fileViewer = {
    pendingFiles: "待处理文件",
    undoChanges: "撤销修改",
    noFiles: "暂无文件",
} as const

export const standalonePreview = {
    cannotLoadPreview: "无法加载预览内容",
    clickToRetry: "点击重试",
    copiedToClipboard: "已复制到剪贴板",
    refreshed: "已刷新",
    refresh: "刷新",
    inspectorEnabled: "已启用审查 - 点击页面元素复制信息",
    inspectorDisabled: "已关闭审查",
    inspectorActive: "审查中 - 点击关闭",
    clickToEnableInspector: "点击启用审查",
    inspecting: "审查中",
    inspect: "审查",
} as const

// 文件预览
export const filePreview = {
    cannotReadFile: "无法读取文件",
    fileTooLarge: "文件过大 ({size})，最大支持 {maxSize}",
    readFileFailed: "读取文件失败: {error}",
    clickFileTreeToPreview: "点击文件树中的文件进行预览",
    conflict: "冲突",
    diskFileNewer: "磁盘文件比 OPFS 变更更新，可能存在冲突",
    copyContent: "复制内容",
    close: "关闭",
    binaryFile: "二进制文件",
    preview: "预览",
    source: "源码",
    // 评论功能
    clickLineToComment: "点击行号添加评论",
    addComment: "添加评论...",
    send: "发送",
    commentsCount: "{count} 条评论",
    sendToAI: "发给 AI",
    clearComments: "清除所有评论",
} as const

// Office 文件预览
export const officePreview = {
    uploading: "正在上传文件...",
    creatingToken: "正在生成预览...",
    loadingEditor: "正在加载编辑器...",
    retry: "重试",
    openInNewTab: "在新标签页中预览",
} as const

// Phase 4: 工作区功能
export const recentFiles = {
    title: "最近文件",
    empty: "暂无最近文件",
    emptyHint: "您打开的文件将显示在这里",
    remove: "从最近移除",
    confirmClear: "确定要清除所有最近文件吗？",
    count: "{count} 个最近文件",
} as const
