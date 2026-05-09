export const conversation = {
    thinking: "Thinking...",
    reasoning: "Reasoning",
    toolCall: "Tool Call",
    regenerate: "Regenerate",
    regenerateConfirmMessage:
      "Are you sure you want to resend this message? The current reply will be replaced.",
    regenerateConfirmAction: "Confirm",
    regenerateCancelAction: "Cancel",
    stopAndResend: "Stop and Resend",
    resend: "Resend",
    stopAndResendMessage: "Stop and resend this message",
    resendMessage: "Resend this message",
    editAndResend: "Edit and Resend",
    thinkingMode: "Thinking Mode",
    thinkingLevels: {
      minimal: "Minimal",
      low: "Low",
      medium: "Medium",
      high: "High",
      xhigh: "Ultra",
    },
    tokenBudget:
      "Effective input budget {effectiveBudget} = Total limit {modelMaxTokens} - Reserve {reserveTokens}",
    // Empty state
    empty: {
      title: "Start New Conversation",
      description:
        "I can help you with code, data analysis, documentation, and more. Ask me anything!",
      onlineStatus: "Always Online",
      smartConversation: "Smart Conversation",
    },
    // Input
    input: {
      placeholder: "Type a message... (Shift+Enter for new line)",
      placeholderNoKey: "Please configure API Key in settings first",
      ariaLabel: "Type a message",
    },
    // Buttons
    buttons: {
      stop: "Stop",
      send: "Send",
      deleteTurn: "Delete this turn",
      scrollToBottom: "Scroll to bottom",
    },
    // Toast
    toast: {
      noApiKey: "Please configure API Key in settings first",
      deletedTurn: "Deleted complete conversation turn",
      stopBeforeSend: "This conversation is running. Stop it before sending a new message.",
      stopBeforeRegenerate: "Please stop the current run before regenerating.",
      conversationMissingForRegenerate: "Conversation not found. Cannot regenerate.",
      targetMessageMissing: "Target message not found. It may have been deleted.",
      onlyUserMessageRegenerate: "Only user messages can be regenerated.",
      modelNotConfigured: "Model is not configured. Please select provider and model in settings first.",
      stopBeforeEditResend: "Please stop the current run before edit-and-resend.",
      conversationMissingForEditResend: "Conversation not found. Cannot edit and resend.",
      onlyUserMessageEditResend: "Only user messages can be edited and resent.",
    },
    // Error
    error: {
      requestFailed: "Request failed:",
    },
    // Token usage
    usage: {
      highRisk: "High Risk",
      nearLimit: "Near Limit",
      comfortable: "Comfortable",
      tokenUsage:
        "Input {promptTokens} + Output {completionTokens} = {totalTokens} tokens",
    },

    // Export conversation
    export: {
      title: "Export Conversation",
      format: "Format",
      markdownDesc: "Readable, great for sharing",
      jsonDesc: "Structured data, good for backup",
      htmlDesc: "Styled page, good for printing",
      options: "Options",
      includeToolCalls: "Include tool calls",
      includeReasoning: "Include reasoning",
      addTimestamp: "Add timestamp to filename",
      messages: "messages",
      user: "user",
      assistant: "assistant",
      preparing: "Preparing...",
      complete: "Export complete!",
      failed: "Export failed",
      saved: "Saved",
      button: "Export",
    },
} as const

export const toolCallDisplay = {
    executing: "Executing...",
    arguments: "Arguments",
    result: "Result",
} as const

// Question Card (ask_user_question tool)
export const questionCard = {
    answered: "Answered",
    title: "Agent Question",
    affectedFiles: "Related Files",
    yes: "Yes",
    no: "No",
    confirm: "Confirm",
    placeholder: "Type your answer…",
    submitHint: "Ctrl+Enter to submit",
    submit: "Submit",
    customInput: "Custom input",
    customInputHint: "Type your own answer",
    userAnswer: "Your answer",
} as const
