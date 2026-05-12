// 会話
export const conversation = {
    thinking: "思考：オフ",
    reasoning: "推論プロセス",
    toolCall: "ツール呼び出し",
    regenerate: "再生成",
    regenerateConfirmMessage:
      "このメッセージを再送信してもよろしいですか？現在の返信は置き換えられます。",
    regenerateConfirmAction: "確認",
    regenerateCancelAction: "キャンセル",
    stopAndResend: "停止して再送信",
    resend: "再送信",
    stopAndResendMessage: "このメッセージの停止して再送信",
    resendMessage: "このメッセージを再送信",
    editAndResend: "編集して再送信",
    branch: "ここから分岐",
    thinkingMode: "思考モード",
    thinkingLevels: {
      minimal: "浅",
      low: "低",
      medium: "中",
      high: "深",
      xhigh: "超深",
    },
    tokenBudget:
      "有効な入力予算 {effectiveBudget} = 上限 {modelMaxTokens} - 予約 {reserveTokens}",
    empty: {
      title: "新しい会話を開始",
      description:
        "コード、データ分析、ドキュメント作成など、様々なタスクをお手伝いします。質問を入力してください！",
      onlineStatus: "常時オンライン",
      smartConversation: "スマート会話",
    },
    input: {
      placeholder: "メッセージを入力... (Shift+Enter で改行)",
      placeholderNoKey: "まず設定で API Key を設定してください",
      ariaLabel: "メッセージを入力",
    },
    buttons: {
      stop: "停止",
      send: "送信",
      deleteTurn: "このターンを削除",
      scrollToBottom: "下にスクロール",
    },
    toast: {
      noApiKey: "まず設定で API Key を設定してください",
      deletedTurn: "完全な会話ターンを削除しました",
      branchCreated: "分岐会話を作成しました",
    },
    error: {
      requestFailed: "リクエスト失敗：",
    },
    usage: {
      highRisk: "高リスク",
      nearLimit: "上限に近い",
      comfortable: "余裕あり",
      tokenUsage:
        "入力 {promptTokens} + 出力 {completionTokens} = {totalTokens} tokens",
    },

    // ナビゲーション
    nav: {
      label: "メッセージナビゲーション",
    },

    // 会話エクスポート
    export: {
      title: "会話をエクスポート",
      format: "フォーマット",
      markdownDesc: "読みやすく、共有に最適",
      jsonDesc: "構造化データ、バックアップに適している",
      htmlDesc: "スタイル付きページ、印刷に適している",
      options: "オプション",
      includeToolCalls: "ツール呼び出しを含む",
      includeReasoning: "推論過程を含む",
      addTimestamp: "ファイル名にタイムスタンプを追加",
      messages: "件のメッセージ",
      user: "件のユーザー",
      assistant: "件のアシスタント",
      preparing: "準備中...",
      complete: "エクスポート完了！",
      failed: "エクスポートに失敗しました",
      saved: "保存済み",
      button: "エクスポート",
    },
} as const

export const toolCallDisplay = {
    executing: "実行中...",
    arguments: "引数",
    result: "結果",
} as const

// Question Card (ask_user_question tool)
export const questionCard = {
    answered: "回答済み",
    title: "エージェントからの質問",
    affectedFiles: "関連ファイル",
    yes: "はい",
    no: "いいえ",
    confirm: "確認",
    placeholder: "回答を入力してください…",
    submitHint: "Ctrl+Enter で送信",
    submit: "送信",
    customInput: "カスタム入力",
    customInputHint: "自分で回答を入力",
    userAnswer: "あなたの回答",
} as const
