export const jaJP = {
  // 共通
  common: {
    save: "保存",
    cancel: "キャンセル",
    confirm: "確認",
    delete: "削除",
    close: "閉じる",
    search: "検索",
    refresh: "更新",
    loading: "読み込み中...",
    processing: "処理中...",
    error: "エラー",
    success: "成功",
    copy: "コピー",
    copied: "コピーしました",
  },

  // アプリ初期化
  app: {
    initializing: "初期化中...",
    preparing: "準備中...",
    loadProgress: "読み込み進捗",
    firstLoadHint: "初回読み込みには数秒かかる場合があります",
    productName: "CreatorWeave",
    initComplete: "初期化完了",
    initFailed: "初期化に失敗しました",
    sessionStorageOnly:
      "データは現在のセッションのみ保存され、更新時に失われます",
    localStorageMode: "ローカルストレージモードを使用中",
    migrationInProgress: "データを移行中",
    migrationComplete: "移行完了",
    conversationsMigrated: "{count} 件の会話",
    // App toast messages
    resetDatabaseFailed:
      "データベースのリセットに失敗しました。ページを手動で更新してください",
    localDataCleared: "ローカルデータが消去されました。最初からやり直せます",
    clearFailedCloseOtherTabs:
      "消去に失敗しました：まずこのアプリの他のタブ/ウィンドウを閉じてから再試行してください",
    clearLocalDataFailed: "ローカルデータの消去に失敗しました",
    storageInitError: "ストレージの初期化エラー",
    projectNotFound: "プロジェクトが見つからないか、削除されました",
    switchProjectFailed:
      "プロジェクトの切り替えに失敗しました。しばらくしてから再試行してください",
    noWorkspaceInProject: "現在のプロジェクトにはワークスペースがありません",
    projectCreated: "プロジェクト「{name}」が作成されました",
    projectCreatedButSwitchFailed:
      "プロジェクトは作成されましたが、切り替えに失敗しました。手動で再試行してください",
    createProjectFailed:
      "プロジェクトの作成に失敗しました。しばらくしてから再試行してください",
    projectRenamed: "プロジェクト名を変更しました",
    renameFailed: "名前変更に失敗しました。しばらくしてから再試行してください",
    projectArchived: "プロジェクトをアーカイブしました",
    projectUnarchived: "プロジェクトのアーカイブを解除しました",
    archiveFailed:
      "アーカイブに失敗しました。しばらくしてから再試行してください",
    unarchiveFailed:
      "アーカイブ解除に失敗しました。しばらくしてから再試行してください",
    projectDeleted: "プロジェクトを削除しました",
    deleteFailed: "削除に失敗しました。しばらくしてから再試行してください",
    // Database refresh dialog
    databaseConnectionLost: "データベース接続が切断されました",
    whatHappened: "何が発生しましたか？",
    databaseHandleInvalidExplanation:
      "ブラウザタブが休止状態になると、データベースファイルハンドルが無効になります。これは通常のブラウザ動作です。",
    ifJustClearedData:
      "「データ消去」を実行したばかりの場合は、まず同じオリジンの他のタブ/ウィンドウを閉じてから、このページを更新してください。",
    yourDataIsSafe: "会話データは安全です！",
    dataStoredInOPFS:
      "データはブラウザのOPFSに保存されており、一時的にアクセスできないだけです。",
    willAutoRecoverAfterRefresh:
      "ページを更新すると、データベース接続は自動的に回復します。",
    refreshPage: "ページを更新",
    cannotCloseDialog:
      "このダイアログは閉じられません - 上のボタンをクリックしてページを更新してください",
    databaseInitFailed: "データベースの初期化に失敗しました",
    databaseResetExplanation:
      "これはデータベースの破損または移行の失敗による可能性があります。データベースをリセットすると、すべてのデータがクリアされ再作成されます。",
    resetDatabase: "データベースをリセット",
    reloadPage: "ページを再読み込み",
  },

  // トップバー
  topbar: {
    productName: "CreatorWeave",
    openFolder: "フォルダを開く",
    switchFolder: "プロジェクトフォルダを切り替え",
    noApiKey: "API Key が設定されていません",
    settings: "設定",
    skillsManagement: "スキル管理",
    projectLabel: "プロジェクト: {name}",
    workspaceLabel: "ワークスペース: {name}",
    tooltips: {
      backToProjects: "プロジェクト一覧に戻る",
      menu: "メニュー",
      openApiKeySettings: "API Key 設定を開く",
      workspaceSettings: "ワークスペースレイアウトと設定",
      toolsPanel: "ツールパネル",
      commandPalette: "コマンドパレット (Cmd/Ctrl+K)",
      skillsManager: "スキル管理",
      mcpSettings: "MCP サービス設定",
      appSettings: "アプリ設定",
      docs: "ドキュメント",
      more: "もっと",
      webContainer: "WebContainer",
    },
    mobile: {
      workDirectory: "作業ディレクトリ",
      workspaceSettings: "ワークスペース設定",
      skills: "スキル",
      commandPalette: "コマンドパレット",
      mcpSettings: "MCP 設定",
      docs: "ドキュメント",
      connection: "接続",
      storage: "ストレージ",
      language: "言語",
      theme: "テーマ",
    },
  },

  // フォルダ選択
  folderSelector: {
    openFolder: "フォルダを選択",
    switchFolder: "フォルダを切り替え",
    releaseHandle: "ハンドルを解放",
    copyPath: "フォルダ名をコピー",
    permissionDenied: "権限が拒否されました",
    selectionFailed: "選択に失敗しました",
    sandboxMode: "サンドボックスモード (OPFS)",
    restorePermission: "権限を回復",
    needsPermissionRestore: "権限の回復が必要",
    loading: "読み込み中...",
    unknown: "不明",
    storageWarning: "キャッシュ",
    storageTooltip:
      "永続ストレージが許可されていません。クリックして再試行。キャッシュは更新時にクリアされる可能性があります。",
    storageSuccess: "ストレージが永続化されました",
    storageFailed: "永続ストレージを取得できません",
    storageRequestFailed: "リクエストに失敗しました",
  },

  // 設定ダイアログ
  settings: {
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

    // Sync tabs
    sync: "クロスデバイス同期",
    offline: "オフラインタスク",

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

      // Sync Progress Dialog
      syncProgress: {
        syncingFile: "ファイルを同期",
        syncCompleted: "同期完了",
        syncFailed: "同期失敗",
        syncing: "同期中...",
        totalProgress: "全体の進行状況",
        filesProgress: "{completed} / {total} ファイル",
        estimatedTime: "推定残り時間",
        remaining: "残り",
        syncSuccess: "同期成功",
        preparing: "同期準備中...",
        close: "閉じる",
        cancel: "キャンセル",
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

      // File Diff Viewer
      fileDiffViewer: {
        selectFile: "ファイルを選択して詳細を表示",
        selectFileHint:
          "左側のリストからファイルを選択して、バージョンと現在のファイルの差分を表示",
        loadingFile: "ファイル内容を読み込み中...",
        loadFailed: "読み込み失敗",
        afterSnapshot: "スナップショット後",
        beforeSnapshot: "スナップショット前",
        currentFile: "現在のファイル",
        changedVersion: "変更バージョン",
        binarySnapshot: "バイナリスナップショット比較",
        binaryContent:
          "バイナリ内容はテキストレベルの差分をサポートしていません。ファイルをダウンロードするか、専用バイナリ比較ツールを使用してください。",
        noImageContent: "画像コンテンツなし",
        fileDeleted: "ファイル削除済み（変更バージョンに内容なし）",
        cannotReadChangedVersion: "変更バージョンの内容を読み込めません",
        loadingMonaco: "Monacoエディタを読み込み中...",
        modified: "変更",
        current: "現在",
        addComment: "コメントを追加...",
        send: "送信",
        commentsCount: "{count} 件のコメント",
        snapshotTitle: "{title} · {time}",
        reviewElements: "要素をレビュー",
        previewHTMLNewTab: "新しいタブでHTMLをプレビューして要素をレビュー",
        mergeView: "マージビュー",
        splitView: "スプリットビュー",
        template: "テンプレート",
        comments: "コメント",
        deleteWarning: "（削除予定）",
        previewHTML: "HTMLをプレビュー",
        cannotReadNativeImage: "ネイティブ画像を読み込めません",
        cannotReadChangedImage: "変更バージョンの画像を読み込めません",
        imageWillBeDeleted: "画像は削除されます（変更バージョンに内容なし）",
        currentFileComments: "現在のファイルコメント",
        close: "閉じる",
        // AI review prompt
        reviewPromptIntro:
          "以下のファイルスナップショットをレビューして修正提案をください：",
        file: "ファイル",
        changeType: "変更タイプ",
        snapshot: "スナップショット",
        recordedAt: "記録時間",
        reviewOutput: "以下を出力してください：",
        issueList: "問題リスト（重大度順）",
        actionableSuggestions: "直接実行可能な修正提案",
        codePatch: "コード変更が必要な場合は、最小限のパッチを提供してください",
        noWorkspace: "アクティブなワークスペースがありません",
        noChangesToReview: "レビューする変更がありません",
        configureApiKey: "まずAPI Keyを設定してください",
        conversationRunning:
          "現在の会話は実行中です。後でもう一度お試しください",
        reviewConversation: "変更レビュー",
        // Error messages
        loadFailedError: "ファイルの読み込みに失敗しました",
        cannotReadNativeContent:
          "ネイティブファイル内容を表示するにはプロジェクトディレクトリを選択してください",
        readNativeFileFailed: "ネイティブファイルの読み込みに失敗しました",
        // Snapshot comparison
        beforeSnapshotLabel: "スナップショット前",
        afterSnapshotLabel: "スナップショット後",
        binary: "バイナリ",
        text: "テキスト",
        none: "なし",
        size: "サイズ",
      },

      // Monaco Diff Editor
      monacoDiffEditor: {
        lineHasComment: "この行にはコメントがあります",
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
    },

    // モデル管理
    modelManagement: {
      title: "カスタムプロバイダー",
      selectProvider: "プロバイダーを選択",
      noCustomProviders: "カスタムプロバイダーがまだ追加されていません",
      providerName: "プロバイダー名",
      defaultModel: "デフォルトモデル、例: gpt-4o-mini",
      save: "保存",
      add: "追加",
      deleteProvider: "プロバイダーを削除",
      modelList: "モデルリスト",
      newModelName: "新しいモデル名",
      addModel: "モデルを追加",
      removeModel: "モデル {name} を削除",
    },

    // モデル選択
    modelSelection: {
      useCustomModelName: "手動入力",
      customModelHint:
        "有効にすると任意のモデル名を入力でき、新しくリリースされたモデルに最適です",
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
  },

  workspaceSettings: {
    title: "ワークスペース設定",
    close: "閉じる",
    done: "完了",
    tabs: {
      layout: "レイアウト",
      display: "表示",
      shortcuts: "ショートカット",
      data: "データ",
      ariaLabel: "設定オプション",
    },
    layout: {
      title: "レイアウト設定",
      description: "ワークスペース内のパネルサイズと比率を調整します",
      sidebarWidth: "サイドバー幅: {value}px",
      conversationArea: "会話エリア: {value}%",
      previewPanel: "プレビュー パネル: {value}%",
      resetLayout: "レイアウトをリセット",
      resetLayoutConfirm: "レイアウト設定をリセットしてもよろしいですか？",
    },
    display: {
      themeTitle: "テーマ設定",
      themeDescription: "お好みの表示テーマを選択します",
      theme: {
        light: "ライト",
        dark: "ダーク",
        system: "システム",
      },
      editorTitle: "エディタ表示",
      editorDescription: "エディタの見た目と動作を設定します",
      fontSize: "フォントサイズ",
      font: {
        small: "小",
        medium: "中",
        large: "大",
      },
      showLineNumbers: "行番号を表示",
      wordWrap: "折り返し",
      showMiniMap: "ミニマップを表示",
    },
    shortcuts: {
      title: "ショートカット",
      description: "キーボードショートカットを管理・確認します",
      showAllTitle: "すべてのショートカットを表示",
      showAllDescription: "ショートカットヘルプパネルを開きます",
      view: "表示",
      tipLabel: "ヒント:",
      tipCommand: "/key",
      tipSuffix: "でショートカット一覧をすぐに開けます。",
    },
    data: {
      title: "データ管理",
      description: "最近使ったファイルと設定を管理します",
      recentFilesTitle: "最近使ったファイル",
      recentFilesCount: "合計 {count} 件",
      clear: "クリア",
      clearRecentConfirm: "最近使ったファイル履歴をクリアしますか？",
      warningTitle: "注意:",
      warningDescription: "以下の操作は現在のワークスペース設定に影響します。",
      resetAllTitle: "すべての設定をリセット",
      resetAllDescription: "レイアウト、表示、エディタ設定を既定値に戻します。",
      resetAll: "すべてリセット",
      resetAllConfirm:
        "ワークスペース設定をすべてリセットしてもよろしいですか？",
    },
  },

  // ウェルカムページ
  welcome: {
    title: "CreatorWeave",
    tagline:
      "ナレッジベースとマルチエージェント編成のための AI ネイティブ Creator Workspace",
    placeholder: "メッセージを入力して会話を開始...",
    placeholderNoKey: "まず設定で API Key を設定してください",
    send: "送信",
    openLocalFolder: "ローカルフォルダを開く",
    recentHint:
      "左側から既存の会話を選択するか、メッセージを入力して新しい会話を開始してください",
    viewCapabilities: "機能を見る",
    // Drag and drop overlay
    dropFilesHere: "ファイルをここにドロップ",
    supportsFileTypes: "CSV、Excel、PDF、画像などのファイルに対応",
    apiKeyRequiredHint:
      "まずモデル設定で API Key を構成してから会話を始めてください",
    filesReady: "{count} 件のファイルが準備完了",
    personas: {
      developer: {
        title: "開発者",
        description: "コード理解、デバッグ、リファクタリング",
        examples: {
          0: "この関数の動作を説明して",
          1: "このコードのバグを見つけて",
          2: "パフォーマンス改善のためにリファクタリングして",
        },
      },
      analyst: {
        title: "データアナリスト",
        description: "データ処理、可視化、インサイト",
        examples: {
          0: "CSVの売上データを分析して",
          1: "Excelからチャートを作成して",
          2: "主要な指標をまとめて",
        },
      },
      researcher: {
        title: "学生 / 研究者",
        description: "ドキュメント読解、学習、知識整理",
        examples: {
          0: "このドキュメントを要約して",
          1: "技術的な概念を説明して",
          2: "ファイル間で情報を探して",
        },
      },
      office: {
        title: "オフィスワーカー",
        description: "ドキュメント処理、レポート作成、コンテンツ制作",
        examples: {
          0: "データからレポートを下書きして",
          1: "ドキュメントを整理・フォーマットして",
          2: "複数のファイルを処理して",
        },
      },
    },
  },

  // スキル管理
  skills: {
    title: "スキル管理",
    searchPlaceholder: "スキル名、説明、タグを検索...",
    filterAll: "すべて",
    filterEnabled: "有効",
    filterDisabled: "無効",
    projectSkills: "プロジェクトスキル",
    mySkills: "マイスキル",
    builtinSkills: "組み込みスキル",
    enabledCount: "{count} / {total} 有効",
    createNew: "新規スキル",
    deleteConfirm: "このスキルを削除してもよろしいですか？",
    edit: "編集",
    delete: "削除",
    enabled: "有効",
    disabled: "無効",
    empty: "スキルがありません",
    categories: {
      codeReview: "コードレビュー",
      testing: "テスト",
      debugging: "デバッグ",
      refactoring: "リファクタリング",
      documentation: "ドキュメント",
      security: "セキュリティ",
      performance: "パフォーマンス",
      architecture: "アーキテクチャ",
      general: "汎用",
    },
    projectDialog: {
      title: "プロジェクトスキルを発見",
      description:
        "プロジェクトで {count} 個のスキルを発見しました。ワークスペースに読み込みますか？",
      selectAll: "すべて選択",
      deselectAll: "選択解除",
      selected: "選択済み",
      load: "読み込み",
      loadAll: "すべて読み込み",
      skip: "スキップ",
    },
  },

  skillCard: {
    enabled: "有効",
    disabled: "無効",
    project: "プロジェクト",
    viewDetails: "詳細を見る",
    edit: "編集",
    delete: "削除",
    category: {
      codeReview: "コードレビュー",
      testing: "テスト",
      debugging: "デバッグ",
      refactoring: "リファクタリング",
      documentation: "ドキュメント",
      security: "セキュリティ",
      performance: "パフォーマンス",
      architecture: "アーキテクチャ",
      general: "汎用",
    },
  },

  skillEditor: {
    editSkill: "スキルを編集",
    createSkill: "新規スキル作成",
    editDescription: "既存のスキル設定と内容を変更",
    createDescription: "AI 能力を拡張するカスタムスキルを作成",
    preview: "プレビュー",
    edit: "編集",
    editMode: "編集モード",
    createMode: "作成モード",
    cancel: "キャンセル",
    saving: "保存中...",
    save: "保存",
    basicInfo: "基本情報",
    skillName: "スキル名",
    category: "分類",
    selectCategory: "分類を選択",
    skillNamePlaceholder: "例: code-reviewer",
    description: "説明",
    descriptionPlaceholder: "このスキルの機能を簡潔に説明",
    tagsPlaceholder: "review, quality",
    triggerKeywords: "トリガーキーワード",
    triggerKeywordsPlaceholder: "レビュー, 確認",
    triggerKeywordsHelp: "カンマ区切り、マッチ時に自動起動",
    fileExtensions: "ファイル拡張子",
    fileExtensionsHelp: "オプション、特定のファイルタイプ用に起動",
    skillContent: "スキル内容",
    instruction: "指示",
    instructionPlaceholder:
      "あなたはコードレビュー専門家です。ユーザーにコードレビューを求めた時：\n1. 型安全性を分析\n2. パフォーマンスの問題を確認\n3. 可読性を評価",
    exampleDialog: "例会話",
    exampleDialogPlaceholder:
      "ユーザー：「このコンポーネントをレビュー帮我」\nAI：「確認します...」",
    exampleDialogHelp: "オプション、例を提供してAIの理解を助ける",
    outputTemplate: "出力テンプレート",
    outputTemplatePlaceholder:
      "## レビュー報告\n- ファイル：{{filename}}\n- 問題：{{issues}}",
    outputTemplateHelp: "オプション、標準出力形式を定義",
    uncategorized: "未分類",
    lines: "行",
    characters: "文字",
    skillMdPreview: "SKILL.md プレビュー",
    // Validation errors
    nameRequired: "スキル名を入力してください",
    descriptionRequired: "説明を入力してください",
    saveFailed: "保存に失敗しました",
    // Category labels
    categories: {
      codeReview: "コードレビュー",
      testing: "テスト",
      debugging: "デバッグ",
      refactoring: "リファクタリング",
      documentation: "ドキュメント",
      security: "セキュリティ",
      performance: "パフォーマンス",
      architecture: "アーキテクチャ",
      general: "汎用",
    },
  },

  webContainer: {
    // Status labels
    statusIdle: "アイドル",
    statusBooting: "コンテナ起動中",
    statusSyncing: "ファイル同期中",
    statusInstalling: "依存関係インストール中",
    statusStarting: "サービス起動中",
    statusRunning: "実行中",
    statusStopping: "停止中",
    statusError: "エラー",
    // Project info
    unrecognisedProject: "認識できないプロジェクト",
    // Config section
    startupConfig: "起動設定",
    startupConfigHelp:
      "モノレポまたはマルチアプリディレクトリ構造をサポートするためにサブディレクトリとスクリプトを選択できます。",
    directorySelect: "ディレクトリ",
    selectDirectory: "ディレクトリを選択",
    currentStartupDir: "現在の起動ディレクトリ",
    dirChangeRequiresRestart:
      "ディレクトリを変更すると再起動または再起動才会生效",
    advancedOptions: "高度なオプション",
    startupDirManual: "起動ディレクトリ（手動）",
    startupDirPlaceholder: "例：apps/web（デフォルト .）",
    startupScript: "起動スクリプト",
    selectStartupScript: "起動スクリプトを選択",
    autoScript: "自動（現在: {name}）",
    // Buttons
    start: "起動",
    stop: "停止",
    restart: "再起動",
    sync: "同期",
    reinstallDeps: "依存関係再インストール",
    // Log section
    logOutput: "ログ出力 ({count})",
    clearLogs: "クリア",
    copyLogs: "コピー",
    openPreview: "プレビューを開く",
    noOutputYet: "出力がまだありません，「起動」をクリックして開始",
    // Directory picker dialog
    selectStartupDir: "起動ディレクトリを選択",
    selected: "選択済み: {path}",
    resetToProjectRoot: "プロジェクトルートにリセット",
    confirm: "確認",
    cancel: "キャンセル",
    projectDirectory: "プロジェクトディレクトリ",
    // Toast messages
    logsCopied: "ログがクリップボードにコピーされました",
    copyLogsFailed:
      "ログのコピーに失敗しました，ブラウザの権限を確認してください",
  },

  workflowEditor: {
    // Node Properties Panel
    properties: "プロパティ",
    selectNodeToEdit: "ノードを選択してプロパティを編集",
    clickCanvasNode:
      "キャンバスのノードをクリックするか、右側から新しいノードを追加",
    kind: "タイプ",
    role: "役割",
    outputKey: "出力キー",
    taskInstruction: "タスク指示",
    taskInstructionHint: "クリアしてデフォルトを復元",
    setAsWorkflowEntry: "ワークフローエントリに設定",
    maxRetries: "最大再試行",
    timeout: "タイムアウト (ms)",
    advancedConfig: "高度設定",
    // Model config
    modelConfig: "モデル設定",
    modelProvider: "モデルプロバイダー",
    useDefault: "デフォルトを使用",
    modelId: "モデル ID",
    temperature: "Temperature",
    maxTokens: "最大トークン",
    resetToDefault: "デフォルトにリセット",
    // Prompt template
    promptTemplate: "プロンプトテンプレート",
    templateContent: "テンプレート内容",
    templateContentHint: "{{変数}} 構文をサポート",
    templatePlaceholder:
      "カスタムプロンプトテンプレート、{{outputKey}} を使用してアップストリーム出力を参照...",
    availableVariables: "利用可能な変数：",
    upstreamOutput: "アップストリームノード出力",
    useDefaultTemplate: "デフォルトテンプレートを使用",
    // Node kinds
    plan: "計画",
    produce: "制作",
    review: "レビュー",
    repair: "修復",
    assemble: "アセンブル",
    condition: "条件",
    planDescription: "目標と戦略を定義",
    produceDescription: "作成タスクを実行",
    reviewDescription: "出力品質を確認",
    repairDescription: "レビュー問題を修正",
    assembleDescription: "最終出力を統合",
    conditionDescription: "条件分岐の判断",
    // Add node toolbar
    add: "追加",
    addNodeTooltip: "{kind}ノードを追加 - {description}",
    // Canvas context menu
    addNodes: "ノードを追加",
    fitView: "表示に合わせる",
    editProperties: "プロパティを編集",
    setAsEntry: "エントリに設定",
    deleteNodeContext: "ノードを削除",
    // Node card
    entry: "エントリ",
    retry: "再試行",
    timeoutSec: "タイムアウト",
    // Actions
    deleteNode: "ノードを削除",
    // Canvas empty state
    noWorkflowYet: "ワークフローがまだありません",
    createOrOpenWorkflow:
      "新しいワークフローを作成するか、既存のワークフローを開く",
    // Custom workflow manager
    myWorkflows: "マイワークフロー",
    createWorkflow: "ワークフローを作成",
    editWorkflow: "ワークフローを編集",
    deleteWorkflow: "ワークフローを削除",
    workflowName: "ワークフロー名",
    workflowNamePlaceholder: "例：コードレビューパイプライン",
    workflowDescription: "説明",
    workflowDescriptionPlaceholder: "このワークフローの説明を記述...",
    confirmDelete: "削除の確認",
    workflowDeleted: "ワークフローが削除されました",
    createFailed: "ワークフローの作成に失敗しました",
    updateFailed: "ワークフローの更新に失敗しました",
    deleteFailed: "ワークフローの削除に失敗しました",
    importFailed: "ワークフローのインポートに失敗しました",
  },

  customWorkflowManager: {
    title: "ワークフロー管理",
    subtitle: "カスタムワークフローを管理",
    createNew: "新規ワークフロー",
    searchPlaceholder: "ワークフローを検索...",
    noResultsWithSearch: "一致するワークフローが見つかりません",
    noResultsWithoutSearch: "カスタムワークフローがまだありません",
    tryDifferentKeyword: "別のキーワードを試してください",
    clickToCreateFirst:
      "「ワークフローを作成」をクリックして最初のワークフローを作成してください",
    // Domain labels
    generic: "汎用",
    novel: "小説作成",
    video: "動画スクリプト",
    course: "コース作成",
    custom: "カスタム",
    nodesCount: "{count} ノード",
    // Status
    enabled: "有効",
    disabled: "無効",
    updatedAt: "{date} に更新",
    // Delete dialog
    confirmDelete: "削除の確認",
    deleteConfirmMessage:
      'ワークフロー "{name}" を削除してもよろしいですか？この操作は元に戻せません。',
    cancel: "キャンセル",
    delete: "削除",
    // Footer
    totalWorkflows: "ワークフロー {count} 件",
    close: "閉じる",
  },

  workflowEditorDialog: {
    // Header
    back: "戻る",
    workflowEditor: "ワークフローエディター",
    // Template selector
    switchTemplate: "テンプレートを切り替え",
    newWorkflow: "新規ワークフロー",
    myWorkflows: "マイワークフロー",
    builtInTemplates: "組み込みテンプレート",
    // Display names
    untitledWorkflow: "無題のワークフロー",
    customWorkflow: "カスタムワークフロー",
    workflow: "ワークフロー",
    // Confirm dialog
    unsavedChangesConfirm:
      "保存されていない変更があります。テンプレートを切り替えますか？",
    // Status
    valid: "有効",
    errors: "{count} 件のエラー",
    // Actions
    reset: "リセット",
    save: "保存",
    runSimulation: "シミュレーションを実行",
    // Aria labels
    close: "閉じる",
  },

  // リモートコントロール
  remote: {
    title: "リモートコントロール",
    label: "リモート",
    host: "HOST",
    remote: "REMOTE",
    disconnect: "切断",
    showQrCode: "QRコードを表示",
    waitingForRemote: "リモートデバイスの接続を待っています...",
    relayServer: "リレーサーバー",
    scanToConnect: "モバイルでスキャンして接続",
    scanHint:
      "QRコードをスキャンするか、モバイルデバイスでリンクを開いてください",
    copySessionId: "セッションIDをコピー",
    copied: "コピーしました！",
    clickToCreate: "「セッション作成」をクリックしてQRコードを生成",
    connected: "接続済み",
    connecting: "接続中...",
    peers: "{count} 台のデバイス",
    createSession: "セッション作成",
    cancel: "キャンセル",
    direct: "直接接続",
  },

  // セッション管理
  session: {
    current: "現在のセッション",
    switch: "セッション切り替え",
    new: "新規セッション",
    delete: "セッション削除",
    deleteConfirm: "このセッションを削除してもよろしいですか？",
    storageLocation: "保存場所",
    notInitialized: "未初期化",
    unknownSession: "不明なセッション",
    initializing: "初期化中...",
    noSession: "セッションなし",
    pendingCount: "{count} 件の保留中",
    undoCount: "{count} 件の取り消し可能",
    pendingChanges: "{count} 件の保留中の変更",
    undoOperations: "{count} 件の取り消し可能な操作",
    noChanges: "変更なし",
    // セッションスイッチャー
    conversationSwitcher: {
      deleteConfirm:
        "このワークスペースのキャッシュを削除してもよろしいですか？すべてのファイルキャッシュ、保留中の同期、取消記録が削除されます。",
      selectConversation: "会話を選択",
      unknownConversation: "不明な会話",
      conversationList: "会話リスト ({count})",
      noConversations: "会話なし",
      pendingSync: "{count} 件の保留中",
      noChanges: "変更なし",
      deleteCache: "会話キャッシュを削除",
      newConversation: "新規会話",
    },
  },

  // ファイルビューア
  fileViewer: {
    pendingFiles: "保留中のファイル",
    undoChanges: "変更を取り消す",
    noFiles: "ファイルなし",
  },

  standalonePreview: {
    cannotLoadPreview: "プレビューを読み込めません",
    clickToRetry: "クリックして再試行",
    copiedToClipboard: "クリップボードにコピーしました",
    refreshed: "更新済み",
    refresh: "更新",
    inspectorEnabled:
      "インスペクターを有効化 - ページ要素をクリックして情報をコピー",
    inspectorDisabled: "インスペクターを無効化",
    inspectorActive: "検査中 - クリックして無効化",
    clickToEnableInspector: "クリックしてインスペクターを有効化",
    inspecting: "検査中",
    inspect: "検査",
  },

  storageStatusBanner: {
    cacheUnstable: "キャッシュが不安定です",
    retry: "再試行",
  },

  pendingSync: {
    justNow: "たった今",
    minutesAgo: "{count}分前",
    hoursAgo: "{count}時間前",
    create: "作成",
    modify: "変更",
    delete: "削除",
    noActiveConversations: "アクティブな会話がありません",
    allChangesSynced: "すべての変更が同期済み",
    pendingCount: "保留中 ({count})",
    syncAllToDisk: "保留中のすべての変更をディスクに同期",
    selectProjectFolder: "先にプロジェクトフォルダを選択してください",
    syncing: "同期中...",
    sync: "同期",
    syncComplete: "同期完了: {success} 成功",
    failed: "失敗",
    skipped: "スキップ",
    pendingChangesWillBeWritten:
      "保留中の変更は実際のファイルシステムに書き込まれます。正しいプロジェクトフォルダが選択されていることを確認してください。",
  },

  themeToggle: {
    currentTheme: "現在のテーマ: {theme}",
    rightClickMenu: "右クリックでテーマメニューを開く",
  },

  // 会話
  conversation: {
    thinking: "思考中...",
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
    },
    toast: {
      noApiKey: "まず設定で API Key を設定してください",
      deletedTurn: "完全な会話ターンを削除しました",
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
  },

  conversationStorage: {
    statusOk: "OK",
    statusWarning: "空き容量不足",
    statusUrgent: "クリーンアップ必要",
    statusCritical: "深刻",
    calculateSize: "会話ごとのサイズを計算（低速の可能性あり）",
    refresh: "更新",
    sessionDeleted: "セッションが削除されました",
    deleteFailed: "セッションの削除に失敗しました",
    noOldConversations: "30日間非アクティブな会話はありません",
    noCleanupNeeded: "クリーンアップするキャッシュがありません",
    getCleanupInfoFailed: "クリーンアップ情報の取得に失敗しました",
    cleanupSuccess:
      "{count}件の会話ファイルキャッシュをクリアし、{size}を解放しました",
    cleanupFailed: "クリアに失敗しました。再試行してください",
    // Cleanup dialog
    cleanupTitle: "セッションキャッシュをクリア",
    attention: "注意：",
    willDiscard: "{count} 件の未保存の変更を破棄します",
    willCleanup: "クリア対象：",
    conversationCount: "{count} 件の会話",
    daysInactive: "(30日間非アクティブ)",
    fileCacheSize: "約 {size} ファイルキャッシュ",
    unsavedChanges: "{count} 件の未保存の変更",
    selectScope: "クリア範囲を選択",
    cleanupOldSessions: "古いセッションのみクリア（30日間非アクティブ）",
    cleanupAll: "すべての会話キャッシュをクリア",
    cleanupHelpText:
      "会話記録は削除されません。次回ファイルにアクセス時にディスクから再読み込みされます。",
    canceling: "キャンセル",
    cleaning: "クリア中...",
    confirmCleanup: "クリアを確認",
    // Delete dialog
    deleteTitle: "会話を削除",
    deleteConfirm: "「{name}」を削除してもよろしいですか？",
    warningUnsaved: "注意：未保存の変更があります",
    pendingSync: "{count} 件の同期待ちの変更",
    willDelete: "削除対象",
    conversationRecords: "会話記録",
    fileCache: "ファイルキャッシュ",
    unsavedCannotRecover: "未保存の変更（復元不可）",
    cannotRecover: "削除後は復元できません",
    deleting: "削除中...",
    confirmDelete: "削除を確認",
    // Dropdown
    storageSpace: "ストレージ空間",
    browserQuota: "(ブラウザ配额)",
    loading: "読み込み中...",
    quotaExplanation:
      "配额はブラウザ允許的上限であり、実際の空き容量とは異なります。実際の容量を超える書き込みはエラーになります。",
    cannotGetStorage: "ストレージ情報を取得できません",
    currentConversation: "現在の会話",
    allConversations: "すべての会話 ({count})",
    noSessions: "セッションなし",
    noChanges: "変更なし",
    deleteConversation: "会話を削除",
    cleanupOldDescription: "古い会話のファイルキャッシュをクリアして領域を解放",
    cleanupFileCache: "ファイルキャッシュをクリア",
    cleanupFileCacheHelp:
      "ファイルキャッシュのみをクリアし、会話記録には影響しません",
  },

  toolCallDisplay: {
    executing: "実行中...",
    arguments: "引数",
    result: "結果",
  },

  // モバイル専用
  mobile: {
    menu: "メニュー",
    back: "戻る",
    home: "ホーム",
    profile: "プロフィール",
    settings: {
      connectionStatus: "接続状態",
      status: "ステータス",
      statusConnected: "接続済み",
      statusConnecting: "接続中...",
      statusDisconnected: "未接続",
      directory: "ディレクトリ",
      encryption: "暗号化",
      encryptionReady: "エンドツーエンド暗号化が有効",
      encryptionExchanging: "鍵交換中...",
      encryptionError: "暗号化エラー",
      encryptionNone: "暗号化なし",
      sessionId: "Session ID",
      sessionManagement: "セッション管理",
      clearLocalData: "ローカルセッションデータをクリア",
      clearDataConfirm:
        "ローカルセッションデータをクリアしてもよろしいですか？",
      about: "について",
      disconnect: "切断",
    },
    sessionInput: {
      title: "リモートセッションに参加",
      subtitle: "PC に表示されているセッション ID を入力してください",
      placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      inputLabel: "セッション ID 入力欄",
      joinSession: "セッションに参加",
      connecting: "接続中...",
      reconnecting: "再接続中...",
      cancel: "キャンセル",
      errorRequired: "セッション ID を入力してください",
      errorInvalidFormat:
        "無効なセッション ID 形式、UUID 形式である必要があります (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
      formatHint: "セッション ID 形式: UUID (8-4-4-4-12)",
      qrHint: "または iOS カメラで QR コードをスキャンして自動参加",
    },
  },

  // オフラインキュー
  offlineQueue: {
    justNow: "たった今",
    minutesAgo: "{count}分前",
    hoursAgo: "{count}時間前",
    retry: "再試行",
    delete: "削除",
    syncing: "同期中",
    pending: "保留中",
    failed: "失敗",
    completed: "完了",
    clearCompleted: "完了を消去",
    online: "オンライン",
    offline: "オフライン",
    syncingCount: "同期中 {count}",
    pendingCount: "保留中 {count}",
    failedCount: "失敗 {count}",
    connectedToNetwork: "ネットワークに接続済み",
    offlineMode: "オフラインモード",
    tasksWillSyncAutomatically: "タスクは自動的に同期されます",
    tasksWillSyncWhenReconnected: "接続が復元されるとタスクが同期されます",
    syncAll: "すべて同期",
    noOfflineTasks: "オフラインタスクなし",
    tasksSavedAutomatically:
      "ネットワーク中断時はタスクが自動的にキューに保存されます",
  },

  // アクティビティヒートマップ
  activityHeatmap: {
    months: [
      "1月",
      "2月",
      "3月",
      "4月",
      "5月",
      "6月",
      "7月",
      "8月",
      "9月",
      "10月",
      "11月",
      "12月",
    ],
    days: ["", "月", "", "水", "", "金", ""],
  },

  // エラー境界
  errorBoundary: {
    renderError: "レンダリングエラー",
    componentRenderError:
      "コンポーネントのレンダリング中にエラーが発生しました。一時的な問題の場合は、ページを更新してください。",
    errorDetails: "エラーの詳細",
    retry: "再試行",
    streamingError: "ストリーミング出力エラー",
  },

  // プラグインダイアログ
  pluginDialog: {
    confirm: "確認",
    cancel: "キャンセル",
    alert: "アラート",
    info: "情報",
    deleteConfirm: "削除の確認",
    delete: "削除",
    gotIt: "了解",
  },

  // HTML プレビュー
  htmlPreview: {
    preview: "プレビュー",
    loading: "読み込み中...",
  },

  // ファイルプレビュー
  filePreview: {
    cannotReadFile: "ファイルを読み込めません",
    fileTooLarge: "ファイルが大きすぎます ({size})、最大サポートは {maxSize}",
    readFileFailed: "ファイルの読み込みに失敗しました: {error}",
    clickFileTreeToPreview: "ファイルツリーでファイルをクリックしてプレビュー",
    conflict: "競合",
    diskFileNewer:
      "ディスクファイルがOPFSより新しいです。競合がある可能性があります",
    copyContent: "コンテンツをコピー",
    close: "閉じる",
    binaryFile: "バイナリファイル",
  },

  // 最近使ったファイル
  recentFiles: {
    title: "最近使ったファイル",
    empty: "最近使ったファイルはありません",
    emptyHint: "開いたファイルがここに表示されます",
    remove: "最近から削除",
    confirmClear: "最近使ったファイルをすべてクリアしますか？",
    count: "{count} 件の最近使ったファイル",
  },

  // コマンドパレット
  commandPalette: {
    title: "コマンドパレット",
    placeholder: "コマンドを入力または検索...",
    noResults: "「{query}」に一致するコマンドが見つかりません",
    navigate: "移動",
    select: "選択",
    close: "閉じる",
    general: "一般",
    categories: {
      conversations: "会話",
      files: "ファイル",
      developer: "開発者",
      dataAnalyst: "データアナリスト",
      student: "学生",
      office: "オフィス",
      view: "表示",
      tools: "ツール",
      settings: "設定",
      help: "ヘルプ",
    },
    commands: {
      "new-conversation": {
        label: "新しい会話",
        description: "新しい会話を開始",
      },
      "continue-last": {
        label: "前回の会話を続ける",
        description: "最近の会話に戻る",
      },
      "open-file": {
        label: "ファイルを開く...",
        description: "ワークスペースからファイルを開く",
      },
      "recent-files": {
        label: "最近使ったファイル",
        description: "最近アクセスしたファイルを表示",
      },
      "analyze-code": {
        label: "コードを分析",
        description: "コードの構造と品質を分析",
      },
      "find-bugs": {
        label: "潜在的なバグを検出",
        description: "コードの不吉な匂いと潜在的な問題を検索",
      },
      "refactor-code": {
        label: "リファクタリングを提案",
        description: "選択したコードのリファクタリング提案を取得",
      },
      "explain-code": {
        label: "コードを説明",
        description: "コード機能の詳細な説明を取得",
      },
      "search-code": {
        label: "コードベースを検索",
        description: "ファイル間でパターンと参照を検索",
      },
      "analyze-data": {
        label: "データを分析",
        description: "読み込んだデータを処理・分析",
      },
      "generate-chart": {
        label: "可視化を生成",
        description: "データからチャートを作成",
      },
      "run-statistics": {
        label: "統計検定を実行",
        description: "統計分析を実行",
      },
      "data-summary": {
        label: "データサマリー",
        description: "要約統計量を生成",
      },
      "export-data": {
        label: "結果をエクスポート",
        description: "分析結果をエクスポート",
      },
      "export-csv": {
        label: "CSVでエクスポート",
        description: "データをCSV形式でエクスポート",
      },
      "export-json": {
        label: "JSONでエクスポート",
        description: "データをJSON形式でエクスポート",
      },
      "export-excel": {
        label: "Excelでエクスポート",
        description: "データをExcelワークブックにエクスポート",
      },
      "export-chart-image": {
        label: "チャートを画像でエクスポート",
        description: "チャートをPNG画像にエクスポート",
      },
      "export-pdf": {
        label: "PDFでエクスポート",
        description: "レポートをPDF形式でエクスポート",
      },
      "export-code-review-pdf": {
        label: "コードレビューをPDFでエクスポート",
        description: "コードレビュー結果をPDFにエクスポート",
      },
      "export-test-report-pdf": {
        label: "テストレポートをPDFでエクスポート",
        description: "テスト生成結果をPDFにエクスポート",
      },
      "export-project-analysis-pdf": {
        label: "プロジェクト分析をPDFでエクスポート",
        description: "プロジェクト分析をPDFにエクスポート",
      },
      "explain-concept": {
        label: "概念を説明",
        description: "概念の教育的な説明を取得",
      },
      "create-study-plan": {
        label: "学習計画を作成",
        description: "パーソナライズされた学習計画を生成",
      },
      "solve-problem": {
        label: "ステップバイステップで解決",
        description: "ガイド付きで問題に取り組む",
      },
      "process-excel": {
        label: "Excelファイルを処理",
        description: "Excelスプレッドシートを読み込み・処理",
      },
      "query-data": {
        label: "データをクエリ",
        description: "自然言語でデータをクエリ",
      },
      "transform-data": {
        label: "データを変換",
        description: "データをクリーニング・変換",
      },
      "toggle-sidebar": {
        label: "サイドバーを切り替え",
        description: "サイドバーの表示/非表示",
      },
      "toggle-theme": {
        label: "テーマを切り替え",
        description: "ライトモードとダークモードを切り替え",
      },
      "open-skills": {
        label: "スキル管理",
        description: "スキルを管理",
      },
      "open-tools": {
        label: "ツールパネル",
        description: "ツールパネルを開く",
      },
      "open-mcp": {
        label: "MCPサービス",
        description: "MCPサービスを管理",
      },
      "workspace-settings": {
        label: "ワークスペース設定",
        description: "ワークスペースの設定を構成",
      },
      "keyboard-shortcuts": {
        label: "キーボードショートカット",
        description: "すべてのキーボードショートカットを表示",
      },
    },
  },

  mcp: {
    dialog: {
      title: "MCP サービス設定",
    },
    title: "MCP サーバー",
    description: "外部 MCP サービス接続を管理します",
    addServer: "MCP サーバーを追加",
    editServer: "サーバーを編集",
    add: "追加",
    update: "更新",
    saving: "保存中...",
    toolsCount: "{count} 個のツール",
    confirmDelete: "この MCP サーバーを削除してもよろしいですか？",
    badge: {
      builtin: "内蔵",
      disabled: "無効",
    },
    empty: {
      title: "MCP サーバーがありません",
      hint: "上のボタンをクリックしてサーバーを追加してください",
    },
    actions: {
      clickToDisable: "クリックして無効化",
      clickToEnable: "クリックして有効化",
      editConfig: "設定を編集",
      deleteServer: "サーバーを削除",
    },
    toast: {
      loadFailed: "MCP サーバーの読み込みに失敗しました",
      updated: "サーバー設定を更新しました",
      added: "サーバーを追加しました",
      saveFailed: "保存に失敗しました",
      deleted: "サーバーを削除しました",
      deleteFailed: "削除に失敗しました",
      updateStatusFailed: "状態の更新に失敗しました",
    },
    validation: {
      invalidServerId: "無効なサーバー ID",
      nameRequired: "サーバー名を入力してください",
      urlRequired: "サーバー URL を入力してください",
      urlInvalid: "有効な URL を入力してください",
      timeoutRange: "タイムアウトは 1000-300000ms の範囲で指定してください",
      serverIdExists: "サーバー ID は既に存在します",
      serverIdValid: "ID 形式は有効です",
    },
    form: {
      serverId: "サーバー ID",
      serverIdPlaceholder: "例: excel-analyzer",
      serverIdHint:
        "ツール呼び出しで使用します。例: excel-analyzer:analyze_spreadsheet",
      displayName: "表示名",
      displayNamePlaceholder: "例: Excel アナライザー",
      description: "説明",
      descriptionPlaceholder: "サーバー機能の説明",
      serverUrl: "サーバー URL",
      transportType: "転送方式",
      authTokenOptional: "認証トークン（任意）",
      timeoutMs: "タイムアウト (ms)",
      transport: {
        sse: "SSE (Server-Sent Events)",
        streamableHttp: "Streamable HTTP",
        streamableHttpExperimental: "Streamable HTTP (実験的)",
      },
    },
  },

  // オンボーディング
  onboarding: {
    dontShowAgain: "今後表示しない",
    previous: "前へ",
    next: "次へ",
    complete: "完了",
    stepProgress: "ステップ {current} / {total}",
    steps: {
      welcome: {
        title: "CreatorWeave へようこそ！",
        description: "主な機能をご紹介します。",
      },
      conversations: {
        title: "会話",
        description:
          "AI とチャットしてコードベースを分析します。各会話には専用のワークスペースがあります。",
      },
      fileTree: {
        title: "ファイルブラウザ",
        description:
          "プロジェクトのファイルとフォルダを閲覧します。ファイルをクリックして内容をプレビュー。",
      },
      skills: {
        title: "スキル",
        description:
          "一般的なタスクのための再利用可能なスキルを管理・実行します。",
      },
      tools: {
        title: "ツールパネル",
        description:
          "クイックアクション、推論の可視化、スマートな提案にアクセスします。",
      },
      complete: {
        title: "準備完了！",
        description:
          "これらの機能はツールバーまたはキーボードショートカットからいつでもアクセスできます。",
      },
    },
  },

  workspace: {
    title: "ワークスペース",
  },

  // プロジェクトホーム
  projectHome: {
    hero: {
      badge: "ローカルファースト",
      title: "ここから創作を始める",
      description:
        "ローカル AI ワークスペースで、自然言語でファイルと会話しましょう。",
      descriptionSuffix: "データはあなたのデバイスに残ります。",
      projectCount: "{count} プロジェクト",
      workspaceCount: "{count} ワークスペース",
      docsHub: "ドキュメントセンター",
      userDocs: "ユーザードキュメント",
      developerDocs: "開発者ドキュメント",
    },
    sidebar: {
      continueWork: "続ける",
      createNew: "新規",
      createNewDescription:
        "新しいプロジェクトを作成して、クリエイティブな旅を始めましょう。",
      shortcutHint: "ショートカット: N",
      createProject: "プロジェクト作成",
      startFresh: "最初からやり直す",
      startFreshDescription:
        "問題がありますか？最初からやり直せます。すべてのプロジェクトと会話が削除されます。",
      resetApp: "アプリをリセット",
      resetting: "リセット中...",
      helpDocs: "ヘルプドキュメント",
      helpDocsDescription:
        "ユーザー向け・開発者向けドキュメントを参照して、使い方と技術情報を確認できます。",
      openDocs: "ドキュメントセンターを開く",
      appearance: "外観",
      cache: "キャッシュ",
      cacheDescription:
        "ブラウザキャッシュをクリアして、レスポンスヘッダーと静的リソースを更新します。",
      clearCache: "キャッシュをクリア",
      clearing: "クリア中...",
    },
    theme: {
      modeTitle: "テーマモード",
      light: "ライト",
      dark: "ダーク",
      system: "システム",
      accentColorTitle: "アクセントカラー",
      languageTitle: "言語",
    },
    accentColors: {
      teal: "ティール",
      rose: "ローズ",
      amber: "アンバー",
      violet: "バイオレット",
      emerald: "エメラルド",
      slate: "スレート",
    },
    activity: {
      title: "アクティビティ",
      less: "少ない",
      more: "多い",
      count: "件のアクティビティ",
    },
    timeline: {
      today: "今日",
      yesterday: "昨日",
      thisWeek: "今週",
      thisMonth: "今月",
      older: "以前",
    },
    filters: {
      searchPlaceholder: "プロジェクトを検索...",
      all: "すべて",
      active: "アクティブ",
      archived: "アーカイブ済み",
    },
    project: {
      archived: "アーカイブ済み",
      workspaceCount: "{count} ワークスペース",
      open: "開く",
      rename: "名前を変更",
      archive: "アーカイブ",
      unarchive: "アーカイブ解除",
      delete: "削除",
    },
    dialogs: {
      createProject: "新しいプロジェクトを作成",
      createProjectDescription:
        "新しいプロジェクトに名前を付けて、異なるワークスペースを整理・区別しましょう。",
      projectNamePlaceholder: "プロジェクト名を入力",
      createButton: "プロジェクトを作成",
      creating: "作成中...",
      renameProject: "プロジェクト名を変更",
      renamePlaceholder: "新しいプロジェクト名を入力",
      archiveProject: "プロジェクトをアーカイブ",
      archiveConfirm:
        "プロジェクト「{name}」をアーカイブしますか？アーカイブされたプロジェクトはデフォルトで表示されませんが、いつでもアーカイブ解除できます。",
      dontAskAgain: "今後確認しない",
      deleteProject: "プロジェクトを削除",
      deleteConfirm:
        "プロジェクト「{name}」を削除しますか？関連するワークスペースレコードも削除され、元に戻せません。",
      deleteConfirmHint: "確認のためプロジェクト名を入力してください：",
      startFreshTitle: "最初からやり直す",
      startFreshDescription: "このアプリで作成したすべての内容が削除されます：",
      startFreshItems: {
        projects: "すべてのプロジェクトとワークスペース",
        conversations: "すべての会話履歴",
        files: "すべてのアップロードファイル",
      },
      startFreshNote: "初めてアプリを開いた時と同じ状態になります。",
      startFreshConfirmHint:
        "確認のため「最初からやり直す」と入力してください：",
      startFreshConfirmPlaceholder: "最初からやり直す",
      confirmReset: "リセットを確認",
      resetting: "リセット中...",
    },
    empty: {
      noProjects: "まだプロジェクトがありません",
      noResults: "一致するプロジェクトが見つかりません",
      createFirst: "最初のプロジェクトを作成",
    },
  },

  // ファイルツリー
  fileTree: {
    pending: {
      create: "追加",
      modify: "変更",
      delete: "削除",
    },
    copyPath: "パスをコピー",
    inspectElement: "要素を検査",
    emptyStateHint: "ローカルディレクトリを選択せずにも繼續できます",
    emptyStateDescription:
      "Pure OPFS サンドボックスモードでは、ファイルの変更がここに表示されます",
    draftFiles: "下書きファイル",
    approvedNotSynced: "承認済み、ディスク同期待ち",
  },

  // エージェント関連
  agent: {
    inputHint: "@を入力して一時的にエージェントを切り替え",
    createNew: "新しいエージェントを作成...",
    noAgents: "利用可能なエージェントがありません",
    create: "作成",
    delete: "{id}を削除",
    confirmDelete: "エージェント「{id}」を削除しますか？",
    thinking: "思考中...",
    callingTool: "ツール呼び出し中...",
    callingToolWithName: "ツール {name} を呼び出し中...",
  },

  // サイドバーコンポーネント
  sidebar: {
    expandSidebar: "サイドバーを展開",
    collapseSidebar: "サイドバーを折りたたむ",
    closeSidebar: "サイドバーを閉じる",
    workspace: "ワークスペース",
    clearWorkspace: "現在のプロジェクトワークスペースをクリア",
    clear: "クリア",
    newWorkspace: "新しいワークスペース",
    workspaceLabel: "ワークスペース: {name}",
    pendingReviewCount: "{count}件の変更がレビュー待ち",
    workspaceDeleted: "ワークスペースが削除されました",
    emptyStateNoWorkspace:
      "このプロジェクトのワークスペースはまだありません。最初の会話を開始すると、ワークスペースが自動的に作成されます。",
    createFirstWorkspace: "最初のワークスペースを作成",
    deleteWorkspaceFailed: "ワークスペースの削除に失敗しました",
    deleteWorkspace: "ワークスペースを削除",
    dragToResizeHeight: "ドラッグして高さを調整",
    centerDot: "センターポイント",
    files: "ファイル",
    changes: "変更",
    snapshots: "スナップショット",

    // Snapshot List
    snapshotList: {
      title: "スナップショットリスト",
      noSnapshots: "スナップショット記録がありません",
      loading: "スナップショットを読み込み中...",
      current: "現在",
      delete: "削除",
      switch: "切り替え",
      switching: "処理中...",
      deleting: "削除中...",
      clear: "クリア",
      clearing: "クリア中...",
      workspaceNotFound: "ワークスペースが見つかりません: {name}",
      switchPartial:
        "スナップショットへの切り替えが完全成功しませんでした（失敗スナップショット {failedSnapshotId}）、{count}件の変更がまだ元に戻っていません",
      switchFailed:
        "切り替えが失敗し自動回復も完全成功しませんでした。手動でスナップショット状況を確認してください",
      switchFailedWithCount:
        "最新への切り替えが完全成功しませんでした、{count}件の変更がまだ元に戻っていません",
      loadFailed: "スナップショットの読み込みに失敗しました",
      loadDetailFailed: "スナップショット詳細の読み込みに失敗しました",
      deleteFailed: "スナップショットの削除に失敗しました",
      clearFailed: "スナップショットのクリアに失敗しました",
      noActiveProject: "アクティブなプロジェクトがありません",
      snapshotNotFound: "スナップショットが見つかりません",
      switchToLatestFailed: "最新への切り替えに失敗しました",
      pendingCount: "{count}件の変更",
      fileOpCreate: "追加",
      fileOpModify: "変更",
      fileOpDelete: "削除",
      contentKindBinary: "バイナリ",
      contentKindText: "テキスト",
      contentKindNone: "なし",
      confirmClearTitle: "クリアの確認",
      confirmClearMessage:
        "このプロジェクトのすべてのスナップショットをクリアしますか？この操作は元に戻せません。",
      confirmDeleteTitle: "削除の確認",
      confirmDeleteMessage:
        "このスナップショットを削除しますか？この操作は元に戻せません。",
      approved: "承認済み",
      committed: "コミット済み",
      draft: "下書き",
      rolledBack: "ロールバック済み",
      unnamedSnapshot: "名前なしスナップショット",
      processing: "処理中 {current}/{total}",
      loadingDetails: "詳細を読み込み中...",
      noDetails: "このスナップショットには詳細がありません",
      before: "前",
      after: "後",
    },

    // Snapshot Approval Dialog
    snapshotApproval: {
      title: "スナップショットを作成",
      description:
        '<span class="font-semibold">{count}</span>件の変更を承認し、スナップショットレコードを作成します。',
      summaryLabel: "スナップショット説明",
      generateAI: "AI 生成",
      generating: "生成中...",
      summaryPlaceholder:
        "スナップショットの説明を入力（複数行可、最初の一行をタイトルとして使用）",
      summaryError: "サマリー生成に失敗しました",
      cancel: "キャンセル",
      confirm: "承認を確認",
      processing: "処理中...",
    },
    plugins: "プラグイン",
    pluginTitle: "プラグイン",
    pluginManagerHint: "プラグイン管理がここに表示されます",
    clearWorkspaceTitle: "ワークスペースをクリア",
    confirmClearWorkspace:
      "現在のプロジェクトのすべてのワークスペースをクリアしますか？この操作は元に戻せません。",
    clearedCount: "{count}件のワークスペースをクリアしました",
    clearFailed: "クリア失敗（{count}件失敗）",
    deletePartial: "{success}件削除、{failed}件失敗",
    clearing: "クリア中...",
    dragToResizeWidth: "ドラッグして幅を調整",
  },

  // Workflow
  workflow: {
    label: "ワークフロー",
    description: "マルチステップAI協業、自动計画、作成、レビュー。",
    advancedSettings: "高度な設定",
    customRubricName: "カスタム・ルブリック・ルール",
    enableCustomRubric: "カスタム・ルブリック・ルールを有効化",
    passScore: "合格点",
    passScoreAria: "合格点",
    maxRepairRounds: "最大修復ラウンド",
    maxRepairRoundsAria: "最大修復ラウンド",
    paragraphRule: "段落文ルール",
    paragraphMin: "最小文数",
    paragraphMinAria: "段落最小文数",
    paragraphMax: "最大文数",
    paragraphMaxAria: "段落最大文数",
    dialoguePolicy: "ダイアログポリシー",
    allowSingleDialogue: "単一ダイアログを許可",
    hookRule: "オープニングフック・ルール",
    ctaRule: "CTA完全性ルール",
    customEditor: "カスタム・ワークフロー・エディター",
    manageWorkflows: "マイ・ワークフローを管理",
    simulateRun: "シミュレーション実行",
    realRun: "實際実行",
    // Template names
    templateNovelDaily: "小説日更ワークフロー",
    templateShortVideo: "短動画スクリプトワークフロー",
    templateEducationLesson: "教案ノートワークフロー",
    templateQualityLoop: "品質ループワークフロー",
    // Template labels (short)
    templateNovelDailyLabel: "小説日更",
    templateShortVideoLabel: "短動画",
    templateEducationLessonLabel: "教案ノート",
    templateQualityLoopLabel: "品質ループ",
    // Rubric names
    rubricNovelDaily: "小説日更ルブリック",
    rubricShortVideo: "短動画スクリプトル브리크",
    rubricEducationLesson: "教案ノートルブリック",
    rubricQualityLoop: "品質ループルブリック",
    // Execution progress
    thinking: "思考中...",
    thinkingProcess: "思考過程",
    executing: "執行中、お待ちください...",
    running: "実行中",
    completed: "完了",
    failed: "失敗",
    stopRunning: "実行を停止",
    contextSummary: "コンテキスト圧縮サマリー",
    status: "ステータス",
    template: "テンプレート",
    repairRounds: "修復ラウンド",
    input: "入力",
    output: "出力",
    validation: {
      rubricNameRequired: "ルブリック・ルール名を入力してください",
      passScoreRange: "合格点は0-100の間である必要があります",
      repairRoundsRange: "修復ラウンドは0-10の間である必要があります",
      paragraphRangeInvalid: "段落文数範囲が無効です",
      atLeastOneRule: "少なくとも1つのスコアリング・ルールを有効にしてください",
    },
  },
} as const;

export default jaJP;
