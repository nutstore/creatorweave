// コマンドパレット
export const commandPalette = {
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
} as const
