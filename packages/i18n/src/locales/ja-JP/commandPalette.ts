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
      developer: "開発者",
      dataAnalyst: "データアナリスト",
      student: "学生",
      office: "オフィス",
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
      "analyze-code": {
        label: "コードを分析",
        description: "コードの構造と品質を分析",
      },
      "find-bugs": {
        label: "潜在的なバグを検出",
        description: "コードの不吉な匂いと潜在的な問題を検索",
      },
      "refactor-code": {
        label: "リファクタリングを提案",
        description: "選択したコードのリファクタリング提案を取得",
      },
      "explain-code": {
        label: "コードを説明",
        description: "コード機能の詳細な説明を取得",
      },
      "search-code": {
        label: "コードベースを検索",
        description: "ファイル間でパターンと参照を検索",
      },
      "analyze-data": {
        label: "データを分析",
        description: "読み込んだデータを処理・分析",
      },
      "generate-chart": {
        label: "可視化を生成",
        description: "データからチャートを作成",
      },
      "run-statistics": {
        label: "統計検定を実行",
        description: "統計分析を実行",
      },
      "data-summary": {
        label: "データサマリー",
        description: "要約統計量を生成",
      },
      "export-data": {
        label: "結果をエクスポート",
        description: "分析結果をエクスポート",
      },
      "export-csv": {
        label: "CSVでエクスポート",
        description: "データをCSV形式でエクスポート",
      },
      "export-json": {
        label: "JSONでエクスポート",
        description: "データをJSON形式でエクスポート",
      },
      "export-excel": {
        label: "Excelでエクスポート",
        description: "データをExcelワークブックにエクスポート",
      },
      "export-chart-image": {
        label: "チャートを画像でエクスポート",
        description: "チャートをPNG画像にエクスポート",
      },
      "export-pdf": {
        label: "PDFでエクスポート",
        description: "レポートをPDF形式でエクスポート",
      },
      "export-code-review-pdf": {
        label: "コードレビューをPDFでエクスポート",
        description: "コードレビュー結果をPDFにエクスポート",
      },
      "export-test-report-pdf": {
        label: "テストレポートをPDFでエクスポート",
        description: "テスト生成結果をPDFにエクスポート",
      },
      "export-project-analysis-pdf": {
        label: "プロジェクト分析をPDFでエクスポート",
        description: "プロジェクト分析をPDFにエクスポート",
      },
      "explain-concept": {
        label: "概念を説明",
        description: "概念の教育的な説明を取得",
      },
      "create-study-plan": {
        label: "学習計画を作成",
        description: "パーソナライズされた学習計画を生成",
      },
      "solve-problem": {
        label: "ステップバイステップで解決",
        description: "ガイド付きで問題に取り組む",
      },
      "process-excel": {
        label: "Excelファイルを処理",
        description: "Excelスプレッドシートを読み込み・処理",
      },
      "query-data": {
        label: "データをクエリ",
        description: "自然言語でデータをクエリ",
      },
      "transform-data": {
        label: "データを変換",
        description: "データをクリーニング・変換",
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
