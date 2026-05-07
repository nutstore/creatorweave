export const webContainer = {
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
} as const
