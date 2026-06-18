// キーボードショートカットヘルプダイアログ
export const keyboardShortcuts = {
  title: "キーボードショートカット",
  searchPlaceholder: "ショートカットを検索...",
  noResults: '"{query}"に一致するショートカットが見つかりません',
  closeHint: "",
  closeHintKey: "で閉じる",
  closeButton: "閉じる",
  categoryGeneral: "一般",
  actions: {
    openCommandPalette: "コマンドパレットを開く",
    toggleProjectSwitcher: "プロジェクト切替を開く",
    goToFile: "ファイルへ移動",
    toggleSidebar: "サイドバーの切り替え",
    openWorkspaceSettings: "ワークスペース設定を開く",
    toggleShortcutsHelp: "ショートカットヘルプの切り替え",
    closePanels: "パネル / ダイアログを閉じる",
  },
} as const
