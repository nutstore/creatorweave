"""Workspace layout reference for the self-contained workbook skill."""

from __future__ import annotations

WORKSPACE_DIRECTORIES: tuple[str, ...] = (
    "raw",
    "extracted/ooxml",
    "wiki",
    "wiki/checks",
    "wiki/sheets",
    "outputs",
    "logs",
    "state",
)

WORKSPACE_FILES: tuple[str, ...] = (
    "raw/original.xlsx",
    "wiki/workbook.yaml",
    "wiki/names.yaml",
    "state/session.json",
    "state/workspace_state.json",
    "logs/actions.jsonl",
    "logs/tool_calls.jsonl",
    "logs/llm.jsonl",
)

SHEET_FILES: tuple[str, ...] = (
    "structure.yaml",
    "compressed_layout.yaml",
    "aggregated_values.yaml",
    "observability_report.yaml",
    "observability_report.md",
    "regions.yaml",
    "formulas.yaml",
    "data-validations.yaml",
    "tables.yaml",
    "styles.yaml",
)