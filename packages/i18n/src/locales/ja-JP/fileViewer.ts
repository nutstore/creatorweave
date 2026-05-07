// ファイルビューア
export const fileViewer = {
    pendingFiles: "保留中のファイル",
    undoChanges: "変更を取り消す",
    noFiles: "ファイルなし",
} as const

export const standalonePreview = {
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
} as const

// ファイルプレビュー
export const filePreview = {
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
    preview: "プレビュー",
    source: "ソース",
} as const

// 最近使ったファイル
export const recentFiles = {
    title: "最近使ったファイル",
    empty: "最近使ったファイルはありません",
    emptyHint: "開いたファイルがここに表示されます",
    remove: "最近から削除",
    confirmClear: "最近使ったファイルをすべてクリアしますか？",
    count: "{count} 件の最近使ったファイル",
} as const
