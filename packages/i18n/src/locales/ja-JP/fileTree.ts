// ファイルツリー
export const fileTree = {
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
} as const
