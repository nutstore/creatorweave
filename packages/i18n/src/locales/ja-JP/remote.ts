// リモートコントロール
export const remote = {
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
} as const

// セッション管理
export const session = {
    current: "現在の対話",
    switch: "対話切り替え",
    new: "新規対話",
    delete: "対話削除",
    deleteConfirm: "この対話を削除してもよろしいですか？",
    storageLocation: "保存場所",
    notInitialized: "未初期化",
    unknownSession: "不明な対話",
    initializing: "初期化中...",
    noSession: "対話なし",
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
} as const
