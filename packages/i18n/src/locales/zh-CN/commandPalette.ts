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
      developer: "开发",
      dataAnalyst: "数据分析",
      student: "学习",
      office: "办公",
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
      "analyze-code": {
        label: "分析代码",
        description: "分析代码结构与质量",
      },
      "find-bugs": {
        label: "查找潜在 Bug",
        description: "搜索代码异味与潜在问题",
      },
      "refactor-code": {
        label: "重构建议",
        description: "为当前代码提供重构建议",
      },
      "explain-code": {
        label: "解释代码",
        description: "详细说明代码功能与逻辑",
      },
      "search-code": {
        label: "搜索代码库",
        description: "跨文件查找模式与引用",
      },
      "analyze-data": {
        label: "分析数据",
        description: "处理并分析已加载的数据",
      },
      "generate-chart": {
        label: "生成可视化",
        description: "从数据创建图表",
      },
      "run-statistics": {
        label: "运行统计检验",
        description: "执行统计分析",
      },
      "data-summary": {
        label: "数据摘要",
        description: "生成汇总统计信息",
      },
      "export-data": {
        label: "导出结果",
        description: "导出分析结果",
      },
      "export-csv": {
        label: "导出为 CSV",
        description: "将数据导出为 CSV 格式",
      },
      "export-json": {
        label: "导出为 JSON",
        description: "将数据导出为 JSON 格式",
      },
      "export-excel": {
        label: "导出为 Excel",
        description: "将数据导出为 Excel 工作簿",
      },
      "export-chart-image": {
        label: "导出图表为图片",
        description: "将图表导出为 PNG 图片",
      },
      "export-pdf": {
        label: "导出为 PDF",
        description: "将报告导出为 PDF 格式",
      },
      "export-code-review-pdf": {
        label: "导出代码审查 PDF",
        description: "将代码审查结果导出为 PDF",
      },
      "export-test-report-pdf": {
        label: "导出测试报告 PDF",
        description: "将测试结果导出为 PDF",
      },
      "export-project-analysis-pdf": {
        label: "导出项目分析 PDF",
        description: "将项目分析导出为 PDF",
      },
      "explain-concept": {
        label: "解释概念",
        description: "获取某个概念的教学式讲解",
      },
      "create-study-plan": {
        label: "创建学习计划",
        description: "生成个性化学习方案",
      },
      "solve-problem": {
        label: "分步解题",
        description: "按步骤引导解决问题",
      },
      "process-excel": {
        label: "处理 Excel 文件",
        description: "读取并处理 Excel 表格",
      },
      "query-data": {
        label: "查询数据",
        description: "使用自然语言查询数据",
      },
      "transform-data": {
        label: "转换数据",
        description: "清洗并转换数据",
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
