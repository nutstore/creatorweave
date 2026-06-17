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
      placeholderQueuing: "メッセージをキューに追加... (Shift+Enter で改行)",
      ariaLabel: "メッセージを入力",
      hints: {
        fileMention: "# でファイル参照",
        agentMention: "@ でエージェントを指定",
        slashCommand: "/ でコマンドを使用",
      },
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
      messageQueued: "メッセージをキューに追加しました (位置 {position})",
      queueFull: "キューが満杯です。現在のタスクが完了するまでお待ちください。",
    },
    error: {
      requestFailed: "リクエスト失敗：",
      retry: "再試行",
    },
    // 反復回数制限
    iterationLimit: {
      reached: "最大反復回数に達しました（{count} 回）",
      continue: "続行",
      hint: "タスクが未完了の可能性があります。メッセージを送信してエージェントの作業を継続できます",
    },
    // 画像生成
    imageGen: {
      title: "画像生成",
      model: "モデル",
      aspectRatio: "デフォルトのアスペクト比",
      previewFullscreen: "フルスクリーンプレビュー",
      downloadImage: "画像をダウンロード",
      generating: "画像を生成中...",
      generated: "画像が生成されました",
      noResult: "画像生成完了（結果なし）",
      failed: "画像生成に失敗しました: {error}",
      emptyPrompt: "画像の説明を入力してください。例: /image オレンジ色の猫",
      emptyPromptRegenerate: "画像の説明が空です。再生成できません",
      waitRunning: "現在のタスクが完了するまでお待ちください",
      configureProvider: "先にプロバイダーを設定してください",
      apiKeyMissing: "API Keyが設定されていません。設定で構成してください",
      aspectRatios: {
        '1:1': "正方形",
        '16:9': "ワイド",
        '9:16': "縦長",
        '4:3': "横長",
        '3:4': "縦型",
        '3:2': "写真",
        '2:3': "ポスター",
      },
    },
    // Codex OAuth エラー
    codex: {
      error: {
        authRequired: "Codex 認証が必要です",
        authRequiredDesc: "Codex セッションが期限切れか認証されていません。ブラウザ拡張機能を開いて再認証してください。",
        openExtension: "拡張機能を開く",
        extensionRequired: "拡張機能が利用できません",
        extensionRequiredDesc: "Codex プロバイダーを使用するには、CreatorWeave ブラウザ拡張機能がインストールされ有効になっている必要があります。",
        installExtension: "拡張機能をインストール",
        rateLimited: "Codex リクエスト制限",
        rateLimitedDesc: "リクエストが多すぎるか、5時間/週の使用量上限に達した可能性があります。しばらく待ってから再試行してください。",
        networkError: "ネットワーク接続エラー",
        networkErrorDesc: "Codex サービスに接続できません。インターネット接続を確認して再試行してください。",
      },
    },
    usage: {
      highRisk: "高リスク",
      nearLimit: "上限に近い",
      comfortable: "余裕あり",
      tokenUsage:
        "入力 {promptTokens} + 出力 {completionTokens} = {totalTokens} tokens",
      input: "入力トークン（キャッシュ除く）",
      output: "出力トークン",
      cache: "キャッシュヒットトークン",
    },
    usageBar: {
      title: "会話の累計消費",
      cost: "約 {amount}",
      unknownPricing: "{model} の価格データなし",
      costBreakdown:
        "{model}: 入力 {input} + 出力 {output} + キャッシュ {cache}",
      barTooltip:
        "入力 {input} + 出力 {output} + キャッシュ {cache}",
    },

    // ナビゲーション
    nav: {
      label: "メッセージナビゲーション",
    },
    // メッセージキュー
    queue: {
      badge: "{count} 件待機中",
      divider: "{count} 件のメッセージが待機中",
      remove: "キューから削除",
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
    // Web renderers
    fetching: "取得中",
    noResults: "結果なし",
    noContent: "コンテンツなし",
    resultCount: "{count} 件の結果",
    moreCount: "+{count} 件",
    moreLines: "{count} 行を表示",
    collapse: "折りたたむ",
    lines: "{count} 行",
    chars: "{count} 文字",
    truncated: "切り詰め",
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
    recommended: "推奨",
} as const
