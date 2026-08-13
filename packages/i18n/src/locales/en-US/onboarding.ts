export const onboarding = {
    dontShowAgain: "Don't show again",
    previous: "Previous",
    next: "Next",
    complete: "Done",
    skip: "Skip",
    stepProgress: "Step {current} of {total}",
    steps: {
      model: {
        title: "Connect an AI Model",
        description: "Choose the best way for you to get started",
        done: "Model is ready",
        pending: "Click the button below to configure",
      },
      firstMessage: {
        title: "Send Your First Message",
        description: "Type in the input box, or try an example below",
        tip: "AI will start replying immediately",
      },
      files: {
        title: "Let AI Read Your Files",
        description: "After authorization, AI can read and write your local files",
        tip: "Click \"Open Folder\" in the sidebar",
      },
      explore: {
        title: "Explore More Features",
        description: "Press ⌘K to open the command palette for skills and more",
        tip: "Access all features from the command palette anytime",
      },
    },
} as const
