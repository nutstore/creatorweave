export const onboarding = {
    dontShowAgain: "Don't show again",
    previous: "Previous",
    next: "Next",
    complete: "Complete",
    stepProgress: "Step {current} of {total}",
    steps: {
      welcome: {
        title: "Welcome to CreatorWeave!",
        description: "Let us show you around the key features.",
      },
      conversations: {
        title: "Conversations",
        description:
          "Interact with AI using natural language. Each conversation has its own workspace.",
      },
      fileTree: {
        title: "File Browser",
        description:
          "Browse your project files and folders. Click any file to preview its contents.",
      },
      skills: {
        title: "Skills",
        description: "Manage and execute reusable skills for common tasks.",
      },
      multiAgent: {
        title: "Multi-Agent",
        description:
          "Create multiple AI agents to work together on complex tasks.",
      },
      tools: {
        title: "Tools Panel",
        description:
          "Access quick actions, reasoning visualization, and smart suggestions.",
      },
      complete: {
        title: "All Set!",
        description:
          "You can always access these features from the toolbar or keyboard shortcuts.",
      },
    },
} as const
