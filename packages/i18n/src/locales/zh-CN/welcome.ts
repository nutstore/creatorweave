// 欢迎页
export const welcome = {
    title: "CreatorWeave",
    tagline: "面向创作者的 AI 原生工作台",
    placeholder: "输入消息开始对话...",
    placeholderNoKey: "请先配置 AI 模型",
    send: "发送",
    openLocalFolder: "打开本地文件夹",
    recentHint: "从左侧选择已有对话，或输入消息开始新对话",
    viewCapabilities: "查看功能",
    // Drag and drop overlay
    dropFilesHere: "拖放文件到此处",
    supportsFileTypes: "支持 CSV、Excel、PDF、图片等格式",
    apiKeyRequiredHint: "请先在模型设置中配置 API Key 后开始对话",
    filesReady: "{count} 个文件已就绪",
    // Shown while the async API-key check is in flight (avoids flashing the
    // "no API key" setup card before SQLite has been consulted).
    checkingConfig: "正在检查 AI 配置...",
    // Setup card (shown when no API key configured)
    setupCardTitle: "开始之前，请选择连接 AI 的方式",
    setupGatewayTitle: "用坚果云账号登录",
    setupGatewayDesc: "已有坚果云账号？一键登录即可使用，无需配置 API Key",
    setupGatewayRecommend: "推荐",
    setupApiKeyTitle: "配置自己的 API Key",
    setupApiKeyDesc: "支持 OpenAI、OpenRouter、Anthropic 等自定义模型",
    setupLocalFirstHint: "所有数据存储在本地浏览器中，不会上传到服务器",
    personas: {
      developer: {
        title: "开发者",
        description: "代码理解、调试、重构",
        examples: {
          0: "解释这个函数是如何工作的",
          1: "查找代码中的 bug",
          2: "重构以提高性能",
        },
      },
      analyst: {
        title: "数据分析师",
        description: "数据处理、可视化、洞察",
        examples: {
          0: "分析 CSV 销售数据",
          1: "从 Excel 创建图表",
          2: "汇总关键指标",
        },
      },
      researcher: {
        title: "学生 / 研究员",
        description: "文档阅读、学习、知识整理",
        examples: {
          0: "总结这份文档",
          1: "解释技术概念",
          2: "跨文件查找信息",
        },
      },
      office: {
        title: "办公人员",
        description: "文档处理、报告、内容创作",
        examples: {
          0: "根据数据起草报告",
          1: "整理和格式化文档",
          2: "批量处理多个文件",
        },
      },
    },
    gateway: {
        title: "登录坚果云 AI",
        close: "关闭",
        requesting: "正在创建授权会话...",
        enterCode: "请在新打开的页面输入以下代码完成授权",
        authCodeLabel: "授权代码",
        copy: "复制",
        openAuthPage: "打开授权页面",
        waiting: "等待授权完成...",
        success: "登录成功！",
        clientIdMissing:
            "Client ID 未配置，请设置 VITE_JIANGUOYUN_AI_CLIENT_ID 环境变量",
        authFailedFallback: "认证失败",
    },
    quickActionPrompt: "你能帮我做什么？",
    commandPaletteHint: "打开命令面板",
} as const
