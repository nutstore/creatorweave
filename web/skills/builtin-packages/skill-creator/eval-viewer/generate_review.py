"""
Generate a standalone HTML review page for eval results.

Adapted from Anthropic's skill-creator for the CreatorWeave platform.
Pyodide-compatible: generates static HTML only (no HTTP server).

Reads the workspace directory, discovers runs (directories with outputs/),
embeds all output data into a self-contained HTML page.
"""

import base64
import json
import os
import re


# Files to exclude from output listings
METADATA_FILES = {"transcript.md", "user_notes.md", "metrics.json"}

# Extensions rendered as inline text
TEXT_EXTENSIONS = {
    ".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".tsx", ".jsx",
    ".yaml", ".yml", ".xml", ".html", ".css", ".sh", ".rb", ".go", ".rs",
    ".java", ".c", ".cpp", ".h", ".hpp", ".sql", ".r", ".toml",
}

# Extensions rendered as inline images
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}


def find_runs(workspace: str) -> list[dict]:
    """Recursively find directories that contain an outputs/ subdirectory."""
    runs: list[dict] = []
    _find_runs_recursive(workspace, workspace, runs)
    runs.sort(key=lambda r: (r.get("eval_id", float("inf")), r["id"]))
    return runs


def _find_runs_recursive(root: str, current: str, runs: list[dict]) -> None:
    if not os.path.isdir(current):
        return

    outputs_dir = os.path.join(current, "outputs")
    if os.path.isdir(outputs_dir):
        run = build_run(root, current)
        if run:
            runs.append(run)
        return

    skip = {"node_modules", ".git", "__pycache__", "skill", "inputs"}
    try:
        entries = sorted(os.listdir(current))
    except OSError:
        return
    for child_name in entries:
        child = os.path.join(current, child_name)
        if os.path.isdir(child) and child_name not in skip:
            _find_runs_recursive(root, child, runs)


def build_run(root: str, run_dir: str) -> dict | None:
    """Build a run dict with prompt, outputs, and grading data."""
    prompt = ""
    eval_id = None

    # Try eval_metadata.json
    for candidate in [
        os.path.join(run_dir, "eval_metadata.json"),
        os.path.join(os.path.dirname(run_dir), "eval_metadata.json"),
    ]:
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                prompt = metadata.get("prompt", "")
                eval_id = metadata.get("eval_id")
            except (json.JSONDecodeError, OSError):
                pass
            if prompt:
                break

    # Fall back to transcript.md
    if not prompt:
        for candidate in [
            os.path.join(run_dir, "transcript.md"),
            os.path.join(run_dir, "outputs", "transcript.md"),
        ]:
            if os.path.exists(candidate):
                try:
                    with open(candidate, "r", encoding="utf-8") as f:
                        text = f.read()
                    match = re.search(r"## Eval Prompt\n\n([\s\S]*?)(?=\n##|$)", text)
                    if match:
                        prompt = match.group(1).strip()
                except OSError:
                    pass
                if prompt:
                    break

    if not prompt:
        prompt = "(No prompt found)"

    run_id = os.path.relpath(run_dir, root).replace("/", "-").replace("\\", "-")

    # Collect output files
    outputs_dir = os.path.join(run_dir, "outputs")
    output_files: list[dict] = []
    if os.path.isdir(outputs_dir):
        for fname in sorted(os.listdir(outputs_dir)):
            fpath = os.path.join(outputs_dir, fname)
            if os.path.isfile(fpath) and fname not in METADATA_FILES:
                output_files.append(embed_file(fpath))

    # Load grading if present
    grading = None
    for candidate in [
        os.path.join(run_dir, "grading.json"),
        os.path.join(os.path.dirname(run_dir), "grading.json"),
    ]:
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    grading = json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
            if grading:
                break

    return {
        "id": run_id,
        "prompt": prompt,
        "eval_id": eval_id,
        "outputs": output_files,
        "grading": grading,
    }


def embed_file(path: str) -> dict:
    """Read a file and return an embedded representation."""
    _, ext = os.path.splitext(path)
    ext = ext.lower()

    if ext in TEXT_EXTENSIONS:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except OSError:
            content = "(Error reading file)"
        return {"name": os.path.basename(path), "type": "text", "content": content}

    elif ext in IMAGE_EXTENSIONS:
        try:
            with open(path, "rb") as f:
                raw = f.read()
            b64 = base64.b64encode(raw).decode("ascii")
            mime = f"image/{ext[1:]}"  # .png -> image/png
            return {"name": os.path.basename(path), "type": "image", "data_uri": f"data:{mime};base64,{b64}"}
        except OSError:
            return {"name": os.path.basename(path), "type": "error", "content": "(Error reading file)"}

    else:
        try:
            with open(path, "rb") as f:
                raw = f.read()
            b64 = base64.b64encode(raw).decode("ascii")
            return {"name": os.path.basename(path), "type": "binary", "data_uri": f"data:application/octet-stream;base64,{b64}"}
        except OSError:
            return {"name": os.path.basename(path), "type": "error", "content": "(Error reading file)"}


def load_previous_iteration(workspace: str) -> dict[str, dict]:
    """Load previous iteration's feedback and outputs."""
    result: dict[str, dict] = {}

    # Load feedback
    feedback_map: dict[str, str] = {}
    feedback_path = os.path.join(workspace, "feedback.json")
    if os.path.exists(feedback_path):
        try:
            with open(feedback_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            feedback_map = {
                r["run_id"]: r["feedback"]
                for r in data.get("reviews", [])
                if r.get("feedback", "").strip()
            }
        except (json.JSONDecodeError, OSError, KeyError):
            pass

    # Load runs
    prev_runs = find_runs(workspace)
    for run in prev_runs:
        result[run["id"]] = {
            "feedback": feedback_map.get(run["id"], ""),
            "outputs": run.get("outputs", []),
        }

    return result


def generate_review_html(
    workspace: str,
    skill_name: str = "",
    previous_workspace: str | None = None,
    benchmark_path: str | None = None,
) -> str:
    """Generate a standalone HTML review page.

    Args:
        workspace: Path to the eval workspace directory.
        skill_name: Optional skill name for the header.
        previous_workspace: Path to previous iteration's workspace.
        benchmark_path: Path to benchmark.json.

    Returns:
        Complete HTML string.
    """
    runs = find_runs(workspace)
    if not skill_name:
        skill_name = os.path.basename(workspace).replace("-workspace", "")

    # Load previous iteration data
    previous: dict[str, dict] = {}
    if previous_workspace:
        previous = load_previous_iteration(previous_workspace)

    previous_feedback: dict[str, str] = {}
    previous_outputs: dict[str, list] = {}
    for run_id, data in previous.items():
        if data.get("feedback"):
            previous_feedback[run_id] = data["feedback"]
        if data.get("outputs"):
            previous_outputs[run_id] = data["outputs"]

    # Load benchmark
    benchmark = None
    if benchmark_path and os.path.exists(benchmark_path):
        try:
            with open(benchmark_path, "r", encoding="utf-8") as f:
                benchmark = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    # Build embedded data
    embedded = {
        "skill_name": skill_name,
        "runs": runs,
        "previous_feedback": previous_feedback,
        "previous_outputs": previous_outputs,
    }
    if benchmark:
        embedded["benchmark"] = benchmark

    data_json = json.dumps(embedded)

    # Read viewer template
    viewer_path = os.path.join(os.path.dirname(__file__), "viewer.html")
    if os.path.exists(viewer_path):
        with open(viewer_path, "r", encoding="utf-8") as f:
            template = f.read()
    else:
        template = _fallback_template()

    return template.replace("/*__EMBEDDED_DATA__*/", f"const EMBEDDED_DATA = {data_json};")


def _fallback_template() -> str:
    """Minimal fallback template if viewer.html is not available."""
    return """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Skill Eval Review</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
.run { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.prompt { font-weight: bold; margin-bottom: 8px; }
.output { background: #f5f5f5; padding: 8px; border-radius: 4px; margin: 4px 0; white-space: pre-wrap; }
.grade-pass { color: green; } .grade-fail { color: red; }
.feedback { width: 100%; min-height: 60px; margin-top: 8px; }
</style></head><body>
<h1>Skill Eval Review</h1>
<div id="app"></div>
<script>
/*__EMBEDDED_DATA__*/
const app = document.getElementById('app');
EMBEDDED_DATA.runs.forEach((run, i) => {
    const div = document.createElement('div');
    div.className = 'run';
    div.innerHTML = `<div class="prompt">${run.prompt}</div>` +
        run.outputs.map(o => `<div class="output">${o.type === 'text' ? o.content.replace(/</g,'&lt;') : '[' + o.name + ']'}</div>`).join('');
    if (run.grading) {
        div.innerHTML += run.grading.expectations.map(e =>
            `<div class="${e.passed ? 'grade-pass' : 'grade-fail'}">${e.passed ? '✓' : '✗'} ${e.text}</div>`
        ).join('');
    }
    div.innerHTML += `<textarea class="feedback" placeholder="Feedback..." data-run-id="${run.id}"></textarea>`;
    app.appendChild(div);
});
</script></body></html>"""
