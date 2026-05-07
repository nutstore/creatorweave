// ウェルカムページ
export const welcome = {
    title: "CreatorWeave",
    tagline:
      "ナレッジベースとマルチエージェント編成のための AI ネイティブ Creator Workspace",
    placeholder: "メッセージを入力して会話を開始...",
    placeholderNoKey: "まず設定で API Key を設定してください",
    send: "送信",
    openLocalFolder: "ローカルフォルダを開く",
    recentHint:
      "左側から既存の会話を選択するか、メッセージを入力して新しい会話を開始してください",
    viewCapabilities: "機能を見る",
    // Drag and drop overlay
    dropFilesHere: "ファイルをここにドロップ",
    supportsFileTypes: "CSV、Excel、PDF、画像などのファイルに対応",
    apiKeyRequiredHint:
      "まずモデル設定で API Key を構成してから会話を始めてください",
    filesReady: "{count} 件のファイルが準備完了",
    personas: {
      developer: {
        title: "開発者",
        description: "コード理解、デバッグ、リファクタリング",
        examples: {
          0: "この関数の動作を説明して",
          1: "このコードのバグを見つけて",
          2: "パフォーマンス改善のためにリファクタリングして",
        },
      },
      analyst: {
        title: "データアナリスト",
        description: "データ処理、可視化、インサイト",
        examples: {
          0: "CSVの売上データを分析して",
          1: "Excelからチャートを作成して",
          2: "主要な指標をまとめて",
        },
      },
      researcher: {
        title: "学生 / 研究者",
        description: "ドキュメント読解、学習、知識整理",
        examples: {
          0: "このドキュメントを要約して",
          1: "技術的な概念を説明して",
          2: "ファイル間で情報を探して",
        },
      },
      office: {
        title: "オフィスワーカー",
        description: "ドキュメント処理、レポート作成、コンテンツ制作",
        examples: {
          0: "データからレポートを下書きして",
          1: "ドキュメントを整理・フォーマットして",
          2: "複数のファイルを処理して",
        },
      },
    },
} as const
