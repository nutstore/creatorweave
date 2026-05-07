export const webContainer = {
    // Status labels
    statusIdle: "空闲",
    statusBooting: "启动容器中",
    statusSyncing: "同步文件中",
    statusInstalling: "安装依赖中",
    statusStarting: "启动服务中",
    statusRunning: "运行中",
    statusStopping: "停止中",
    statusError: "错误",
    // Project info
    unrecognisedProject: "未识别项目",
    // Config section
    startupConfig: "启动配置",
    startupConfigHelp: "可选择子目录与脚本，适配 monorepo 或多应用目录结构。",
    directorySelect: "目录选择",
    selectDirectory: "选择目录",
    currentStartupDir: "当前启动目录",
    dirChangeRequiresRestart: "修改目录后需重新启动或重启才会生效",
    advancedOptions: "高级选项",
    startupDirManual: "启动目录（手动）",
    startupDirPlaceholder: "例如 apps/web（默认 .）",
    startupScript: "启动脚本",
    selectStartupScript: "选择启动脚本",
    autoScript: "自动（当前: {name}）",
    // Buttons
    start: "启动",
    stop: "停止",
    restart: "重启",
    sync: "同步",
    reinstallDeps: "重装依赖",
    // Log section
    logOutput: "日志输出 ({count})",
    clearLogs: "清空日志",
    copyLogs: "复制日志",
    openPreview: "打开预览",
    noOutputYet: '暂无输出，点击"启动"开始',
    // Directory picker dialog
    selectStartupDir: "选择启动目录",
    selected: "已选择: {path}",
    resetToProjectRoot: "重置为项目根目录",
    confirm: "确认",
    cancel: "取消",
    projectDirectory: "项目目录",
    // Toast messages
    logsCopied: "日志已复制到剪贴板",
    copyLogsFailed: "复制日志失败，请检查浏览器权限",
} as const
