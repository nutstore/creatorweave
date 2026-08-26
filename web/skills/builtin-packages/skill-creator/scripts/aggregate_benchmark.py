"""
Aggregate individual run results into benchmark summary statistics.

Adapted from Anthropic's skill-creator for the CreatorWeave platform.
Pyodide-compatible: no argparse, no sys.exit, uses os.path instead of pathlib.

Reads grading.json files from run directories and produces:
- run_summary with mean, stddev, min, max for each metric
- delta between with_skill and without_skill configurations
"""

import json
import math
import os


def calculate_stats(values: list) -> dict:
    """Calculate mean, stddev, min, max for a list of values."""
    if not values:
        return {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}

    n = len(values)
    mean = sum(values) / n

    if n > 1:
        variance = sum((x - mean) ** 2 for x in values) / (n - 1)
        stddev = math.sqrt(variance)
    else:
        stddev = 0.0

    return {
        "mean": round(mean, 4),
        "stddev": round(stddev, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
    }


def _read_json(path: str):
    """Read and parse a JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _list_dir(path: str) -> list[str]:
    """List directory contents."""
    try:
        return sorted(os.listdir(path))
    except OSError:
        return []


def _is_dir(path: str) -> bool:
    return os.path.isdir(path)


def _exists(path: str) -> bool:
    return os.path.exists(path)


def _join(*parts) -> str:
    return os.path.join(*parts)


def load_run_results(benchmark_dir: str) -> dict:
    """
    Load all run results from a benchmark directory.

    Returns dict keyed by config name (e.g. "with_skill"/"without_skill"),
    each containing a list of run results.

    Supports two directory layouts:
    1. Workspace layout: <benchmark_dir>/eval-N/<config>/run-M/grading.json
    2. Legacy layout: <benchmark_dir>/runs/eval-N/<config>/run-M/grading.json
    """
    # Support both layouts
    runs_dir = _join(benchmark_dir, "runs")
    if _is_dir(runs_dir):
        search_dir = runs_dir
    else:
        search_dir = benchmark_dir

    # Find eval directories
    eval_dirs = [
        d for d in _list_dir(search_dir)
        if d.startswith("eval-") and _is_dir(_join(search_dir, d))
    ]

    if not eval_dirs:
        print(f"No eval directories found in {benchmark_dir}")
        return {}

    results: dict[str, list] = {}

    for eval_idx, eval_dir_name in enumerate(eval_dirs):
        eval_dir = _join(search_dir, eval_dir_name)

        # Try to load eval metadata
        metadata_path = _join(eval_dir, "eval_metadata.json")
        if _exists(metadata_path):
            try:
                metadata = _read_json(metadata_path)
                eval_id = metadata.get("eval_id", eval_idx)
            except (json.JSONDecodeError, OSError):
                eval_id = eval_idx
        else:
            try:
                eval_id = int(eval_dir_name.split("-")[1])
            except ValueError:
                eval_id = eval_idx

        # Discover config directories dynamically
        for config_name in _list_dir(eval_dir):
            config_dir = _join(eval_dir, config_name)
            if not _is_dir(config_dir):
                continue

            # Skip non-config directories (inputs, outputs, etc.)
            run_dirs = [d for d in _list_dir(config_dir) if d.startswith("run-")]
            if not run_dirs:
                continue

            config = config_name
            if config not in results:
                results[config] = []

            for run_dir_name in run_dirs:
                try:
                    run_number = int(run_dir_name.split("-")[1])
                except ValueError:
                    continue

                run_dir = _join(config_dir, run_dir_name)
                grading_file = _join(run_dir, "grading.json")

                if not _exists(grading_file):
                    print(f"Warning: grading.json not found in {run_dir}")
                    continue

                try:
                    grading = _read_json(grading_file)
                except json.JSONDecodeError as e:
                    print(f"Warning: Invalid JSON in {grading_file}: {e}")
                    continue

                # Extract metrics
                result = {
                    "eval_id": eval_id,
                    "run_number": run_number,
                    "pass_rate": grading.get("summary", {}).get("pass_rate", 0.0),
                    "passed": grading.get("summary", {}).get("passed", 0),
                    "failed": grading.get("summary", {}).get("failed", 0),
                    "total": grading.get("summary", {}).get("total", 0),
                }

                # Extract timing
                timing = grading.get("timing", {})
                result["time_seconds"] = timing.get("total_duration_seconds", 0.0)
                timing_file = _join(run_dir, "timing.json")
                if result["time_seconds"] == 0.0 and _exists(timing_file):
                    try:
                        timing_data = _read_json(timing_file)
                        result["time_seconds"] = timing_data.get("total_duration_seconds", 0.0)
                        result["tokens"] = timing_data.get("total_tokens", 0)
                    except json.JSONDecodeError:
                        pass

                # Extract execution metrics if available
                metrics = grading.get("execution_metrics", {})
                result["tool_calls"] = metrics.get("total_tool_calls", 0)
                if not result.get("tokens"):
                    result["tokens"] = metrics.get("output_chars", 0)
                result["errors"] = metrics.get("errors_encountered", 0)

                # Extract expectations
                raw_expectations = grading.get("expectations", [])
                for exp in raw_expectations:
                    if "text" not in exp or "passed" not in exp:
                        print(
                            f"Warning: expectation in {grading_file} "
                            f"missing required fields: {exp}"
                        )
                result["expectations"] = raw_expectations

                # Extract notes
                notes_summary = grading.get("user_notes_summary", {})
                notes = []
                notes.extend(notes_summary.get("uncertainties", []))
                notes.extend(notes_summary.get("needs_review", []))
                notes.extend(notes_summary.get("workarounds", []))
                result["notes"] = notes

                results[config].append(result)

    return results


def aggregate_results(results: dict) -> dict:
    """Aggregate run results into summary statistics."""
    run_summary = {}
    configs = list(results.keys())

    for config in configs:
        runs = results.get(config, [])

        if not runs:
            run_summary[config] = {
                "pass_rate": {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0},
                "time_seconds": {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0},
                "tokens": {"mean": 0, "stddev": 0, "min": 0, "max": 0},
            }
            continue

        pass_rates = [r["pass_rate"] for r in runs]
        times = [r["time_seconds"] for r in runs]
        tokens = [r.get("tokens", 0) for r in runs]

        run_summary[config] = {
            "pass_rate": calculate_stats(pass_rates),
            "time_seconds": calculate_stats(times),
            "tokens": calculate_stats(tokens),
        }

    # Calculate delta between the first two configs
    if len(configs) >= 2:
        primary = run_summary.get(configs[0], {})
        baseline = run_summary.get(configs[1], {})
    else:
        primary = run_summary.get(configs[0], {}) if configs else {}
        baseline = {}

    delta_pass_rate = primary.get("pass_rate", {}).get("mean", 0) - baseline.get("pass_rate", {}).get("mean", 0)
    delta_time = primary.get("time_seconds", {}).get("mean", 0) - baseline.get("time_seconds", {}).get("mean", 0)
    delta_tokens = primary.get("tokens", {}).get("mean", 0) - baseline.get("tokens", {}).get("mean", 0)

    run_summary["delta"] = {
        "pass_rate": f"{delta_pass_rate:+.2f}",
        "time_seconds": f"{delta_time:+.1f}",
        "tokens": f"{delta_tokens:+.0f}",
    }

    return run_summary


def generate_benchmark(benchmark_dir: str, skill_name: str = "", skill_path: str = "") -> dict:
    """Generate complete benchmark.json from run results."""
    from datetime import datetime, timezone

    results = load_run_results(benchmark_dir)
    run_summary = aggregate_results(results)

    # Build runs array
    runs = []
    for config in results:
        for result in results[config]:
            runs.append({
                "eval_id": result["eval_id"],
                "configuration": config,
                "run_number": result["run_number"],
                "result": {
                    "pass_rate": result["pass_rate"],
                    "passed": result["passed"],
                    "failed": result["failed"],
                    "total": result["total"],
                    "time_seconds": result["time_seconds"],
                    "tokens": result.get("tokens", 0),
                    "tool_calls": result.get("tool_calls", 0),
                    "errors": result.get("errors", 0),
                },
                "expectations": result["expectations"],
                "notes": result["notes"],
            })

    # Determine eval IDs
    eval_ids = sorted(set(
        r["eval_id"]
        for config in results.values()
        for r in config
    ))

    benchmark = {
        "metadata": {
            "skill_name": skill_name or "<skill-name>",
            "skill_path": skill_path or "<path/to/skill>",
            "executor_model": "<model-name>",
            "analyzer_model": "<model-name>",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "evals_run": eval_ids,
            "runs_per_configuration": 3,
        },
        "runs": runs,
        "run_summary": run_summary,
        "notes": [],
    }

    return benchmark


def generate_markdown(benchmark: dict) -> str:
    """Generate human-readable benchmark.md from benchmark data."""
    metadata = benchmark["metadata"]
    run_summary = benchmark["run_summary"]

    configs = [k for k in run_summary if k != "delta"]
    config_a = configs[0] if len(configs) >= 1 else "config_a"
    config_b = configs[1] if len(configs) >= 2 else "config_b"
    label_a = config_a.replace("_", " ").title()
    label_b = config_b.replace("_", " ").title()

    lines = [
        f"# Skill Benchmark: {metadata['skill_name']}",
        "",
        f"**Model**: {metadata['executor_model']}",
        f"**Date**: {metadata['timestamp']}",
        f"**Evals**: {', '.join(map(str, metadata['evals_run']))} ({metadata['runs_per_configuration']} runs each)",
        "",
        "## Summary",
        "",
        f"| Metric | {label_a} | {label_b} | Delta |",
        "|--------|------------|---------------|-------|",
    ]

    a_summary = run_summary.get(config_a, {})
    b_summary = run_summary.get(config_b, {})
    delta = run_summary.get("delta", {})

    # Pass rate
    a_pr = a_summary.get("pass_rate", {})
    b_pr = b_summary.get("pass_rate", {})
    lines.append(
        f"| Pass Rate | {a_pr.get('mean', 0)*100:.0f}% ± {a_pr.get('stddev', 0)*100:.0f}% "
        f"| {b_pr.get('mean', 0)*100:.0f}% ± {b_pr.get('stddev', 0)*100:.0f}% "
        f"| {delta.get('pass_rate', '—')} |"
    )

    # Time
    a_time = a_summary.get("time_seconds", {})
    b_time = b_summary.get("time_seconds", {})
    lines.append(
        f"| Time | {a_time.get('mean', 0):.1f}s ± {a_time.get('stddev', 0):.1f}s "
        f"| {b_time.get('mean', 0):.1f}s ± {b_time.get('stddev', 0):.1f}s "
        f"| {delta.get('time_seconds', '—')}s |"
    )

    # Tokens
    a_tokens = a_summary.get("tokens", {})
    b_tokens = b_summary.get("tokens", {})
    lines.append(
        f"| Tokens | {a_tokens.get('mean', 0):.0f} ± {a_tokens.get('stddev', 0):.0f} "
        f"| {b_tokens.get('mean', 0):.0f} ± {b_tokens.get('stddev', 0):.0f} "
        f"| {delta.get('tokens', '—')} |"
    )

    # Notes
    if benchmark.get("notes"):
        lines.extend(["", "## Notes", ""])
        for note in benchmark["notes"]:
            lines.append(f"- {note}")

    return "\n".join(lines)
