// ウェルカムページ
export const welcome = {
    title: "EO2Weave",
    tagline:
      "ナレッジベースとマルチエージェント編成のための AI ネイティブ Creator Workspace",
    placeholder: "メッセージを入力して会話を開始...",
    send: "送信",
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
    welcomeHeading: "EO2Weave へようこそ",
    welcomeSubtitle: "ローカル AI ワークスペース、ファイルとコードはブラウザ内に",
    continueButton: "続ける",
    skipButton: "今はスキップ",
    mountFolderTitle: "ローカルフォルダをマウント",
    mountFolderDesc: "AI がファイルを直接読み書きできます。ファイルはブラウザから出ません。",
    mountFolderButton: "フォルダを選択",
    mountFolderBack: "戻る",
    mountFolderMounted: "マウント済みフォルダ",
    readyHint: "メッセージを入力、またはファイルをドロップしてください",
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
} as const
