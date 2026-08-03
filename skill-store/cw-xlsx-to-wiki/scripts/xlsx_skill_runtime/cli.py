"""CLI helpers for the self-contained workbook skill."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from xlsx_skill_runtime.workbook_tools import check_wiki, inspect_sheet, reimport_source_xlsx, wiki_to_xlsx, xlsx_to_wiki


def main() -> int:
    parser: argparse.ArgumentParser = build_parser()
    arguments: argparse.Namespace = parser.parse_args()
    payload: dict[str, Any] = run_command(arguments=arguments)
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser: argparse.ArgumentParser = argparse.ArgumentParser(
        description="Run self-contained workbook import, check, and build commands for the skill."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    import_parser: argparse.ArgumentParser = subparsers.add_parser("import")
    import_parser.add_argument("--source-path", required=True)
    import_parser.add_argument("--job-id", required=True)
    import_parser.add_argument("--workspace-root", required=True)
    import_parser.add_argument("--preview-rows", required=True, type=int)
    import_parser.add_argument("--display-name", required=True)
    import_parser.add_argument("--import-mode", choices=["full", "debug"], default="full")

    parse_parser: argparse.ArgumentParser = subparsers.add_parser(
        "parse",
        aliases=["parse-xlsx"],
        help="Parse one .xlsx file into the wiki workspace layout.",
    )
    parse_parser.add_argument("--source-path", required=True)
    parse_parser.add_argument("--job-id")
    parse_parser.add_argument("--workspace-root", default="")
    parse_parser.add_argument("--preview-rows", default=10, type=int)
    parse_parser.add_argument("--display-name")
    parse_parser.add_argument("--import-mode", choices=["full", "debug"], default="full")

    check_parser: argparse.ArgumentParser = subparsers.add_parser("check")
    check_parser.add_argument("--workspace-path", required=True)
    check_parser.add_argument("--fail-on-warning", required=True)

    inspect_parser: argparse.ArgumentParser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("--workspace-path", required=True)
    inspect_parser.add_argument("--sheet-slug", required=True)

    build_parser: argparse.ArgumentParser = subparsers.add_parser("build")
    build_parser.add_argument("--workspace-path", required=True)
    build_parser.add_argument("--output-filename", required=True)
    build_parser.add_argument("--overwrite", required=True)

    reimport_parser: argparse.ArgumentParser = subparsers.add_parser("reimport")
    reimport_parser.add_argument("--workspace-path", required=True)
    return parser


def run_command(arguments: argparse.Namespace) -> dict[str, Any]:
    command: str = str(arguments.command)
    if command in {"import", "parse", "parse-xlsx"}:
        source_path: str = str(arguments.source_path)
        job_id: str = str(
            getattr(arguments, "job_id", None)
            or _default_job_id(source_path=source_path)
        )
        display_name: str = str(
            getattr(arguments, "display_name", None)
            or Path(source_path).stem
        )
        import_arguments: dict[str, Any] = {
            "source_path": source_path,
            "job_id": job_id,
            "workspace_root": str(arguments.workspace_root),
            "preview_rows": int(arguments.preview_rows),
            "display_name": display_name,
        }
        if hasattr(arguments, "import_mode"):
            import_arguments["import_mode"] = str(arguments.import_mode)
        return xlsx_to_wiki(
            **import_arguments,
        )
    if command == "check":
        return check_wiki(
            workspace_path=str(arguments.workspace_path),
            fail_on_warning=parse_bool(value=str(arguments.fail_on_warning)),
        )
    if command == "inspect":
        return inspect_sheet(
            workspace_path=str(arguments.workspace_path),
            sheet_slug=str(arguments.sheet_slug),
        )
    if command == "reimport":
        return reimport_source_xlsx(
            workspace_path=str(arguments.workspace_path),
        )
    return wiki_to_xlsx(
        workspace_path=str(arguments.workspace_path),
        output_filename=str(arguments.output_filename),
        overwrite=parse_bool(value=str(arguments.overwrite)),
    )


def parse_bool(value: str) -> bool:
    normalized: str = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError(f"Invalid boolean value: {value}")


def _default_job_id(source_path: str) -> str:
    source_name: str = Path(source_path).stem.strip()
    sanitized: list[str] = []
    previous_was_dash: bool = False
    for character in source_name.lower():
        if character.isalnum():
            sanitized.append(character)
            previous_was_dash = False
            continue
        if not previous_was_dash:
            sanitized.append("-")
            previous_was_dash = True
    candidate: str = "".join(sanitized).strip("-")
    return candidate or "xlsx-job"