"""Workspace creation and discovery."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from xlsx_skill_runtime.common import current_timestamp, ensure_directory
from xlsx_skill_runtime.wiki_files import append_json_line, write_json_file


@dataclass(frozen=True)
class WorkspacePaths:
    root: Path
    raw_dir: Path
    extracted_dir: Path
    wiki_dir: Path
    checks_dir: Path
    sheets_dir: Path
    outputs_dir: Path
    logs_dir: Path
    state_dir: Path


class WorkspaceManager:
    """Create and manage isolated workspaces."""

    def __init__(self, workspace_root: Path) -> None:
        self._workspace_root = workspace_root
        ensure_directory(path=self._workspace_root)

    def create(self, job_id: str) -> WorkspacePaths:
        safe_job_id: str = self._validate_job_id(job_id=job_id)
        root: Path = self._workspace_root / safe_job_id
        if root.exists():
            raise FileExistsError(f"Workspace already exists: {root}")
        raw_dir: Path = root / "raw"
        extracted_dir: Path = root / "extracted" / "ooxml"
        wiki_dir: Path = root / "wiki"
        checks_dir: Path = wiki_dir / "checks"
        sheets_dir: Path = wiki_dir / "sheets"
        outputs_dir: Path = root / "outputs"
        logs_dir: Path = root / "logs"
        state_dir: Path = root / "state"
        for directory in [raw_dir, extracted_dir, wiki_dir, checks_dir, sheets_dir, outputs_dir, logs_dir, state_dir]:
            ensure_directory(path=directory)
        write_json_file(path=state_dir / "session.json", payload={"job_id": safe_job_id, "status": "created"})
        for file_name in ["actions.jsonl", "tool_calls.jsonl", "llm.jsonl"]:
            (logs_dir / file_name).touch()
        return WorkspacePaths(
            root=root,
            raw_dir=raw_dir,
            extracted_dir=extracted_dir,
            wiki_dir=wiki_dir,
            checks_dir=checks_dir,
            sheets_dir=sheets_dir,
            outputs_dir=outputs_dir,
            logs_dir=logs_dir,
            state_dir=state_dir,
        )

    def get(self, job_id: str) -> WorkspacePaths:
        root: Path = self._workspace_root / self._validate_job_id(job_id=job_id)
        if not root.exists():
            raise FileNotFoundError(f"Workspace not found: {root}")
        return WorkspacePaths(
            root=root,
            raw_dir=root / "raw",
            extracted_dir=root / "extracted" / "ooxml",
            wiki_dir=root / "wiki",
            checks_dir=root / "wiki" / "checks",
            sheets_dir=root / "wiki" / "sheets",
            outputs_dir=root / "outputs",
            logs_dir=root / "logs",
            state_dir=root / "state",
        )

    def list_job_ids(self) -> list[str]:
        job_ids: list[str] = []
        for path in sorted(self._workspace_root.iterdir()):
            if path.is_dir():
                job_ids.append(path.name)
        return job_ids

    @staticmethod
    def _validate_job_id(*, job_id: str) -> str:
        candidate: str = str(job_id).strip()
        path: Path = Path(candidate)
        if (
            candidate == ""
            or candidate in {".", ".."}
            or path.is_absolute()
            or len(path.parts) != 1
            or "/" in candidate
            or "\\" in candidate
        ):
            raise ValueError("job_id must be a single, non-empty path component")
        return candidate

    def copy_source(self, source_path: Path, workspace: WorkspacePaths) -> Path:
        destination: Path = workspace.raw_dir / "original.xlsx"
        shutil.copy2(src=source_path, dst=destination)
        append_json_line(
            path=workspace.logs_dir / "actions.jsonl",
            payload={"timestamp": current_timestamp(), "event": "source_copied", "source": str(source_path)},
        )
        return destination
