// エージェント関連
export const agent = {
    inputHint: "@を入力して一時的にエージェントを切り替え",
    createNew: "新しいエージェントを作成...",
    noAgents: "利用可能なエージェントがありません",
    create: "作成",
    delete: "{id}を削除",
    confirmDelete: "エージェント「{id}」を削除しますか？",
    thinking: "思考中...",
    callingTool: "ツール呼び出し中...",
    callingToolWithName: "ツール {name} を呼び出し中...",
    mode: {
        plan: "プラン",
        act: "アクション",
        planDescription: "読み取り専用モード。エージェントは分析と計画が可能ですが、ファイルの変更はできません。",
        actDescription: "フルアクセスモード。エージェントはファイルの読み取り、書き込み、変更が可能です。",
        planShort: "読み取り専用分析",
        actShort: "フルアクセス有効",
        planLabel: "読み取り専用分析モード",
        actLabel: "フル読み書きアクセス",
        switchTo: "切り替え",
        currentAriaLabel: "現在：{mode}モード。クリックして切り替え。",
        switchAriaLabel: "{mode}モードに切り替え",
        planModeTitle: "プランモード",
        actModeTitle: "アクションモード",
        planReadonly: "読み取り専用",
        actFullAccess: "フルアクセス",
    },

    runEndPolicy: {
        manual: "手動で適用",
        auto: "完了後に自動適用",
        manualDescription: "内容を確認してからローカルフォルダーに適用します。",
        autoDescription: "この設定は現在のワークスペースに保存されます。新規作成と編集のみ自動適用され、削除は常に手動確認が必要です。",
        menuLabel: "完了後の適用ポリシー",
        currentAriaLabel: "完了後の適用ポリシー：{policy}。クリックして変更します。",
    },

    toolSearch: {
        aiLabel: "AI",
        aiSearchInProgress: "AI セマンティック検索中...",
        aiSearchBadge: "AI セマンティック検索",
        bm25Fallback: "BM25 フォールバック",
    },
    folderTip: {
        title: "ローカルフォルダを開く",
        description:
            "フォルダを許可すると、AI がファイルを読み書きし、ローカルに保存できます。",
        selectFolder: "フォルダを選択",
        later: "後で",
    },

    // 検索会話ツール
    searchConversations: {
        failed: "失敗",
        modeKeyword: "キーワード",
        modeList: "リスト",
        match_one: "{count} 件一致",
        match_other: "{count} 件一致",
        noResults: "一致する会話はありません。",
        projectsHeader: "プロジェクト ({count})",
        fullDay: "終日",
        moreResults: "他 {count} 件（合計 {total} 件）",
        moreAvailable: "さらに結果があります",
        untitled: "（無題）",
    },

    // Mermaid ダイアグラムレンダラー
    mermaid: {
        preparing: "図表を準備中…",
        rendering: "図表をレンダリング中…",
        syntaxError: "Mermaid 構文エラー — ソースを表示",
        preview: "プレビュー",
        source: "ソース",
        copy: "コピー",
        copied: "コピー済み",
        copySource: "ソースをコピー",
        zoom: {
            zoomOut: "縮小",
            zoomIn: "拡大",
            resetPercent: "初期表示に戻す",
            fitToWindow: "ウィンドウに合わせる",
            fitToWindowTitle: "ウィンドウに合わせる（全体が見えるように縮尺）",
            reset: "リセット",
            resetTitle: "表示をリセット",
        },
    },

    pageWriteAuth: {
        title: "AIが現在のページを操作しようとしています",
        approve: "許可",
        deny: "拒否",
    },

    execAuth: {
        title: "コマンド実行の承認",
        subtitle: "AIがあなたのマシンでコマンドを実行しようとしています",
        allow: "許可",
        deny: "拒否",
    },
} as const
