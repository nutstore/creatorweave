// 文件树
export const fileTree = {
    pending: {
      create: "新增",
      modify: "修改",
      delete: "删除",
    },
    copyPath: "复制路径",
    inspectElement: "元素审查",
    emptyStateHint: "未选择本地目录也可继续使用",
    emptyStateDescription: "纯 OPFS 沙箱模式下，文件变更会显示在这里",
    draftFiles: "草稿文件",
    approvedNotSynced: "已批准，等待同步到磁盘",
} as const
