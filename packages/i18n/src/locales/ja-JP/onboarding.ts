export const onboarding = {
    dontShowAgain: "次回から表示しない",
    previous: "前へ",
    next: "次へ",
    complete: "完了",
    skip: "スキップ",
    stepProgress: "ステップ {current} / {total}",
    steps: {
      model: {
        title: "AI モデルを接続",
        description: "あなたに最適な方法を選んでください",
        done: "モデルの準備が完了しました",
        pending: "下のボタンをクリックして設定",
      },
      firstMessage: {
        title: "最初のメッセージを送信",
        description: "入力ボックスに入力するか、下の例を試してください",
        tip: "AI がすぐに返信を開始します",
      },
      files: {
        title: "AI にファイルを読み込ませる",
        description: "認証後、AI は指定したローカルファイルの読み書きができます",
        tip: "サイドバーの「フォルダを開く」をクリック",
      },
      explore: {
        title: "その他の機能を探索",
        description: "⌘K でコマンドパレットを開き、スキルやスケジュールなどを発見",
        tip: "コマンドパレットからいつでも全機能にアクセスできます",
      },
    },
} as const
