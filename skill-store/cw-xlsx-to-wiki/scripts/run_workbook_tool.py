from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

SCRIPT_ROOT: Path = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from xlsx_skill_runtime.cli import main as cli_main
from xlsx_skill_runtime.workbook_tools import check_wiki, inspect_sheet, reimport_source_xlsx, wiki_to_xlsx, xlsx_to_wiki


def main() -> int:
    return cli_main()


def run_tool(command: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if command in {"import", "parse", "parse-xlsx"}:
        import_arguments: dict[str, Any] = {
            "source_path": str(arguments["source_path"]),
            "job_id": str(arguments["job_id"]),
            "workspace_root": str(arguments["workspace_root"]),
            "preview_rows": int(arguments["preview_rows"]),
            "display_name": str(arguments["display_name"]),
        }
        if "import_mode" in arguments:
            import_arguments["import_mode"] = str(arguments["import_mode"])
        return xlsx_to_wiki(
            **import_arguments,
        )
    if command == "check":
        return check_wiki(
            workspace_path=str(arguments["workspace_path"]),
            fail_on_warning=bool(arguments["fail_on_warning"]),
        )
    if command == "inspect":
        return inspect_sheet(
            workspace_path=str(arguments["workspace_path"]),
            sheet_slug=str(arguments["sheet_slug"]),
        )
    if command == "build":
        return wiki_to_xlsx(
            workspace_path=str(arguments["workspace_path"]),
            output_filename=str(arguments["output_filename"]),
            overwrite=bool(arguments["overwrite"]),
        )
    if command == "reimport":
        return reimport_source_xlsx(
            workspace_path=str(arguments["workspace_path"]),
        )
    raise ValueError(f"Unsupported command: {command}")


__all__: list[str] = ["check_wiki", "inspect_sheet", "main", "reimport_source_xlsx", "run_tool", "wiki_to_xlsx", "xlsx_to_wiki"]


if __name__ == "__main__":
    raise SystemExit(main())