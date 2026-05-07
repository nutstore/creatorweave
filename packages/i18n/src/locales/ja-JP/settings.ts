// 設定ダイアログ
export const settings = {
    title: "設定",
    llmProvider: "LLM プロバイダ",
    apiKey: "API Key",
    apiKeyPlaceholder: "API Keyを入力...",
    save: "保存",
    saved: "保存しました",
    apiKeyNote: "キーは AES-256 暗号化してローカルブラウザに保存されます",
    modelName: "モデル名",
    temperature: "Temperature",
    maxTokens: "最大出力トークン数",

    // Tabs
    general: "一般",
    mcp: "MCP サービス",
    sync: "クロスデバイス同期",
    offline: "オフラインタスク",
    experimental: "実験的機能",

    // General tab
    generalDescription: "言語、テーマなどの基本設定",
    language: "言語",
    languageDescription: "インターフェースの表示言語を選択",
    theme: "テーマ",
    themeDescription: "ライト/ダーク/システム設定の切り替え",
    themeLight: "ライト",
    themeDark: "ダーク",
    themeSystem: "システム",
    docs: "ドキュメント",
    docsDescription: "使用方法やヘルプを表示",

    // Experimental features
    experimentalWarning: "これらの機能は実験段階です",
    experimentalWarningDesc: "有効にすると安定性の問題が発生する可能性があります。一部の機能はプロバイダーの同時接続能力に依存します。",
    batchSpawn: "並列サブエージェント (batch_spawn)",
    batchSpawnDesc: "AIが複数のサブタスクを並列で起動できるようにします。高い同時接続数をサポートするプロバイダーが必要です。そうでない場合、レート制限エラーが発生する可能性があります。",

    // Sync panel
    syncPanel: {
      upload: "アップロード",
      downloadManage: "ダウンロード/管理",
      downloadSession: "このセッションをダウンロード",
      currentDevice: "現在のデバイス",
      deviceId: "デバイス ID",
      endToEndEncryption: "エンドツーエンド暗号化",
      encryptionNotice:
        "セッションデータはアップロード前に暗号化されます。サーバーは暗号化されたデータのみを保存し、元のコンテンツにアクセスできません。",
      preparingData: "データを準備中...",
      uploadingToCloud: "クラウドにアップロード中...",
      syncCurrentSession: "現在のセッションを同期",
      syncedSessions: "同期されたセッション",
      noSyncedSessions: "同期されたセッションはありません",
      manageAfterUpload: "セッションをアップロードするとここで管理できます",
      viewAll: "すべて表示",
      refresh: "更新",
      expiresAt: "有効期限",
      deleteSession: "このセッションを削除",
      server: "サーバー",
      status: "ステータス",

      // Time formatting
      minutesAgo: "{count}分前",
      hoursAgo: "{count}時間前",
      daysAgo: "{count}日前",

      // Error messages
      encryptionFailed: "暗号化に失敗しました",
      decryptionFailed:
        "復号化に失敗しました、データが破損している可能性があります",
      noSessionToSync: "同期するセッションデータがありません",
      downloadFailed: "ダウンロードに失敗しました",
      sessionParseFailed: "セッションデータの解析に失敗しました",
      uploadFailed: "アップロードに失敗しました、再試行してください",
      deleteFailed: "削除に失敗しました、再試行してください",
      sessionRestored: "セッションが復元されました、更新して表示してください",
      sessionDeleted: "セッションが削除されました",
      sessionSynced: "セッションが同期されました！Sync ID: {syncId}",
      sessionDownloadSuccess: "セッションがダウンロードされました！",
      confirmDelete:
        "この同期セッションを削除してもよろしいですか？この操作は元に戻せません。",
      crossDeviceSync: "デバイス間同期",
      syncDescription:
        "現在のセッションをクラウドに同期するか、クラウドからセッションをダウンロードします。エンドツーエンド暗号化をサポートし、暗号化されたデータのみが保存されます。",
      loading: "読み込み中...",
      close: "閉じる",

      // Conflict Resolution Dialog
      conflictResolution: {
        title: "ファイル衝突",
        conflictDescription: "{path} の同期中に衝突が発生しました",
        opfsVersionTime: "OPFS バージョン時刻:",
        nativeVersionTime: "ローカルバージョン時刻:",
        selectResolution: "解決方法を選択",
        keepOpfsVersion: "OPFS バージョンを保持",
        keepOpfsDescriptionModified: "Python 実行後に変更されたバージョン",
        keepOpfsDescriptionNew: " 새로作成したファイルを保持",
        keepNativeVersion: "ローカルバージョンを保持",
        keepNativeDescription:
          "ファイルシステムの元のバージョンを保持し、OPFS への変更を破棄",
        skipThisFile: "このファイルをスキップ",
        skipThisFileDescription: "このファイルを同期せず、現在の状況を維持",
        opfsVersion: "OPFS バージョン",
        nativeVersion: "ローカルバージョン",
        noContent: "コンテンツなし",
        fileNotExist: "ファイルが存在しません",
        binaryFilePreview:
          "[{source} バージョンは画像またはバイナリファイルです",
        noReadableContent:
          "[{source} バージョンに読み取り可能なテキストコンテンツがありません",
        emptyFile: "[{source} バージョンは空のファイルです",
        contentTruncated:
          "...[コンテンツが長すぎます。{charCount} 文字を truncation]",
        whyConflict: "なぜ衝突が発生しましたか？",
        conflictExplanation:
          "OPFS のファイルはローカルファイルシステムでも変更されました。",
        ifKeepNativeExists:
          "「ローカルバージョンを保持」を選択すると、OPFS への変更が破棄されます。",
        ifKeepNativeNotExists:
          "ローカルファイルが存在しません。「ローカルバージョンを保持」を選択すると、このファイルは削除されます。",
        skipThisConflict: "この衝突をスキップ",
        applySelection: "選択を適用",
        nativeNotConnected: "[ローカルディレクトリが接続されていません",
      },

      // Sync Preview Panel (Empty State)
      syncPreview: {
        emptyStateTitle: "変更のレビュー待ち",
        emptyStateDescription:
          "Pythonコード実行後に検出されたファイルシステム変更がここに表示されます。変更の詳細をプレビューし、承認または拒否を選択できます。",
        step1Title: "Pythonコードを実行",
        step1Desc: "Agent会話でPythonファイル操作コードを実行する",
        step2Title: "ファイル変更をプレビュー",
        step2Desc: "すべての変更、追加、削除されたファイルを表示",
        step3Title: "レビューと処理",
        step3Desc: "差分を確認後、変更を承認または拒否",
        detectedFiles: "{count} ファイルの変更を検出",
        added: "追加",
        modified: "変更",
        deleted: "削除",
        reviewChanges: "レビュー",
        reviewing: "レビュー中...",
        backToList: "リストに戻る",
        aiSummaryFailed: "AI生成に失敗しました。手動で入力してください",
        noActiveWorkspace: "まずプロジェクトディレクトリを選択してください",
        approvalFailed: "承認に失敗しました",
        keepNativeFailed: "ネイティブバージョンの保持に失敗しました",
        noFilesAfterConflict: "競合解決後に同期するファイルがありません",
        reviewRequestSent: "レビューリクエストを送信しました",
        reviewRequestFailed: "レビューリクエストの送信に失敗しました",
        conflictHint: "、{count} 件が競合あり",
        syncFailedCount: "{failed} ファイルの承認適用に失敗{conflicts}",
      },

      // File Change List
      fileChangeList: {
        noFileChanges: "ファイル変更なし",
        noChangesDescription:
          "Python実行後にファイルシステムの変更は検出されませんでした",
        added: "追加",
        modified: "変更",
        deleted: "削除",
        fileChangesCount: "{count} ファイル変更",
        totalCount: "合計: {count}",
        size: "サイズ: {size}",
        time: "時間: {time}",
        viewChange: "{path} の変更を表示",
      },

    },

    // Pending Sync Panel
    pendingSyncPanel: {
      title: "変更ファイル",
      noPendingChanges: "現在レビューする変更はありません",
      newChangesAppearHere: "新しい変更はここに自動的に表示されます",
      refreshTooltip: "リストを更新",
      viewDetailsTooltip: "詳細を見る",
      selectedCount: "{count} 件選択済み",
      selectAll: "すべて選択",
      removeFromList: "リストから削除",
      selectFile: "選択",
      reviewInProgress: "レビュー中...",
      review: "レビュー",
      rejectAll: "すべての変更を拒否",
      reject: "拒否",
      approveSelected: "選択したものを承認",
      approvingInProgress: "承認中...",
      syncComplete: "完了!",
      approveSelectedCount: "選択したものを承認 ({count})",
      approveAll: "すべて承認",
      totalSize: "合計: {size}",
      confirmRejectTitle: "拒否の確認",
      confirmRejectMessage:
        "すべての変更を拒否してもよろしいですか？この操作は元に戻せません。",
      cancel: "キャンセル",
      confirmReject: "拒否を確認",
      reviewSuccess: "レビュー成功！",
      rejectedAllSuccess: "すべての変更が拒否されました",
      rejectedCountWithFailure:
        "{successCount} 件の変更を拒否しました。{failedCount} 件はローカルファイルのベースラインが不足しているためリストに残っています",
      rejectChangeFailed:
        "変更の拒否に失敗しました。後でもう一度お試しください",
      syncFailed: "承認に失敗しました。後でもう一度お試しください",
      keepNativeVersionFailed: "ローカルバージョンの保持に失敗しました",
      noFilesToSyncAfterConflict: "競合処理後に同期するファイルがありません",
      reviewRequestSent: "レビュー要求が送信されました",
      sendReviewRequestFailed: "レビュー要求の送信に失敗しました",
      aiSummaryFailed: "AI 生成に失敗しました。手動で入力してください",
      createSnapshot: "承認スナップショットを作成",
      onlySyncWithLocalDir:
        "ローカルディレクトリがある場合にのみディスクに同期",
      syncSuccessMarkSnapshot:
        "同期成功后、スナップショットを同期済みとしてマーク",
      syncFailedCount: "{failed} ファイルの承認適用に失敗しました{conflicts}",
      conflictCount: "、{count} 件が競合あり",
      detectConflict: "競合を検出",
      conflictDetectFailed: "競合検出に失敗しました。承認を続行します",
      noConflictShowDialog: "競合なし、承認ダイアログを表示",
      pendingChanges: "保留中の変更",
      skipConflict: "この競合をスキップ",
      currentDraft: "現在の下書き",
      snapshotLabel: "スナップショット {id}",
      saved: "保存済み",
      approved: "承認済み",
      rolledBack: "ロールバック済み",
      reviewElements: "要素をレビュー",
      copyPath: "パスをコピー",
      processing: "処理中...",
      draft: "下書き",
      // Error messages for review-request.ts
      noActiveWorkspace: "アクティブなワークスペースがありません",
      noChangesToReview: "レビューする変更がありません",
      pleaseConfigureApiKey: "まずAPI Keyを設定してください",
      conversationRunningPleaseWait:
        "現在の会話は実行中です。しばらくしてから再試行してください",
      reviewConversationTitle: "変更レビュー",
    },

    // モデル設定 - カテゴリーラベル
    categories: {
      international: "国際プロバイダー",
      chinese: "中国プロバイダー",
      custom: "カスタム",
    },

    // モデル機能
    capabilities: {
      code: "コード",
      writing: "文章作成",
      reasoning: "推論",
      vision: "視覚",
      fast: "高速",
      "long-context": "長いコンテキスト",
    },

    // Token 統計
    tokenStats: {
      title: "使用統計",
      noUsage: "使用統計がありません",
      totalTokens: "総 Tokens",
      requestCount: "リクエスト数",
      inputTokens: "入力 Tokens",
      outputTokens: "出力 Tokens",
    },

    // Toast メッセージ
    toast: {
      apiKeyCleared: "API Key がクリアされました",
      providerNameRequired:
        "プロバイダー名、Base URL、モデル名を入力してください",
      customProviderAdded: "カスタムプロバイダーが追加されました",
      invalidProviderInfo: "有効なプロバイダー情報を入力してください",
      customProviderUpdated: "カスタムプロバイダーが更新されました",
      selectProviderFirst: "まずプロバイダーを作成して選択してください",
      modelNameRequired: "モデル名は空にできません",
      modelAdded: "モデルが追加されました",
      apiKeyRequired: "先にAPI Keyを保存してください",
      modelsRefreshed: "APIからモデルリストを更新しました",
    },

    // モデル管理
    modelManagement: {
      title: "カスタムプロバイダー",
      myProviders: "マイプロバイダー",
      selectProvider: "プロバイダーを選択",
      noCustomProviders: "カスタムプロバイダーがまだ追加されていません",
      emptyHint: "「プロバイダーを追加」をクリックして OpenAI 互換 API に接続",
      providerName: "プロバイダー名",
      providerNamePlaceholder: "例：Ollama ローカル、マイリレー",
      defaultModel: "デフォルトモデル",
      defaultModelPlaceholder: "例：gpt-4o, deepseek-chat",
      save: "保存",
      add: "プロバイダーを追加",
      cancel: "キャンセル",
      create: "作成",
      newProvider: "新規プロバイダー",
      editProvider: "プロバイダーを編集",
      deleteProvider: "プロバイダーを削除",
      confirmDeleteTitle: "プロバイダーを削除",
      confirmDeleteMessage: "「{name}」を削除しますか？関連する API Key も削除されます。この操作は取り消せません。",
      confirmDelete: "削除を確認",
      modelList: "モデルリスト",
      newModelName: "モデル名を入力",
      addModel: "モデルを追加",
      addModelShort: "追加",
      removeModel: "モデル {name} を削除",
    },

    // モデル選択
    modelSelection: {
      useCustomModelName: "手動入力",
      customModelHint:
        "有効にすると任意のモデル名を入力でき、新しくリリースされたモデルに最適です",
      refreshModels: "APIからモデルリストを更新",
    },

    // カスタム Base URL
    customBaseUrl: {
      label: "API Base URL",
      placeholder: "https://api.example.com/v1",
      hint: "OpenAI 互換の API エンドポイントに対応",
    },

    // 高度なパラメータ
    advancedParameters: "高度なパラメータ",
    temperatureOptions: {
      precise: "精密",
      creative: "創造的",
    },
    maxIterations: "最大反復回数",
    maxIterationsHint: "単一 Agent Loop における最大 assistant ターン数を制限",
    maxIterationsUnlimited: "無制限",
    maxIterationsUnlimitedHint:
      "単一 Agent Loop で assistant ターン数を無制限にします",

    // 思考モード
    thinkingMode: "思考モード",
    thinkingLevels: {
      minimal: "浅",
      low: "低",
      medium: "中",
      high: "深",
      xhigh: "超深",
    },
    thinkingModeFast: "高速",
    thinkingModeDeep: "深堀り",

    // 外部リンク
    getApiKey: "API Key を取得",
    notConfigured: "未設定",

    // デフォルトモデル選択
    defaultModel: {
      title: "デフォルトモデル",
      description: "会話で使用するプロバイダとモデルを選択",
      selectModel: "モデルを選択",
      noProviders: "先にプロバイダの API Key を設定してください",
      manualInput: "手動入力",
      manualPlaceholder: "モデル名を入力、例: gpt-4o",
    },

    // プロバイダ管理
    providerManager: {
      title: "プロバイダ管理",
      defaultModels: "(デフォルト)",
    },
} as const
