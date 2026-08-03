"""Public tool functions for import, check, and build."""

from __future__ import annotations

import hashlib
import shutil
import time
from pathlib import Path
from typing import Any

from xlsx_skill_runtime.common import current_timestamp
from xlsx_skill_runtime.contracts import ToolResult
from xlsx_skill_runtime.errors import WorkbookImportError
from xlsx_skill_runtime.structure_annotator import (
    ANNOTATED_WORKBOOK_SUFFIX,
    generate_structural_annotation_workbook,
)
from xlsx_skill_runtime.wiki_checker import WikiChecker
from xlsx_skill_runtime.wiki_files import append_json_line, read_json_file, read_yaml_file, write_json_file, write_markdown_file, write_yaml_file
from xlsx_skill_runtime.workspace import WorkspaceManager
from xlsx_skill_runtime.xlsx_builder import XlsxBuilder
from xlsx_skill_runtime.xlsx_parser import XlsxParser, ensure_sheet_secondary_files

DEFAULT_WORKSPACE_ROOT_NAME: str = "xlsx2wiki_workspace"
SUPPORTED_IMPORT_MODES: tuple[str, str] = ("full", "debug")
WORKSPACE_STATE_FILE_NAME: str = "workspace_state.json"
STATE_STATUS_WIKI_CLEAN: str = "wiki_clean"
STATE_STATUS_BUILT_FROM_WIKI: str = "built_from_wiki"
STATE_STATUS_XLSX_MODIFIED_UNRECONCILED: str = "xlsx_modified_unreconciled"


def xlsx_to_wiki(
    source_path: str,
    job_id: str,
    workspace_root: str,
    preview_rows: int,
    display_name: str,
    import_mode: str = "full",
) -> dict[str, Any]:
    resolved_workspace_root: Path = _resolve_workspace_root(workspace_root=workspace_root)
    workspace_manager: WorkspaceManager = WorkspaceManager(workspace_root=resolved_workspace_root)
    workspace = None
    started_at: float = time.perf_counter()
    try:
        normalized_import_mode: str = _normalize_import_mode(import_mode=import_mode)
        source_file: Path = Path(source_path)
        resolved_source_file: Path = source_file.expanduser().resolve()
        if not source_file.exists():
            return ToolResult(ok=False, payload={"job_id": job_id, "error_code": "SOURCE_NOT_FOUND", "message": f"Source file does not exist: {source_file}", "warnings": []}).to_dict()
        if source_file.suffix.lower() != ".xlsx":
            return ToolResult(ok=False, payload={"job_id": job_id, "error_code": "UNSUPPORTED_EXTENSION", "message": f"Source file must use the .xlsx extension: {source_file.name}", "warnings": []}).to_dict()
        if _is_workspace_derived_output(source_path=resolved_source_file, workspace_root=resolved_workspace_root):
            return ToolResult(
                ok=False,
                payload={
                    "job_id": job_id,
                    "error_code": "DERIVED_XLSX_NOT_ALLOWED",
                    "message": "Rebuilt xlsx outputs cannot be imported as a new editing source.",
                    "warnings": [],
                },
            ).to_dict()
        stage_started_at: float = time.perf_counter()
        workspace = workspace_manager.create(job_id=job_id)
        append_json_line(
            path=workspace.logs_dir / "actions.jsonl",
            payload={"timestamp": current_timestamp(), "event": "workspace_created", "elapsed_ms": _elapsed_ms(stage_started_at)},
        )
        stage_started_at = time.perf_counter()
        workspace_manager.copy_source(source_path=source_file, workspace=workspace)
        append_json_line(
            path=workspace.logs_dir / "actions.jsonl",
            payload={"timestamp": current_timestamp(), "event": "source_copy_completed", "elapsed_ms": _elapsed_ms(stage_started_at), "source_path": str(source_file)},
        )
        stage_started_at = time.perf_counter()
        parser: XlsxParser = XlsxParser(
            preview_rows=preview_rows,
            import_mode=normalized_import_mode,
        )
        payload: dict[str, Any] = parser.import_workbook(source_path=source_file, workspace=workspace, job_id=job_id, display_name=display_name)
        append_json_line(
            path=workspace.logs_dir / "actions.jsonl",
            payload={"timestamp": current_timestamp(), "event": "parser_import_completed", "elapsed_ms": _elapsed_ms(stage_started_at)},
        )
        if normalized_import_mode == "debug":
            annotation_stage_started_at: float = time.perf_counter()
            try:
                annotated_output_path: Path = _resolve_import_annotation_output_path(
                    workspace_path=workspace.root,
                    source_path=source_file,
                )
                annotation_path, annotation_warnings = generate_structural_annotation_workbook(
                    workspace_path=workspace.root,
                    source_workbook_path=workspace.raw_dir / "original.xlsx",
                    output_path=annotated_output_path,
                )
                payload["annotated_workbook_path"] = str(annotation_path)
                payload["annotated_workbook_filename"] = annotation_path.name
                payload.setdefault("artifacts", []).append(
                    f"outputs/{annotation_path.name}"
                )
                payload["warnings"] = list(payload.get("warnings", [])) + list(
                    annotation_warnings
                )
                append_json_line(
                    path=workspace.logs_dir / "actions.jsonl",
                    payload={
                        "timestamp": current_timestamp(),
                        "event": "structural_annotation_workbook_completed",
                        "elapsed_ms": _elapsed_ms(annotation_stage_started_at),
                        "output_path": str(annotation_path),
                        "warning_count": len(annotation_warnings),
                    },
                )
            except Exception as error:  # noqa: BLE001
                annotation_warning: str = (
                    "Structural annotation workbook was not generated: "
                    f"{error}"
                )
                payload["warnings"] = list(payload.get("warnings", [])) + [
                    annotation_warning
                ]
                append_json_line(
                    path=workspace.logs_dir / "actions.jsonl",
                    payload={
                        "timestamp": current_timestamp(),
                        "event": "structural_annotation_workbook_failed",
                        "elapsed_ms": _elapsed_ms(annotation_stage_started_at),
                        "message": str(error),
                    },
                )
        _log_tool_call(
            workspace_root=resolved_workspace_root,
            job_id=job_id,
            tool_name="xlsx_to_wiki",
            request={
                "source_path": source_path,
                "requested_workspace_root": workspace_root,
                "resolved_workspace_root": str(resolved_workspace_root),
                "import_mode": normalized_import_mode,
            },
        )
        write_json_file(
            path=workspace.state_dir / WORKSPACE_STATE_FILE_NAME,
            payload={
                "version": "1",
                "truth_source": "wiki",
                "status": STATE_STATUS_WIKI_CLEAN,
                "source_xlsx": {
                    "path": str(resolved_source_file),
                    "sha256": _compute_file_sha256(path=resolved_source_file),
                    "copied_to": str(workspace.raw_dir / "original.xlsx"),
                },
                "import": {
                    "job_id": job_id,
                    "display_name": display_name,
                    "preview_rows": preview_rows,
                    "import_mode": normalized_import_mode,
                },
                "wiki": {
                    "revision": 1,
                },
                "build": {
                    "last_output_path": None,
                    "last_output_filename": None,
                },
            },
        )
        write_json_file(path=workspace.state_dir / "session.json", payload={"job_id": job_id, "status": "ready", "selected_sheet": payload["sheet_slugs"][0] if payload["sheet_slugs"] else None, "last_tool": "xlsx_to_wiki", "import_mode": normalized_import_mode})
        append_json_line(
            path=workspace.logs_dir / "actions.jsonl",
            payload={"timestamp": current_timestamp(), "event": "xlsx_to_wiki_completed", "elapsed_ms": _elapsed_ms(started_at), "sheet_count": len(payload["sheet_slugs"]), "warning_count": len(payload["warnings"]), "import_mode": normalized_import_mode},
        )
        return ToolResult(ok=True, payload={"job_id": job_id, **payload}).to_dict()
    except WorkbookImportError as error:
        if workspace is not None and workspace.root.exists():
            shutil.rmtree(path=workspace.root, ignore_errors=True)
        return ToolResult(ok=False, payload={"job_id": job_id, "error_code": error.error_code, "message": error.message, "warnings": []}).to_dict()
    except FileExistsError as error:
        return ToolResult(ok=False, payload={"job_id": job_id, "error_code": "WORKSPACE_ALREADY_EXISTS", "message": str(error), "warnings": []}).to_dict()
    except Exception as error:  # noqa: BLE001
        if workspace is not None and workspace.root.exists():
            shutil.rmtree(path=workspace.root, ignore_errors=True)
        return ToolResult(ok=False, payload={"job_id": job_id, "error_code": "IMPORT_INTERNAL_ERROR", "message": str(error), "warnings": []}).to_dict()


def check_wiki(workspace_path: str, fail_on_warning: bool) -> dict[str, Any]:
    consistency_error: dict[str, Any] | None = _guard_workspace_consistency(
        workspace_path=Path(workspace_path),
        action_name="check",
        block_on_unreconciled=True,
    )
    if consistency_error is not None:
        return consistency_error
    checker: WikiChecker = WikiChecker()
    result: dict[str, Any] = checker.run(workspace_path=Path(workspace_path), fail_on_warning=fail_on_warning)
    session_path: Path = Path(workspace_path) / "state" / "session.json"
    session_payload: dict[str, Any] = read_json_file(path=session_path)
    session_payload["last_tool"] = "check_wiki"
    session_payload["status"] = "checked"
    write_json_file(path=session_path, payload=session_payload)
    _log_tool_call(workspace_root=Path(workspace_path).parent, job_id=Path(workspace_path).name, tool_name="check_wiki", request={"workspace_path": workspace_path})
    return result


def inspect_sheet(workspace_path: str, sheet_slug: str) -> dict[str, Any]:
    workspace_root: Path = Path(workspace_path)
    state_payload, consistency_warning = _guard_workspace_consistency_for_inspect(
        workspace_path=workspace_root,
    )
    sheet_dir: Path = workspace_root / "wiki" / "sheets" / sheet_slug
    summary_path: Path = sheet_dir / "summary.yaml"
    if not summary_path.exists():
        return ToolResult(
            ok=False,
            payload={
                "workspace_path": workspace_path,
                "sheet_slug": sheet_slug,
                "error_code": "MISSING_SHEET",
                "message": "Sheet summary was not found.",
                "warnings": [],
            },
        ).to_dict()
    ensure_sheet_secondary_files(workspace_path=workspace_root, sheet_slug=sheet_slug)
    workbook_payload: dict[str, Any] = read_yaml_file(path=workspace_root / "wiki" / "workbook.yaml")
    import_mode: str = _read_import_mode_from_workbook(workbook_payload=workbook_payload)
    summary_payload: dict[str, Any] = read_yaml_file(path=summary_path)
    payload: dict[str, Any] = {
        "workspace_path": workspace_path,
        "sheet_slug": sheet_slug,
        "import_mode": import_mode,
        "summary": summary_payload,
        "artifacts": {
            "summary_path": str(summary_path),
            "structure_path": str(sheet_dir / "structure.yaml"),
            "compressed_layout_path": _existing_path_or_none(sheet_dir / "compressed_layout.yaml"),
            "aggregated_values_path": _existing_path_or_none(sheet_dir / "aggregated_values.yaml"),
            "observability_report_path": _existing_path_or_none(sheet_dir / "observability_report.yaml"),
            "observability_markdown_path": _existing_path_or_none(sheet_dir / "observability_report.md"),
            "preview_path": str(sheet_dir / "data-preview.md"),
            "formula_path": str(sheet_dir / "formulas.yaml"),
            "style_path": str(sheet_dir / "styles.yaml"),
            "regions_path": str(sheet_dir / "regions.yaml"),
            "data_bundle_path": str(sheet_dir / "data_bundle.txt"),
        },
        "warnings": [],
    }
    if state_payload is not None:
        payload["consistency_state"] = {
            "truth_source": state_payload.get("truth_source"),
            "status": state_payload.get("status"),
        }
    if consistency_warning is not None:
        payload["warnings"].append(consistency_warning)
    _log_tool_call(
        workspace_root=Path(workspace_path).parent,
        job_id=Path(workspace_path).name,
        tool_name="inspect_sheet",
        request={"workspace_path": workspace_path, "sheet_slug": sheet_slug},
    )
    return ToolResult(ok=True, payload=payload).to_dict()


def _ensure_observability_report(*, sheet_dir: Path) -> None:
    report_path: Path = sheet_dir / "observability_report.yaml"
    report_md_path: Path = sheet_dir / "observability_report.md"
    if report_path.exists() and report_md_path.exists():
        return
    summary_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / "summary.yaml")
    regions_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / "regions.yaml")
    compressed_layout_payload: dict[str, Any] = read_yaml_file(
        path=sheet_dir / "compressed_layout.yaml"
    )
    aggregated_values_payload: dict[str, Any] = read_yaml_file(
        path=sheet_dir / "aggregated_values.yaml"
    )
    regions: list[dict[str, Any]] = [dict(item) for item in regions_payload.get("regions", [])]
    blocks: list[dict[str, Any]] = [dict(item) for item in compressed_layout_payload.get("blocks", [])]
    source_dimensions: dict[str, Any] = dict(summary_payload.get("dimensions", {}))
    max_row: int = int(source_dimensions.get("max_row", 0))
    max_col: int = int(source_dimensions.get("max_col", 0))
    grid_capacity: int = max(max_row, 0) * max(max_col, 0)
    compressed_dimensions: dict[str, Any] = dict(
        compressed_layout_payload.get("compressed_dimensions", {})
    )
    compressed_row_count: int = int(compressed_dimensions.get("row_count", 0))
    compressed_col_count: int = int(compressed_dimensions.get("col_count", 0))
    compressed_cell_count: int = int(compressed_layout_payload.get("cell_count", 0))
    one_row_non_table_regions: list[dict[str, Any]] = [
        {
            "region_id": str(region.get("region_id", "")),
            "type": str(region.get("type", "unknown")),
            "bbox": dict(region.get("bbox", {})),
        }
        for region in regions
        if str(region.get("type", "")) != "table"
        and int(dict(region.get("bbox", {})).get("start_row", 0)) > 0
        and int(dict(region.get("bbox", {})).get("start_row", 0))
        == int(dict(region.get("bbox", {})).get("end_row", 0))
    ]
    report_payload: dict[str, Any] = {
        "version": "1",
        "sheet_slug": summary_payload.get("sheet_slug"),
        "sheet_name": summary_payload.get("sheet_name"),
        "source_grid": {
            "max_row": max_row,
            "max_col": max_col,
            "grid_capacity": grid_capacity,
            "formula_count": int(summary_payload.get("formula_count", 0)),
            "style_count": int(summary_payload.get("style_count", 0)),
            "static_cell_count": int(summary_payload.get("static_cell_count", 0)),
        },
        "region_detection": {
            "block_count": len(blocks),
            "region_count": len(regions),
            "primary_region_id": regions_payload.get("primary_region_id"),
            "block_type_counts": _count_types(blocks),
            "one_row_non_table_region_count": len(one_row_non_table_regions),
            "one_row_non_table_regions": one_row_non_table_regions[:12],
        },
        "compression": {
            "anchor_prune_k": int(compressed_layout_payload.get("k", 0)),
            "compressed_row_count": compressed_row_count,
            "compressed_col_count": compressed_col_count,
            "compressed_cell_count": compressed_cell_count,
            "row_ratio": _safe_ratio(compressed_row_count, max_row),
            "col_ratio": _safe_ratio(compressed_col_count, max_col),
            "cell_ratio_vs_grid_capacity": _safe_ratio(compressed_cell_count, grid_capacity),
        },
        "aggregation": {
            "aggregated_region_count": int(aggregated_values_payload.get("region_count", 0)),
            "aggregated_component_count": int(aggregated_values_payload.get("aggregated_component_count", 0)),
            "aggregated_span_count": int(aggregated_values_payload.get("aggregated_span_count", 0)),
            "text_object_count": int(aggregated_values_payload.get("text_object_count", 0)),
            "merged_object_count": int(aggregated_values_payload.get("merged_object_count", 0)),
        },
        "observations": _build_observations(
            one_row_non_table_region_count=len(one_row_non_table_regions),
            compressed_cell_count=compressed_cell_count,
            grid_capacity=grid_capacity,
        ),
    }
    write_yaml_file(path=report_path, payload=report_payload)
    write_markdown_file(path=report_md_path, content=_build_observability_markdown(report_payload))


def _count_types(items: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        item_type: str = str(item.get("type", "unknown"))
        counts[item_type] = counts.get(item_type, 0) + 1
    return counts


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _format_ratio(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.2%}"


def _build_observations(
    *,
    one_row_non_table_region_count: int,
    compressed_cell_count: int,
    grid_capacity: int,
) -> list[str]:
    observations: list[str] = []
    if one_row_non_table_region_count >= 3:
        observations.append("region detection may be fragmented because many one-row non-table regions were produced")
    if grid_capacity > 0 and compressed_cell_count > (grid_capacity * 0.35):
        observations.append("structural compression is limited on this sheet because a large fraction of the grid remains in compressed_layout")
    observations.append("wiki workspace size can be larger than the source xlsx because it stores normalized editable artifacts rather than a compact archive")
    return observations


def _build_observability_markdown(report_payload: dict[str, Any]) -> str:
    source_grid: dict[str, Any] = dict(report_payload.get("source_grid", {}))
    region_detection: dict[str, Any] = dict(report_payload.get("region_detection", {}))
    compression: dict[str, Any] = dict(report_payload.get("compression", {}))
    aggregation: dict[str, Any] = dict(report_payload.get("aggregation", {}))
    lines: list[str] = [
        f"# {report_payload.get('sheet_name', report_payload.get('sheet_slug', 'Sheet'))} Observability",
        "",
        "## Quick Verdict",
        "",
    ]
    for observation in list(report_payload.get("observations", [])):
        lines.append(f"- {observation}")
    lines.extend(
        [
            "",
            "## Region Detection",
            "",
            f"- Blocks: {int(region_detection.get('block_count', 0))}",
            f"- Regions: {int(region_detection.get('region_count', 0))}",
            f"- Primary region: {region_detection.get('primary_region_id')}",
            f"- One-row non-table regions: {int(region_detection.get('one_row_non_table_region_count', 0))}",
            "",
            "## Compression",
            "",
            f"- Compressed rows: {int(compression.get('compressed_row_count', 0))}",
            f"- Compressed cols: {int(compression.get('compressed_col_count', 0))}",
            f"- Compressed cells: {int(compression.get('compressed_cell_count', 0))}",
            f"- Row ratio: {_format_ratio(compression.get('row_ratio'))}",
            f"- Col ratio: {_format_ratio(compression.get('col_ratio'))}",
            f"- Cell ratio vs grid: {_format_ratio(compression.get('cell_ratio_vs_grid_capacity'))}",
            "",
            "## Aggregation",
            "",
            f"- Aggregated regions: {int(aggregation.get('aggregated_region_count', 0))}",
            f"- Aggregated components: {int(aggregation.get('aggregated_component_count', 0))}",
            f"- Aggregated spans: {int(aggregation.get('aggregated_span_count', 0))}",
            f"- Text objects: {int(aggregation.get('text_object_count', 0))}",
            f"- Merged objects: {int(aggregation.get('merged_object_count', 0))}",
            "",
            "## Storage Note",
            "",
            "- Wiki output is a normalized editable workspace, so total bytes can grow even when structural summaries become smaller.",
        ]
    )
    return "\n".join(lines) + "\n"


def wiki_to_xlsx(workspace_path: str, output_filename: str, overwrite: bool) -> dict[str, Any]:
    # [ACCEPTANCE]: wiki_to_xlsx() refuses to build when validation fails.
    # [PLANS]: Implement wiki rebuild tool.
    consistency_error: dict[str, Any] | None = _guard_workspace_consistency(
        workspace_path=Path(workspace_path),
        action_name="build",
        block_on_unreconciled=True,
    )
    if consistency_error is not None:
        return consistency_error
    checker: WikiChecker = WikiChecker()
    check_result: dict[str, Any] = checker.run(workspace_path=Path(workspace_path), fail_on_warning=False)
    if not check_result["ok"]:
        return ToolResult(ok=False, payload={"workspace_path": workspace_path, "error_code": "CHECK_FAILED", "message": "Build aborted because wiki validation failed.", "warnings": []}).to_dict()
    normalized_output_filename: str = _normalize_output_filename(output_filename=output_filename)
    output_path: Path = _resolve_rebuild_output_path(
        workspace_path=Path(workspace_path),
        output_filename=normalized_output_filename,
        overwrite=overwrite,
    )
    builder: XlsxBuilder = XlsxBuilder()
    built_path: Path = builder.build(workspace_path=Path(workspace_path), output_filename=output_path.name)
    session_path: Path = Path(workspace_path) / "state" / "session.json"
    session_payload: dict[str, Any] = read_json_file(path=session_path)
    session_payload["last_tool"] = "wiki_to_xlsx"
    session_payload["status"] = "built"
    write_json_file(path=session_path, payload=session_payload)
    workspace_state_path: Path = Path(workspace_path) / "state" / WORKSPACE_STATE_FILE_NAME
    if workspace_state_path.exists():
        workspace_state_payload: dict[str, Any] = read_json_file(path=workspace_state_path)
        workspace_state_payload["truth_source"] = "wiki"
        workspace_state_payload["status"] = STATE_STATUS_BUILT_FROM_WIKI
        workspace_state_payload["build"] = {
            "last_output_path": str(built_path),
            "last_output_filename": built_path.name,
        }
        write_json_file(path=workspace_state_path, payload=workspace_state_payload)
    _log_tool_call(
        workspace_root=Path(workspace_path).parent,
        job_id=Path(workspace_path).name,
        tool_name="wiki_to_xlsx",
        request={
            "workspace_path": workspace_path,
            "requested_output_filename": output_filename,
            "resolved_output_filename": output_path.name,
            "overwrite": overwrite,
        },
    )
    return ToolResult(
        ok=True,
        payload={
            "workspace_path": workspace_path,
            "output_path": str(built_path),
            "output_filename": built_path.name,
            "sheet_count": check_result["summary"]["sheet_count"],
            "warnings": [],
        },
    ).to_dict()


def reimport_source_xlsx(workspace_path: str) -> dict[str, Any]:
    workspace_root: Path = Path(workspace_path)
    workspace_state_path: Path = workspace_root / "state" / WORKSPACE_STATE_FILE_NAME
    if not workspace_state_path.exists():
        return ToolResult(
            ok=False,
            payload={
                "workspace_path": workspace_path,
                "error_code": "MISSING_WORKSPACE_STATE",
                "message": "Workspace state file was not found. Re-import cannot continue.",
                "warnings": [],
            },
        ).to_dict()
    workspace_state_payload: dict[str, Any] = read_json_file(path=workspace_state_path)
    source_path: str = str(dict(workspace_state_payload.get("source_xlsx", {})).get("path", "")).strip()
    if source_path == "":
        return ToolResult(
            ok=False,
            payload={
                "workspace_path": workspace_path,
                "error_code": "MISSING_SOURCE_PATH",
                "message": "Workspace state does not contain the original source xlsx path.",
                "warnings": [],
            },
        ).to_dict()
    source_file: Path = Path(source_path)
    if not source_file.exists():
        return ToolResult(
            ok=False,
            payload={
                "workspace_path": workspace_path,
                "error_code": "SOURCE_NOT_FOUND",
                "message": f"Source file does not exist: {source_file}",
                "warnings": [],
            },
        ).to_dict()
    import_payload: dict[str, Any] = dict(workspace_state_payload.get("import", {}))
    job_id: str = str(import_payload.get("job_id", workspace_root.name))
    display_name: str = str(import_payload.get("display_name", source_file.stem))
    preview_rows: int = int(import_payload.get("preview_rows", 10))
    import_mode: str = _normalize_import_mode(import_mode=str(import_payload.get("import_mode", "full")))
    parent_root: Path = workspace_root.parent
    backup_root: Path = parent_root / f"{workspace_root.name}.__reimport_backup__"
    if backup_root.exists():
        shutil.rmtree(backup_root, ignore_errors=True)
    workspace_root.rename(backup_root)
    try:
        payload: dict[str, Any] = xlsx_to_wiki(
            source_path=str(source_file),
            job_id=job_id,
            workspace_root=str(parent_root),
            preview_rows=preview_rows,
            display_name=display_name,
            import_mode=import_mode,
        )
        if not payload.get("ok", False):
            if workspace_root.exists():
                shutil.rmtree(workspace_root, ignore_errors=True)
            backup_root.rename(workspace_root)
            return payload
        shutil.rmtree(backup_root, ignore_errors=True)
        append_json_line(
            path=Path(payload["workspace_path"]) / "logs" / "actions.jsonl",
            payload={
                "timestamp": current_timestamp(),
                "event": "source_reimport_completed",
                "source_path": str(source_file),
            },
        )
        return payload
    except Exception:  # noqa: BLE001
        if workspace_root.exists():
            shutil.rmtree(workspace_root, ignore_errors=True)
        backup_root.rename(workspace_root)
        raise


def _log_tool_call(workspace_root: Path, job_id: str, tool_name: str, request: dict[str, Any]) -> None:
    workspace_logs_path: Path = workspace_root / job_id / "logs" / "tool_calls.jsonl"
    append_json_line(path=workspace_logs_path, payload={"timestamp": current_timestamp(), "tool": tool_name, "request": request})


def _resolve_workspace_root(workspace_root: str) -> Path:
    candidate: str = workspace_root.strip()
    if candidate == "":
        return Path.cwd() / DEFAULT_WORKSPACE_ROOT_NAME
    return Path(candidate).expanduser().resolve()


def _normalize_output_filename(output_filename: str) -> str:
    candidate_name: str = Path(output_filename).name.strip()
    if candidate_name == "":
        candidate_name = "rebuilt.xlsx"
    if Path(candidate_name).suffix.lower() != ".xlsx":
        candidate_name = f"{Path(candidate_name).stem}.xlsx"
    return candidate_name


def _resolve_rebuild_output_path(workspace_path: Path, output_filename: str, overwrite: bool) -> Path:
    outputs_dir: Path = workspace_path / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)
    candidate_path: Path = outputs_dir / output_filename
    if overwrite or not candidate_path.exists():
        return candidate_path
    stem: str = candidate_path.stem
    suffix: str = candidate_path.suffix
    counter: int = 2
    while True:
        versioned_candidate: Path = outputs_dir / f"{stem}_{counter}{suffix}"
        if not versioned_candidate.exists():
            return versioned_candidate
        counter += 1


def _resolve_import_annotation_output_path(workspace_path: Path, source_path: Path) -> Path:
    annotated_output_filename: str = _normalize_output_filename(
        f"{source_path.stem}{ANNOTATED_WORKBOOK_SUFFIX}"
    )
    return _resolve_rebuild_output_path(
        workspace_path=workspace_path,
        output_filename=annotated_output_filename,
        overwrite=False,
    )


def _elapsed_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def _read_import_mode_from_workbook(*, workbook_payload: dict[str, Any]) -> str:
    return _normalize_import_mode(import_mode=str(workbook_payload.get("import_mode", "full")))


def _normalize_import_mode(*, import_mode: str) -> str:
    normalized_mode: str = str(import_mode).strip().lower()
    if normalized_mode in SUPPORTED_IMPORT_MODES:
        return normalized_mode
    raise ValueError(
        f"Unsupported import_mode '{import_mode}'. Expected one of: {', '.join(SUPPORTED_IMPORT_MODES)}."
    )


def _existing_path_or_none(path: Path) -> str | None:
    if path.exists():
        return str(path)
    return None


def _workspace_state_path(workspace_path: Path) -> Path:
    return workspace_path / "state" / WORKSPACE_STATE_FILE_NAME


def _guard_workspace_consistency(workspace_path: Path, *, action_name: str, block_on_unreconciled: bool) -> dict[str, Any] | None:
    _state_payload, issue = _refresh_workspace_consistency_state(workspace_path=workspace_path)
    if issue is None or not block_on_unreconciled:
        return None
    message: str = (
        f"Source xlsx changed after import. Re-import is required before `{action_name}` can continue."
        if issue["code"] == "SOURCE_XLSX_MODIFIED"
        else f"Source xlsx is unavailable. Re-import cannot continue until the source is restored for `{action_name}`."
    )
    return ToolResult(
        ok=False,
        payload={
            "workspace_path": str(workspace_path),
            "error_code": issue["code"],
            "message": message,
            "warnings": [],
            "consistency_state": issue["state"],
        },
    ).to_dict()


def _guard_workspace_consistency_for_inspect(workspace_path: Path) -> tuple[dict[str, Any] | None, str | None]:
    state_payload, issue = _refresh_workspace_consistency_state(workspace_path=workspace_path)
    if issue is None:
        return state_payload, None
    if issue["code"] == "SOURCE_XLSX_MODIFIED":
        return state_payload, "Source xlsx changed after import. Sheet inspection is using a stale wiki snapshot until re-import."
    return state_payload, "Source xlsx is unavailable. Sheet inspection is using the last imported wiki snapshot."


def _refresh_workspace_consistency_state(workspace_path: Path) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    state_path: Path = _workspace_state_path(workspace_path=workspace_path)
    if not state_path.exists():
        return None, None
    state_payload: dict[str, Any] = read_json_file(path=state_path)
    source_payload: dict[str, Any] = dict(state_payload.get("source_xlsx", {}))
    source_path_value: str = str(source_payload.get("path", "")).strip()
    if source_path_value == "":
        return state_payload, None
    source_path: Path = Path(source_path_value)
    if not source_path.exists():
        state_payload["truth_source"] = "source_xlsx_pending_reimport"
        state_payload["status"] = STATE_STATUS_XLSX_MODIFIED_UNRECONCILED
        write_json_file(path=state_path, payload=state_payload)
        return state_payload, {"code": "SOURCE_XLSX_MISSING", "state": {"truth_source": state_payload["truth_source"], "status": state_payload["status"]}}
    current_sha256: str = _compute_file_sha256(path=source_path)
    recorded_sha256: str = str(source_payload.get("sha256", "")).strip()
    if recorded_sha256 != "" and current_sha256 != recorded_sha256:
        state_payload["truth_source"] = "source_xlsx_pending_reimport"
        state_payload["status"] = STATE_STATUS_XLSX_MODIFIED_UNRECONCILED
        write_json_file(path=state_path, payload=state_payload)
        append_json_line(
            path=workspace_path / "logs" / "actions.jsonl",
            payload={
                "timestamp": current_timestamp(),
                "event": "source_xlsx_desync_detected",
                "source_path": str(source_path),
            },
        )
        return state_payload, {"code": "SOURCE_XLSX_MODIFIED", "state": {"truth_source": state_payload["truth_source"], "status": state_payload["status"]}}
    if state_payload.get("status") == STATE_STATUS_XLSX_MODIFIED_UNRECONCILED:
        state_payload["truth_source"] = "wiki"
        state_payload["status"] = STATE_STATUS_WIKI_CLEAN
        write_json_file(path=state_path, payload=state_payload)
    return state_payload, None


def _compute_file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open(mode="rb") as handle:
        while True:
            chunk: bytes = handle.read(1024 * 64)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _is_workspace_derived_output(*, source_path: Path, workspace_root: Path) -> bool:
    try:
        relative_path: Path = source_path.relative_to(workspace_root)
    except ValueError:
        return False
    parts: tuple[str, ...] = relative_path.parts
    return len(parts) >= 3 and parts[1] == "outputs"