"""Generate an HTML report from benchmark optimization loop output.

Adapted from Anthropic's skill-creator for the CreatorWeave platform.
Pyodide-compatible: no argparse, no pathlib.
"""

import html as html_module
import json


def generate_html(data: dict, auto_refresh: bool = False, skill_name: str = "") -> str:
    """Generate HTML report from loop output data.

    Args:
        data: The loop output data (from run_loop or equivalent).
        auto_refresh: Add meta refresh tag for live updates.
        skill_name: Optional skill name for the title.

    Returns:
        HTML string.
    """
    history = data.get("history", [])
    title_prefix = html_module.escape(skill_name + " — ") if skill_name else ""

    # Get all unique queries from train and test sets
    train_queries: list[dict] = []
    test_queries: list[dict] = []
    if history:
        for r in history[0].get("train_results", history[0].get("results", [])):
            train_queries.append({
                "query": r["query"],
                "should_trigger": r.get("should_trigger", True),
            })
        if history[0].get("test_results"):
            for r in history[0].get("test_results", []):
                test_queries.append({
                    "query": r["query"],
                    "should_trigger": r.get("should_trigger", True),
                })

    refresh_tag = '    <meta http-equiv="refresh" content="5">\n' if auto_refresh else ""

    # Build HTML
    parts = []
    parts.append(f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
{refresh_tag}    <title>{title_prefix}Skill Description Optimization</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            max-width: 100%;
            margin: 0 auto;
            padding: 20px;
            background: #faf9f5;
            color: #141413;
        }}
        h1 {{ color: #141413; }}
        .explainer {{
            background: white;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #e8e6dc;
            color: #b0aea5;
            font-size: 0.875rem;
            line-height: 1.6;
        }}
        .summary {{
            background: white;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #e8e6dc;
        }}
        .summary p {{ margin: 5px 0; }}
        .best {{ color: #788c5d; font-weight: bold; }}
        .table-container {{ overflow-x: auto; width: 100%; }}
        table {{
            border-collapse: collapse;
            background: white;
            border: 1px solid #e8e6dc;
            border-radius: 6px;
            font-size: 12px;
            min-width: 100%;
        }}
        th, td {{
            padding: 8px;
            text-align: left;
            border: 1px solid #e8e6dc;
            white-space: normal;
            word-wrap: break-word;
        }}
        th {{
            background: #141413;
            color: #faf9f5;
            font-weight: 500;
        }}
        th.test-col {{ background: #6a9bcc; }}
        th.query-col {{ min-width: 200px; }}
        td.description {{
            font-family: monospace;
            font-size: 11px;
            word-wrap: break-word;
            max-width: 400px;
        }}
        td.result {{ text-align: center; font-size: 16px; min-width: 40px; }}
        td.test-result {{ background: #f0f6fc; }}
        .pass {{ color: #788c5d; }}
        .fail {{ color: #c44; }}
        .rate {{ font-size: 9px; color: #b0aea5; display: block; }}
        tr:hover {{ background: #faf9f5; }}
        .score {{
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 11px;
        }}
        .score-good {{ background: #eef2e8; color: #788c5d; }}
        .score-ok {{ background: #fef3c7; color: #d97706; }}
        .score-bad {{ background: #fceaea; color: #c44; }}
        .best-row {{ background: #f5f8f2; }}
        th.positive-col {{ border-bottom: 3px solid #788c5d; }}
        th.negative-col {{ border-bottom: 3px solid #c44; }}
        .legend {{
            display: flex; gap: 20px; margin-bottom: 10px;
            font-size: 13px; align-items: center;
        }}
        .legend-item {{ display: flex; align-items: center; gap: 6px; }}
        .legend-swatch {{
            width: 16px; height: 16px; border-radius: 3px;
            display: inline-block;
        }}
        .swatch-positive {{ background: #141413; border-bottom: 3px solid #788c5d; }}
        .swatch-negative {{ background: #141413; border-bottom: 3px solid #c44; }}
        .swatch-test {{ background: #6a9bcc; }}
        .swatch-train {{ background: #141413; }}
    </style>
</head>
<body>
    <h1>{title_prefix}Skill Description Optimization</h1>
    <div class="explainer">
        <strong>Optimizing your skill's description.</strong>
        This page updates automatically as different description versions are tested.
        Each row is an iteration. Green ✓ means correct trigger/no-trigger, red ✗ means wrong.
        "Train" = queries used to improve; "Test" = held-out queries.
    </div>
""")

    # Summary
    best_test_score = data.get("best_test_score")
    parts.append(f"""
    <div class="summary">
        <p><strong>Original:</strong> {html_module.escape(data.get('original_description', 'N/A'))}</p>
        <p class="best"><strong>Best:</strong> {html_module.escape(data.get('best_description', 'N/A'))}</p>
        <p><strong>Best Score:</strong> {data.get('best_score', 'N/A')} {'(test)' if best_test_score else '(train)'}</p>
        <p><strong>Iterations:</strong> {data.get('iterations_run', 0)} |
           <strong>Train:</strong> {data.get('train_size', '?')} |
           <strong>Test:</strong> {data.get('test_size', '?')}</p>
    </div>
""")

    # Legend
    parts.append("""
    <div class="legend">
        <span style="font-weight:600">Query columns:</span>
        <span class="legend-item"><span class="legend-swatch swatch-positive"></span> Should trigger</span>
        <span class="legend-item"><span class="legend-swatch swatch-negative"></span> Should NOT trigger</span>
        <span class="legend-item"><span class="legend-swatch swatch-train"></span> Train</span>
        <span class="legend-item"><span class="legend-swatch swatch-test"></span> Test</span>
    </div>
""")

    # Table header
    parts.append("""
    <div class="table-container">
    <table>
        <thead>
            <tr>
                <th>Iter</th>
                <th>Train</th>
                <th>Test</th>
                <th class="query-col">Description</th>
""")

    for qinfo in train_queries:
        polarity = "positive-col" if qinfo["should_trigger"] else "negative-col"
        parts.append(f'                <th class="{polarity}">{html_module.escape(qinfo["query"])}</th>\n')

    for qinfo in test_queries:
        polarity = "positive-col" if qinfo["should_trigger"] else "negative-col"
        parts.append(f'                <th class="test-col {polarity}">{html_module.escape(qinfo["query"])}</th>\n')

    parts.append("""            </tr>
        </thead>
        <tbody>
""")

    # Find best iteration
    best_iter = None
    if history:
        if test_queries:
            best_iter = max(history, key=lambda h: h.get("test_passed") or 0).get("iteration")
        else:
            best_iter = max(
                history,
                key=lambda h: h.get("train_passed", h.get("passed", 0)),
            ).get("iteration")

    for h in history:
        iteration = h.get("iteration", "?")
        train_passed = h.get("train_passed", h.get("passed", 0))
        train_total = h.get("train_total", h.get("total", 0))
        test_passed = h.get("test_passed")
        test_total = h.get("test_total")
        description = h.get("description", "")
        train_results = h.get("train_results", h.get("results", []))
        test_results = h.get("test_results", [])

        train_by_query = {r["query"]: r for r in train_results}
        test_by_query = {r["query"]: r for r in test_results} if test_results else {}

        def score_class(correct: int, total: int) -> str:
            if total > 0:
                ratio = correct / total
                if ratio >= 0.8:
                    return "score-good"
                elif ratio >= 0.5:
                    return "score-ok"
            return "score-bad"

        # Compute runs for train and test
        train_correct = sum(
            r.get("triggers", 0) if r.get("should_trigger", True)
            else r.get("runs", 0) - r.get("triggers", 0)
            for r in train_results
        )
        train_runs = sum(r.get("runs", 0) for r in train_results)
        test_correct = sum(
            r.get("triggers", 0) if r.get("should_trigger", True)
            else r.get("runs", 0) - r.get("triggers", 0)
            for r in test_results
        )
        test_runs = sum(r.get("runs", 0) for r in test_results)

        row_class = "best-row" if iteration == best_iter else ""

        parts.append(f"""            <tr class="{row_class}">
                <td>{iteration}</td>
                <td><span class="score {score_class(train_correct, train_runs)}">{train_correct}/{train_runs}</span></td>
                <td><span class="score {score_class(test_correct, test_runs)}">{test_correct}/{test_runs}</span></td>
                <td class="description">{html_module.escape(description)}</td>
""")

        for qinfo in train_queries:
            r = train_by_query.get(qinfo["query"], {})
            did_pass = r.get("pass", False)
            triggers = r.get("triggers", 0)
            runs = r.get("runs", 0)
            icon = "✓" if did_pass else "✗"
            css_class = "pass" if did_pass else "fail"
            parts.append(
                f'                <td class="result {css_class}">'
                f'{icon}<span class="rate">{triggers}/{runs}</span></td>\n'
            )

        for qinfo in test_queries:
            r = test_by_query.get(qinfo["query"], {})
            did_pass = r.get("pass", False)
            triggers = r.get("triggers", 0)
            runs = r.get("runs", 0)
            icon = "✓" if did_pass else "✗"
            css_class = "pass" if did_pass else "fail"
            parts.append(
                f'                <td class="result test-result {css_class}">'
                f'{icon}<span class="rate">{triggers}/{runs}</span></td>\n'
            )

        parts.append("            </tr>\n")

    parts.append("""        </tbody>
    </table>
    </div>
</body>
</html>
""")

    return "".join(parts)
