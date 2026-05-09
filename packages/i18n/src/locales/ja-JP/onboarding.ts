// オンボーディング
export const onboarding = {
    dontShowAgain: "今後表示しない",
    previous: "前へ",
    next: "次へ",
    complete: "完了",
    stepProgress: "ステップ {current} / {total}",
    steps: {
      welcome: {
        title: "CreatorWeave へようこそ！",
        description: "主な機能をご紹介します。",
      },
      conversations: {
        title: "会話",
        description:
          "AI とチャットしてコードベースを分析します。各会話には専用のワークスペースがあります。",
      },
      fileTree: {
        title: "ファイルブラウザ",
        description:
          "プロジェクトのファイルとフォルダを閲覧します。ファイルをクリックして内容をプレビュー。",
      },
      skills: {
        title: "スキル",
        description:
          "一般的なタスクのための再利用可能なスキルを管理・実行します。",
      },
      tools: {
        title: "ツールパネル",
        description:
          "クイックアクション、推論の可視化、スマートな提案にアクセスします。",
      },
      complete: {
        title: "準備完了！",
        description:
          "これらの機能はツールバーまたはキーボードショートカットからいつでもアクセスできます。",
      },
    },
} as const
