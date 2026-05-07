// 文件夹选择器
export const folderSelector = {
    openFolder: "选择文件夹",
    switchFolder: "切换文件夹",
    releaseHandle: "释放文件夹句柄",
    copyPath: "复制文件夹名称",
    permissionDenied: "权限被拒绝",
    selectionFailed: "选择失败",
    sandboxMode: "沙箱模式 (OPFS)",
    restorePermission: "恢复权限",
    needsPermissionRestore: "需要恢复权限",
    loading: "加载中...",
    unknown: "未知",
    // 持久化存储
    storageWarning: "缓存",
    storageTooltip:
      "浏览器未授予持久化存储，点击重试。刷新页面时缓存可能被清理。",
    storageSuccess: "存储已持久化",
    storageFailed: "无法获取持久化存储",
    storageRequestFailed: "请求失败",
} as const
