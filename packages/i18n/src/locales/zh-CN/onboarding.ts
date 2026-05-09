export const onboarding = {
    dontShowAgain: "不再显示",
    previous: "上一步",
    next: "下一步",
    complete: "完成",
    stepProgress: "第 {current} / {total} 步",
    steps: {
      welcome: {
        title: "欢迎使用 CreatorWeave！",
        description: "让我们为您介绍主要功能。",
      },
      conversations: {
        title: "对话",
        description: "通过自然语言与 AI 交互。每个对话都有独立的创作工坊。",
      },
      fileTree: {
        title: "文件浏览器",
        description: "浏览项目文件和文件夹。点击任意文件预览内容。",
      },
      skills: {
        title: "技能",
        description: "管理和执行可复用的技能任务。",
      },
      multiAgent: {
        title: "多智能体",
        description: "创建多个 AI 智能体协同工作，分工处理复杂任务。",
      },
      tools: {
        title: "工具面板",
        description: "访问快捷操作、推理可视化和智能建议。",
      },
      complete: {
        title: "准备就绪！",
        description: "您可以随时从工具栏或键盘快捷键访问这些功能。",
      },
    },
} as const
