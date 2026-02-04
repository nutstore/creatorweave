export const jaJP = {
  // 应用
  app: {
    productName: 'BFOSA',
    initializing: '初期化中...',
    loadProgress: '読み込み進捗',
    preparing: '準備中...',
  },

  // 通用
  common: {
    save: '保存',
    cancel: 'キャンセル',
    confirm: '確認',
    delete: '削除',
    close: '閉じる',
    search: '検索',
    refresh: '更新',
    loading: '読み込み中...',
    error: 'エラー',
    success: '成功',
    copy: 'コピー',
    copied: 'コピーしました',
  },

  // 顶部导航
  topbar: {
    productName: 'BFOSA',
    openFolder: 'フォルダを開く',
    switchFolder: 'プロジェクトフォルダを切り替え',
    noApiKey: 'API Key が設定されていません',
    settings: '設定',
    skillsManagement: 'スキル管理',
  },

  // 设置对话框
  settings: {
    title: '設定',
    llmProvider: 'LLM プロバイダ',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'API Keyを入力...',
    save: '保存',
    saved: '保存しました',
    apiKeyNote: 'キーは AES-256 暗号化してローカルブラウザに保存されます',
    modelName: 'モデル名',
    temperature: 'Temperature',
    maxTokens: '最大出力トークン数',

    providers: {
      glm: 'Zhipu GLM',
      'glm-coding': 'Zhipu GLM (Coding)',
      kimi: 'Kimi (Moonshot)',
      minimax: 'MiniMax',
      qwen: 'Qwen',
    },
  },

  // 欢迎页
  welcome: {
    title: 'BFOSA',
    tagline: 'ブラウザネイティブ AI ワークスペース',
    placeholder: 'メッセージを入力して会話を開始...',
    placeholderNoKey: 'まず設定で API Key を設定してください',
    send: '送信',
    openLocalFolder: 'ローカルフォルダを開く',
    recentHint: '左側から既存の会話を選択するか、メッセージを入力して新しい会話を開始してください',
  },

  // 技能管理
  skills: {
    title: 'スキル管理',
    searchPlaceholder: 'スキル名、説明、タグを検索...',
    filterAll: 'すべて',
    filterEnabled: '有効',
    filterDisabled: '無効',
    projectSkills: 'プロジェクトスキル',
    mySkills: 'マイスキル',
    builtinSkills: '組み込みスキル',
    enabledCount: '{count} / {total} 有効',
    createNew: '新規スキル',
    deleteConfirm: 'このスキルを削除してもよろしいですか？',
    edit: '編集',
    delete: '削除',
    enabled: '有効',
    disabled: '無効',
    empty: 'スキルがありません',
    // スキルカテゴリ
    categories: {
      codeReview: 'コードレビュー',
      testing: 'テスト',
      debugging: 'デバッグ',
      refactoring: 'リファクタリング',
      documentation: 'ドキュメント',
      security: 'セキュリティ',
      performance: 'パフォーマンス',
      architecture: 'アーキテクチャ',
      general: '汎用',
    },
    // プロジェクトスキル発見ダイアログ
    projectDialog: {
      title: 'プロジェクトスキルを発見',
      description: 'プロジェクトで {count} 個のスキルを発見しました。ワークスペースに読み込みますか？',
      selectAll: 'すべて選択',
      deselectAll: '選択解除',
      selected: '選択済み',
      load: '読み込み',
      loadAll: 'すべて読み込み',
      skip: 'スキップ',
    },
  },

  // 远程控制
  remote: {
    title: 'リモートコントロール',
    host: 'HOST',
    remote: 'REMOTE',
    disconnect: 'Disconnect',
    showQrCode: 'QRコードを表示',
    waitingForRemote: 'リモートデバイスの接続を待っています...',
  },

  // 会话管理
  session: {
    current: '現在のセッション',
    switch: 'セッション切り替え',
    new: '新規セッション',
    delete: 'セッション削除',
    deleteConfirm: 'このセッションを削除してもよろしいですか？',
    storageLocation: '保存場所',
    // 状态
    notInitialized: '未初期化',
    unknownSession: '不明なセッション',
    initializing: '初期化中...',
    noSession: 'セッションなし',
    pendingCount: '{count} 件の保留中',
    undoCount: '{count} 件の取り消し可能',
    pendingChanges: '{count} 件の保留中の変更',
    undoOperations: '{count} 件の取り消し可能な操作',
    noChanges: '変更なし',
  },

  // 文件查看器
  fileViewer: {
    pendingFiles: '保留中のファイル',
    undoChanges: '変更を取り消す',
    noFiles: 'ファイルなし',
  },

  // 对话相关
  conversation: {
    thinking: '思考中...',
    reasoning: '推論プロセス',
    toolCall: 'ツール呼び出し',
    regenerate: '再生成',
  },

  // 移动端专属
  mobile: {
    menu: 'メニュー',
    back: '戻る',
    home: 'ホーム',
    profile: 'プロフィール',
    // 设置页
    settings: {
      connectionStatus: '接続状態',
      status: 'ステータス',
      statusConnected: '接続済み',
      statusConnecting: '接続中...',
      statusDisconnected: '未接続',
      directory: 'ディレクトリ',
      encryption: '暗号化',
      encryptionReady: 'エンドツーエ暗号化が有効',
      encryptionExchanging: '鍵交換中...',
      encryptionError: '暗号化エラー',
      encryptionNone: '暗号化なし',
      sessionId: 'Session ID',
      sessionManagement: 'セッション管理',
      clearLocalData: 'ローカルセッションデータをクリア',
      clearDataConfirm: 'ローカルセッションデータをクリアしてもよろしいですか？',
      about: 'について',
      disconnect: '切断',
    },
    // 会话输入页
    sessionInput: {
      title: 'リモートセッションに参加',
      subtitle: 'PC に表示されているセッション ID を入力してください',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      inputLabel: 'セッション ID 入力欄',
      joinSession: 'セッションに参加',
      connecting: '接続中...',
      reconnecting: '再接続中...',
      cancel: 'キャンセル',
      errorRequired: 'セッション ID を入力してください',
      errorInvalidFormat: '無効なセッション ID 形式、UUID 形式である必要があります (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
      formatHint: 'セッション ID 形式: UUID (8-4-4-4-12)',
      qrHint: 'または iOS カメラで QR コードをスキャンして自動参加',
    },
  },
} as const

export default jaJP
