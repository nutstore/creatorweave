export const commandPalette = {
    title: "命令面板",
    placeholder: "输入命令或搜索...",
    noResults: "未找到与“{query}”匹配的命令",
    navigate: "导航",
    select: "选择",
    close: "关闭",
    general: "通用",
    categories: {
      conversations: "对话",
      files: "文件",
      view: "视图",
      tools: "工具",
      settings: "设置",
      help: "帮助",
    },
    commands: {
      "new-conversation": {
        label: "新建对话",
        description: "开始一个新的对话",
      },
      "continue-last": {
        label: "继续上次对话",
        description: "返回最近一次对话",
      },
      "open-file": {
        label: "打开文件...",
        description: "从工作区打开文件",
      },
      "recent-files": {
        label: "最近文件",
        description: "查看最近访问的文件",
      },
      "toggle-sidebar": {
        label: "切换侧边栏",
        description: "显示或隐藏侧边栏",
      },
      "toggle-theme": {
        label: "切换主题",
        description: "在浅色与深色模式间切换",
      },
      "open-skills": {
        label: "技能管理",
        description: "管理你的技能",
      },
      "open-tools": {
        label: "工具面板",
        description: "打开工具面板",
      },
      "open-mcp": {
        label: "MCP 服务",
        description: "管理 MCP 服务",
      },
      "workspace-settings": {
        label: "工作区设置",
        description: "配置工作区偏好",
      },
      "keyboard-shortcuts": {
        label: "快捷键",
        description: "查看全部快捷键",
      },
    },
} as const
