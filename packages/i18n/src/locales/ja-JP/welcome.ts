// ウェルカムページ
export const welcome = {
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
    // Shown while the async API-key check is in flight (avoids flashing the
    // "no API key" setup card before SQLite has been consulted).
    checkingConfig: "AI 設定を確認中...",
    // Setup card (shown when no API key configured)
    setupCardTitle: "開始前に、AI への接続方法を選択してください",
    setupGatewayTitle: "堅果雲アカウントでログイン",
    setupGatewayDesc: "堅果雲アカウントをお持ちですか？ワンクリックでログイン、API Key 不要",
    setupGatewayRecommend: "推奨",
    setupApiKeyTitle: "独自の API Key を構成",
    setupApiKeyDesc: "OpenAI、OpenRouter、Anthropic などに対応",
    setupLocalFirstHint: "すべてのデータはブラウザにローカル保存され、サーバーにアップロードされません",
    // 3-step onboarding
    step1Of3: "ステップ 1 / 3",
    step2Of3: "ステップ 2 / 3",
    step3Of3: "ステップ 3 / 3",
    welcomeHeading: "CreatorWeave へようこそ",
    welcomeSubtitle: "ローカル AI ワークスペース、ファイルとコードはブラウザ内に",
    continueButton: "続ける",
    skipButton: "今はスキップ",
    mountFolderTitle: "ローカルフォルダをマウント",
    mountFolderDesc: "AI がファイルを直接読み書きできます。ファイルはブラウザから出ません。",
    mountFolderButton: "フォルダを選択",
    mountFolderBack: "戻る",
    mountFolderMounted: "マウント済みフォルダ",
    quickStartTitle: "試してみる:",
    quickStartEmail: "メールを書くのを手伝って",
    quickStartSummary: "メモを要約して",
    quickStartCode: "my-project のコードを説明して",
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
    gateway: {
        title: "堅果雲 AI にログイン",
        close: "閉じる",
        requesting: "認可セッションを作成中...",
        enterCode: "認可ページで次のコードを入力してください",
        authCodeLabel: "認可コード",
        copy: "コピー",
        openAuthPage: "認可ページを開く",
        waiting: "認可を待機中...",
        success: "ログイン成功！",
        clientIdMissing:
            "Client ID が設定されていません。VITE_JIANGUOYUN_AI_CLIENT_ID 環境変数を設定してください。",
        authFailedFallback: "認証に失敗しました",
    },
    quickActionPrompt: "何を手伝ってもらえますか？",
    commandPaletteHint: "コマンドパレットを開く",
} as const
