// 首页
export const projectHome = {
    // Hero 区域
    hero: {
      badge: "本地优先",
      title: "创作从这里开始",
      description: "在本地 AI 创作工坊中，用自然语言与你的文件对话。",
      descriptionSuffix: "数据始终在你的设备上。",
      projectCount: "{count} 项目",
      workspaceCount: "{count} 工作区",
      docsHub: "文档中心",
      userDocs: "用户文档",
      developerDocs: "开发者文档",
    },
    // 侧边栏卡片
    sidebar: {
      continueWork: "继续工作",
      createNew: "新建",
      createNewDescription: "创建一个新项目，开始你的创作之旅。",
      shortcutHint: "快捷键: N",
      createProject: "创建项目",
      startFresh: "重新开始",
      startFreshDescription:
        "遇到问题？可以从头开始。这会删除所有项目和对话记录。",
      resetApp: "重置应用",
      resetting: "重置中...",
      helpDocs: "帮助文档",
      helpDocsDescription: "查看用户与开发者文档，快速找到使用说明和技术资料。",
      openDocs: "打开文档中心",
      appearance: "外观",
      cache: "缓存",
      cacheDescription: "清除浏览器缓存以刷新响应头和静态资源。",
      clearCache: "清除缓存",
      clearing: "清除中...",
    },
    // 主题设置
    theme: {
      modeTitle: "主题模式",
      light: "浅色",
      dark: "深色",
      system: "跟随系统",
      accentColorTitle: "主题色",
      languageTitle: "语言",
    },
    // 主题色名称
    accentColors: {
      teal: "青色",
      rose: "玫瑰",
      amber: "琥珀",
      violet: "紫罗兰",
      emerald: "翡翠",
      slate: "石墨",
    },
    activity: {
      title: "活跃度",
      less: "少",
      more: "多",
      count: "次活动",
    },
    // 项目时间线
    timeline: {
      today: "今天",
      yesterday: "昨天",
      thisWeek: "本周",
      thisMonth: "本月",
      older: "更早",
    },
    // 搜索和过滤
    filters: {
      searchPlaceholder: "搜索项目...",
      all: "全部",
      active: "活跃",
      archived: "已归档",
    },
    // 项目项
    project: {
      archived: "已归档",
      workspaceCount: "{count} 工作区",
      open: "打开",
      rename: "重命名",
      archive: "归档",
      unarchive: "取消归档",
      delete: "删除",
    },
    // 对话框
    dialogs: {
      createProject: "创建新项目",
      createProjectDescription:
        "为你的新项目起一个名字，用于组织和区分不同的工作区。",
      projectNamePlaceholder: "输入项目名称",
      createButton: "创建项目",
      creating: "创建中...",
      renameProject: "重命名项目",
      renamePlaceholder: "输入新的项目名称",
      archiveProject: "归档项目",
      archiveConfirm:
        "确认归档项目「{name}」？归档后项目不会默认展示，但可随时取消归档。",
      dontAskAgain: "下次不再提示",
      deleteProject: "删除项目",
      deleteConfirm:
        "确认删除项目「{name}」？该操作会删除项目关联的工作区记录，且不可撤销。",
      deleteConfirmHint: "请输入项目名称以确认删除：",
      startFreshTitle: "重新开始",
      startFreshDescription: "这会删除你在这个应用中创建的所有内容：",
      startFreshItems: {
        projects: "所有项目和工作区",
        conversations: "所有对话记录",
        files: "所有上传的文件",
      },
      startFreshNote: "就像第一次打开这个应用一样。",
      startFreshConfirmHint: "输入 重新开始 确认：",
      startFreshConfirmPlaceholder: "重新开始",
      confirmReset: "确认重置",
      resetting: "重置中...",
    },
    // 空状态
    empty: {
      noProjects: "还没有项目",
      noResults: "没有找到匹配的项目",
      createFirst: "创建第一个项目",
    },
} as const
