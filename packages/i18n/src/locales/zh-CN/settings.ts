// 设置对话框
export const settings = {
    title: "设置",
    llmProvider: "LLM 服务商",
    apiKey: "API Key",
    apiKeyPlaceholder: "输入 API Key...",
    save: "保存",
    saved: "已保存",
    apiKeyNote: "密钥使用 AES-256 加密存储在本地浏览器中",
    modelName: "模型名称",
    temperature: "Temperature",
    maxTokens: "最大输出 Tokens",

    // Sync tabs
    sync: "跨设备同步",
    offline: "离线任务",
    experimental: "实验性功能",

    // Experimental features
    experimentalWarning: "这些功能处于实验阶段",
    experimentalWarningDesc: "开启后可能存在稳定性问题，且部分功能依赖服务商并发能力支持。",
    batchSpawn: "并行子代理 (batch_spawn)",
    batchSpawnDesc: "允许 AI 同时启动多个子任务并行处理。需要服务商支持高并发，否则可能导致速率限制错误。",

    // Sync panel
    syncPanel: {
      upload: "上传",
      downloadManage: "下载/管理",
      downloadSession: "下载此会话",
      currentDevice: "当前设备",
      deviceId: "设备 ID",
      endToEndEncryption: "端到端加密",
      encryptionNotice:
        "您的会话数据在上传前会被加密。服务器仅存储加密数据，无法访问您的原始内容。",
      preparingData: "正在准备数据...",
      uploadingToCloud: "正在上传到云端...",
      syncCurrentSession: "同步当前会话",
      syncedSessions: "已同步的会话",
      noSyncedSessions: "暂无同步的会话",
      manageAfterUpload: "上传会话后可以在这里管理",
      viewAll: "查看全部",
      refresh: "刷新",
      expiresAt: "过期时间",
      deleteSession: "删除此会话",
      server: "服务器",
      status: "状态",

      // Time formatting
      minutesAgo: "{count} 分钟前",
      hoursAgo: "{count} 小时前",
      daysAgo: "{count} 天前",

      // Error messages
      encryptionFailed: "加密失败",
      decryptionFailed: "解密失败，数据可能已损坏",
      noSessionToSync: "没有可同步的会话数据",
      downloadFailed: "下载失败",
      sessionParseFailed: "会话数据解析失败",
      uploadFailed: "上传失败，请重试",
      deleteFailed: "删除失败，请重试",
      sessionRestored: "会话已恢复，请刷新页面查看",
      sessionDeleted: "会话已删除",
      sessionSynced: "会话已同步！Sync ID: {syncId}",
      sessionDownloadSuccess: "会话下载成功！",
      confirmDelete: "确定要删除此同步会话吗？此操作不可撤销。",
      crossDeviceSync: "跨设备同步",
      syncDescription:
        "将当前会话同步到云端，或从云端下载会话。支持端到端加密，仅存储加密数据。",
      loading: "加载中...",
      close: "关闭",

      // Conflict Resolution Dialog
      conflictResolution: {
        title: "文件冲突",
        conflictDescription: "{path} 在同步时发生冲突",
        opfsVersionTime: "OPFS 版本时间:",
        nativeVersionTime: "本机版本时间:",
        selectResolution: "选择解决方案",
        keepOpfsVersion: "保留 OPFS 版本",
        keepOpfsDescriptionModified: "使用 Python 执行后修改的版本",
        keepOpfsDescriptionNew: "保留新创建的文件",
        keepNativeVersion: "保留本机版本",
        keepNativeDescription:
          "保留当前文件系统中的原始版本，放弃 OPFS 中的修改",
        skipThisFile: "跳过此文件",
        skipThisFileDescription: "不同步此文件，保持现状",
        opfsVersion: "OPFS 版本",
        nativeVersion: "本机版本",
        noContent: "无内容",
        fileNotExist: "文件不存在",
        binaryFilePreview:
          "[{source} 版本为图片或二进制文件，暂不支持文本预览]",
        noReadableContent: "[{source} 版本无可读文本内容]",
        emptyFile: "[{source} 版本为空文件]",
        contentTruncated: "...[内容过长，已截断 {charCount} 字符]",
        whyConflict: "为什么会发生冲突？",
        conflictExplanation:
          "OPFS 中的文件在本机文件系统中也被修改了。系统检测到两个版本的修改时间不同，需要您决定保留哪个版本。",
        ifKeepNativeExists: '选择"保留本机版本"将放弃 OPFS 中的修改。',
        ifKeepNativeNotExists:
          '本机文件不存在，如果选择"保留本机版本"将删除此文件。',
        skipThisConflict: "跳过此冲突",
        applySelection: "应用选择",
        nativeNotConnected: "[未连接本机目录，无法读取本机版本]",
      },

      // Sync Preview Panel (Empty State)
      syncPreview: {
        emptyStateTitle: "变更待审阅",
        emptyStateDescription:
          "执行 Python 代码后，检测到的文件系统变更将在此处显示。您可以预览变更详情，然后选择审批通过或拒绝这些变更。",
        step1Title: "执行 Python 代码",
        step1Desc: "在 Agent 对话中执行 Python 文件操作代码",
        step2Title: "预览文件变更",
        step2Desc: "查看所有修改、新增和删除的文件",
        step3Title: "审阅并处理",
        step3Desc: "检查差异后，审批通过或拒绝变更",
        detectedFiles: "检测到 {count} 个文件变更",
        added: "新增",
        modified: "修改",
        deleted: "删除",
        reviewChanges: "审阅",
        reviewing: "审阅中...",
        backToList: "返回列表",
        aiSummaryFailed: "AI 生成失败，请手动填写",
        noActiveWorkspace: "请先选择项目目录",
        approvalFailed: "审批通过失败",
        keepNativeFailed: "保留本机版本失败",
        noFilesAfterConflict: "冲突处理后没有可同步的文件",
        reviewRequestSent: "已发送变更审阅请求",
        reviewRequestFailed: "发送审阅请求失败",
        conflictHint: "，其中 {count} 个存在冲突",
        syncFailedCount: "{failed} 个文件审批应用失败{conflicts}",
      },

      // File Change List
      fileChangeList: {
        noFileChanges: "无文件变更",
        noChangesDescription: "Python 执行后没有检测到文件系统变更",
        added: "新增",
        modified: "修改",
        deleted: "删除",
        fileChangesCount: "{count} 个文件变更",
        totalCount: "总计: {count}",
        size: "大小: {size}",
        time: "时间: {time}",
        viewChange: "查看 {path} 的变更",
      },
    },

    // Pending Sync Panel
    pendingSyncPanel: {
      title: "变更文件",
      noPendingChanges: "当前没有待审阅变更",
      newChangesAppearHere: "新变更会自动显示在此处",
      refreshTooltip: "刷新列表",
      viewDetailsTooltip: "查看详情",
      selectedCount: "{count} 已选",
      selectAll: "全选",
      removeFromList: "从列表中移除",
      selectFile: "选择",
      reviewInProgress: "审阅中...",
      review: "审阅",
      rejectAll: "拒绝全部变更",
      reject: "拒绝",
      approveSelected: "审批通过所选变更",
      approvingInProgress: "审批中...",
      syncComplete: "完成!",
      approveSelectedCount: "审批 ({count})",
      approveAll: "审批全部",
      totalSize: "总计 {size}",
      confirmRejectTitle: "确认拒绝",
      confirmRejectMessage: "确定要拒绝所有变更吗？此操作无法撤销。",
      cancel: "取消",
      confirmReject: "确认拒绝",
      reviewSuccess: "审批成功！",
      rejectedAllSuccess: "已拒绝全部变更",
      rejectedCountWithFailure:
        "已拒绝 {successCount} 个变更，{failedCount} 个因缺少本地文件基线保留在列表中",
      rejectChangeFailed: "拒绝变更失败，请稍后重试",
      syncFailed: "审批失败，请重试",
      keepNativeVersionFailed: "保留本机版本失败",
      noFilesToSyncAfterConflict: "冲突处理后没有可同步的文件",
      reviewRequestSent: "已发送变更审阅请求",
      sendReviewRequestFailed: "发送审阅请求失败",
      aiSummaryFailed: "AI 生成失败，请手动填写",
      createSnapshot: "创建审批快照",
      onlySyncWithLocalDir: "只有在有本地目录时才同步到磁盘",
      syncSuccessMarkSnapshot: "同步成功后标记快照为已同步",
      syncFailedCount: "{failed} 个文件审批应用失败{conflicts}",
      conflictCount: "，其中 {count} 个存在冲突",
      detectConflict: "检测冲突",
      conflictDetectFailed: "冲突检测失败，继续尝试审批",
      noConflictShowDialog: "无冲突，显示审批对话框",
      pendingChanges: "待审阅变更",
      skipConflict: "跳过此冲突",
      currentDraft: "当前草稿",
      snapshotLabel: "快照 {id}",
      saved: "已保存",
      approved: "已审批",
      rolledBack: "已回滚",
      reviewElements: "审查元素",
      copyPath: "复制路径",
      processing: "处理中...",
      draft: "草稿",
      // Error messages for review-request.ts
      noActiveWorkspace: "当前没有可用工作区",
      noChangesToReview: "没有可审阅的变更",
      pleaseConfigureApiKey: "请先配置 API Key",
      conversationRunningPleaseWait: "当前会话正在运行，请稍后再试",
      reviewConversationTitle: "变更审阅",
    },

    // 模型设置 - 分类标签
    categories: {
      international: "国际服务商",
      chinese: "国内服务商",
      custom: "自定义",
    },

    // 模型能力
    capabilities: {
      code: "代码",
      writing: "写作",
      reasoning: "推理",
      vision: "视觉",
      fast: "快速",
      "long-context": "长上下文",
    },

    // Token 统计
    tokenStats: {
      title: "使用统计",
      noUsage: "暂无使用统计",
      totalTokens: "总 Tokens",
      requestCount: "请求次数",
      inputTokens: "输入 Tokens",
      outputTokens: "输出 Tokens",
    },

    // Toast 消息
    toast: {
      apiKeyCleared: "API Key 已清空",
      providerNameRequired: "请填写服务商名称、Base URL 和模型名称",
      customProviderAdded: "已添加自定义服务商",
      invalidProviderInfo: "请填写有效的服务商信息",
      customProviderUpdated: "自定义服务商已更新",
      selectProviderFirst: "请先创建并选择一个服务商",
      modelNameRequired: "模型名称不能为空",
      modelAdded: "模型已添加",
      apiKeyRequired: "请先保存 API Key",
      modelsRefreshed: "已从 API 刷新模型列表",
    },

    // 模型管理
    modelManagement: {
      title: "自定义服务商",
      selectProvider: "选择服务商",
      noCustomProviders: "尚未添加自定义服务商",
      providerName: "服务商名称",
      defaultModel: "默认模型，如 gpt-4o-mini",
      save: "保存",
      add: "添加",
      deleteProvider: "删除服务商",
      modelList: "模型列表",
      newModelName: "新增模型名称",
      addModel: "添加模型",
      removeModel: "移除模型 {name}",
    },

    // 模型选择
    modelSelection: {
      useCustomModelName: "手动输入",
      customModelHint: "开启后可输入任意模型名称，适用于新发布的模型",
      refreshModels: "从 API 刷新模型列表",
    },

    // 自定义 Base URL
    customBaseUrl: {
      label: "API Base URL",
      placeholder: "https://api.example.com/v1",
      hint: "支持 OpenAI 兼容的 API 端点",
    },

    // 高级参数
    advancedParameters: "高级参数",
    temperatureOptions: {
      precise: "精确",
      creative: "创意",
    },
    maxIterations: "最大迭代次数",
    maxIterationsHint: "限制单次 Agent Loop 的最大 assistant 回合数",
    maxIterationsUnlimited: "无限",
    maxIterationsUnlimitedHint: "单次 Agent Loop 不限制 assistant 回合数",

    // 思考模式
    thinkingMode: "思考模式",
    thinkingLevels: {
      minimal: "浅度",
      low: "低",
      medium: "中",
      high: "深度",
      xhigh: "极深",
    },
    thinkingModeFast: "快速",
    thinkingModeDeep: "深入",

    // 外部链接
    getApiKey: "获取 API Key",
    notConfigured: "未配置",
} as const
