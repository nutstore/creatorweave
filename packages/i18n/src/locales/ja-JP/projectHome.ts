// プロジェクトホーム
export const projectHome = {
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
} as const
