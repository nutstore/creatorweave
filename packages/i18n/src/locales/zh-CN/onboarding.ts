export const onboarding = {
    dontShowAgain: "不再显示",
    previous: "上一步",
    next: "下一步",
    complete: "完成",
    skip: "跳过",
    stepProgress: "第 {current} / {total} 步",
    steps: {
      model: {
        title: "连接 AI 模型",
        description: "选择最适合你的方式开始使用",
        done: "模型已就绪",
        pending: "点击下方按钮配置模型",
      },
      firstMessage: {
        title: "发送你的第一条消息",
        description: "在输入框中打字，或点击下方的示例",
        tip: "AI 会立即开始回复你",
      },
      files: {
        title: "让 AI 读取你的文件",
        description: "授权后，AI 可以读写你指定的本地文件",
        tip: "点击侧栏的「打开文件夹」按钮",
      },
      explore: {
        title: "探索更多功能",
        description: "按 ⌘K 打开命令面板，发现技能、定时任务等",
        tip: "随时可以从命令面板访问所有功能",
      },
    },
} as const
