// 对话相关
export const conversation = {
    thinking: "思考：关",
    reasoning: "推理过程",
    toolCall: "工具调用",
    regenerate: "重新生成",
    regenerateConfirmMessage: "确定要重新发送这条消息吗？当前回复将被替换。",
    regenerateConfirmAction: "确认",
    regenerateCancelAction: "取消",
    stopAndResend: "停止并重新发送",
    resend: "重新发送",
    stopAndResendMessage: "停止并重新发送此消息",
    resendMessage: "重新发送此消息",
    editAndResend: "编辑并重新发送",
    branch: "从此处分叉",
    thinkingMode: "思考模式",
    thinkingLevels: {
      minimal: "浅",
      low: "低",
      medium: "中",
      high: "深",
      xhigh: "极深",
    },
    tokenBudget:
      "有效输入预算 {effectiveBudget} = 总上限 {modelMaxTokens} - 预留 {reserveTokens}",
    // 空状态
    empty: {
      title: "开始新的对话",
      description:
        "我可以帮助你处理代码、分析数据、编写文档等各种任务。输入你的问题，让我们开始吧！",
      onlineStatus: "随时在线",
      smartConversation: "智能对话",
    },
    // 输入框
    input: {
      placeholder: "输入消息... (Shift+Enter 换行)",
      placeholderNoKey: "请先在设置中配置 API Key",
      placeholderQueuing: "输入消息排队发送... (Shift+Enter 换行)",
      ariaLabel: "输入消息",
      hints: {
        fileMention: "输入 # 引用文件",
        agentMention: "输入 @ 提及智能体",
        slashCommand: "输入 / 使用命令",
      },
    },
    // 按钮
    buttons: {
      stop: "停止",
      send: "发送",
      deleteTurn: "删除此轮对话",
      scrollToBottom: "滚动到底部",
    },
    // 提示
    toast: {
      noApiKey: "请先在设置中配置 API Key",
      deletedTurn: "已删除完整对话轮次",
      stopBeforeSend: "当前会话正在运行，请先停止后再发送",
      stopBeforeRegenerate: "请先停止当前运行，再重新生成",
      conversationMissingForRegenerate: "会话不存在，无法重新生成",
      targetMessageMissing: "目标消息不存在，可能已被删除",
      onlyUserMessageRegenerate: "只能重新生成用户消息",
      modelNotConfigured: "模型未配置，请先在设置中选择服务商和模型",
      stopBeforeEditResend: "请先停止当前运行，再编辑发送",
      conversationMissingForEditResend: "会话不存在，无法编辑重发",
      onlyUserMessageEditResend: "只能编辑并重发用户消息",
      branchCreated: "已创建分叉对话",
      messageQueued: "消息已加入队列 (第 {position} 位)",
      queueFull: "队列已满，请等待当前任务完成后再试",
    },
    // 错误
    error: {
      requestFailed: "请求失败：",
    },
    // 迭代次数限制
    iterationLimit: {
      reached: "已达到最大迭代次数（{count} 次）",
      continue: "继续",
      hint: "任务可能尚未完成，发送消息可让助手继续工作",
    },
    // Codex OAuth 错误
    codex: {
      error: {
        authRequired: "Codex 需要授权",
        authRequiredDesc: "您的 Codex 会话已过期或未授权，请打开浏览器扩展重新授权。",
        openExtension: "打开扩展",
        extensionRequired: "扩展不可用",
        extensionRequiredDesc: "Codex 服务需要安装并启用 CreatorWeave 浏览器扩展。",
        installExtension: "安装扩展",
        rateLimited: "Codex 请求限流",
        rateLimitedDesc: "请求过于频繁，请稍后再试。",
        networkError: "网络连接错误",
        networkErrorDesc: "无法连接到 Codex 服务，请检查网络连接后重试。",
      },
    },
    // Token 使用
    usage: {
      highRisk: "高风险",
      nearLimit: "接近上限",
      comfortable: "宽裕",
      tokenUsage:
        "输入 {promptTokens} + 输出 {completionTokens} = {totalTokens} tokens",
    },

    // 导航
    nav: {
      label: "消息导航",
    },
    // 消息队列
    queue: {
      badge: "{count} 条排队",
      divider: "{count} 条消息排队等待中",
      remove: "撤销排队",
    },
    // 导出会话
    export: {
      title: "导出会话记录",
      format: "导出格式",
      markdownDesc: "易读格式，适合分享和阅读",
      jsonDesc: "结构化数据，适合备份和导入",
      htmlDesc: "带样式页面，适合打印和存档",
      options: "导出选项",
      includeToolCalls: "包含工具调用详情",
      includeReasoning: "包含推理过程",
      addTimestamp: "文件名添加时间戳",
      messages: "条消息",
      user: "条用户",
      assistant: "条助手",
      preparing: "准备中...",
      complete: "导出完成！",
      failed: "导出失败",
      saved: "已保存",
      button: "导出",
    },
} as const

export const toolCallDisplay = {
    executing: "执行中...",
    arguments: "参数",
    result: "结果",
} as const

// Question Card (ask_user_question tool)
export const questionCard = {
    answered: "已回答",
    title: "Agent 提问",
    affectedFiles: "相关文件",
    yes: "确认",
    no: "取消",
    confirm: "确认",
    placeholder: "请输入你的回答…",
    submitHint: "Ctrl+Enter 提交",
    submit: "提交",
    customInput: "自定义输入",
    customInputHint: "自己填写回答",
    userAnswer: "用户回答",
} as const
