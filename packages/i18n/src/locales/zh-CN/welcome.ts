// 欢迎页
export const welcome = {
    title: "CreatorWeave",
    tagline: "面向创作者的 AI 原生工作台",
    placeholder: "输入消息开始对话...",
    send: "发送",
    // Drag and drop overlay
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
    // 3-step onboarding
    step1Of3: "步骤 1 / 3",
    step2Of3: "步骤 2 / 3",
    step3Of3: "步骤 3 / 3",
    welcomeHeading: "欢迎使用 CreatorWeave",
    welcomeSubtitle: "本地 AI 创作工坊，文件和代码都在浏览器中",
    continueButton: "继续",
    skipButton: "暂时跳过",
    mountFolderTitle: "挂载本地文件夹",
    mountFolderDesc: "AI 可以直接读写你的文件。文件不离开浏览器。",
    mountFolderButton: "选择文件夹",
    mountFolderBack: "上一步",
    mountFolderMounted: "已挂载的文件夹",
    readyHint: "可以直接对话，或拖入文件让我处理",
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
} as const
