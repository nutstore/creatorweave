"""Region-level TSV helpers for imported worksheets."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from xlsx_skill_runtime.common import (
    column_index_to_letter,
)
from xlsx_skill_runtime.wiki_files import read_region_data_bundle_section, read_yaml_file


def build_region_bundle(
    *,
    sheet_slug: str,
    sheet_name: str,
    blocks: list[dict[str, Any]],
    cell_values: dict[tuple[int, int], str],
    merged_ranges: list[str],
) -> dict[str, Any]:
    bundle_sections: list[dict[str, Any]] = []
    index_regions: list[dict[str, Any]] = []
    primary_region_id: str | None = None
    for position, block in enumerate(blocks, start=1):
        bbox: dict[str, int] = _normalize_bbox(block.get("bbox", {}))
        if len(bbox) == 0:
            continue
        region_id: str = f"region_{position:03d}"
        block_type: str = str(block.get("type", "unknown"))
        title: str = _build_region_title(
            bbox=bbox,
            block_type=block_type,
            cell_values=cell_values,
            fallback_id=region_id,
        )
        region_data: dict[str, Any] = _build_region_data(
            bbox=bbox,
            block=block,
            cell_values=cell_values,
        )
        merged_in_region: list[str] = [
            merge_ref
            for merge_ref in merged_ranges
            if _range_intersects_bbox(range_ref=merge_ref, bbox=bbox)
        ]
        meta_payload: dict[str, Any] = {
            "version": "1",
            "region_id": region_id,
            "sheet_slug": sheet_slug,
            "sheet_name": sheet_name,
            "title": title,
            "type": block_type,
            "source": str(block.get("source", "unknown")),
            "confidence": float(block.get("confidence", 0.0)),
            "bbox": bbox,
            "header_bbox": _normalize_bbox(block.get("header_bbox", {})) or None,
            "data_bbox": _normalize_bbox(block.get("data_bbox", {})) or None,
            "anchor_rows": [int(value) for value in list(block.get("anchor_rows", []))],
            "anchor_cols": [int(value) for value in list(block.get("anchor_cols", []))],
            "cell_count": int(block.get("cell_count", 0)),
            "storage_format": str(region_data["storage_format"]),
            "header": list(region_data["header"]),
            "row_count": len(region_data["rows"]),
            "merged_ranges": merged_in_region,
        }
        data_locator: dict[str, Any] = {
            "storage": "bundled",
            "file": "data_bundle.txt",
            "section": region_id,
            "format": "tsv",
        }
        bundle_sections.append(
            {
                "section": region_id,
                "header": region_data["header"],
                "rows": region_data["rows"],
            }
        )
        index_regions.append(
            {
                "region_id": region_id,
                "title": title,
                "type": block_type,
                "source": str(block.get("source", "unknown")),
                "bbox": bbox,
                "meta": meta_payload,
                "data_locator": data_locator,
            }
        )
        if primary_region_id is None and block_type == "table":
            primary_region_id = region_id
    if primary_region_id is None and len(index_regions) > 0:
        primary_region_id = str(index_regions[0]["region_id"])
    return {
        "index": {
            "version": "1",
            "sheet_slug": sheet_slug,
            "sheet_name": sheet_name,
            "region_count": len(index_regions),
            "primary_region_id": primary_region_id,
            "regions": index_regions,
        },
        "bundle_sections": bundle_sections,
    }


def load_primary_tabular_data(
    *,
    sheet_dir: Path,
    summary_payload: dict[str, Any] | None = None,
    structure_payload: dict[str, Any] | None = None,
) -> tuple[list[str], list[list[str]]]:
    regions_path: Path = sheet_dir / "regions.yaml"
    if not regions_path.exists():
        return [], []
    regions_payload: dict[str, Any] = read_yaml_file(path=regions_path)
    primary_region_id: str = ""
    if summary_payload is not None:
        primary_region_id = str(summary_payload.get("primary_region_id", "")).strip()
    if primary_region_id == "" and structure_payload is not None:
        primary_region_id = str(structure_payload.get("primary_region_id", "")).strip()
    target_bbox: dict[str, Any] = {}
    if summary_payload is not None:
        target_bbox = dict(summary_payload.get("data_region", {}))
    elif structure_payload is not None:
        target_bbox = dict(structure_payload.get("data_region", {}))
    selected_region: dict[str, Any] | None = select_primary_table_region(
        regions_payload=regions_payload,
        primary_region_id=primary_region_id,
        target_bbox=target_bbox,
    )
    if selected_region is None:
        return [], []
    return load_region_data(sheet_dir=sheet_dir, region_entry=selected_region)


def load_region_data(
    *,
    sheet_dir: Path,
    region_entry: dict[str, Any],
) -> tuple[list[str], list[list[str]]]:
    data_locator: dict[str, Any] = dict(region_entry.get("data_locator", {}))
    if str(data_locator.get("storage", "")).strip() == "bundled":
        bundle_path: Path = sheet_dir / str(data_locator.get("file", "")).strip()
        section: str = str(data_locator.get("section", "")).strip()
        if bundle_path.exists() and section != "":
            return read_region_data_bundle_section(path=bundle_path, section=section)
    files: dict[str, Any] = dict(region_entry.get("files", {}))
    region_data_path = sheet_dir / str(files.get("data", "")).strip()
    if region_data_path.exists():
        return read_tsv_file(path=region_data_path)
    return [], []


def select_primary_table_region(
    *,
    regions_payload: dict[str, Any],
    primary_region_id: str,
    target_bbox: dict[str, Any],
) -> dict[str, Any] | None:
    regions: list[dict[str, Any]] = [dict(item) for item in regions_payload.get("regions", [])]
    if primary_region_id != "":
        for region in regions:
            if str(region.get("region_id", "")).strip() == primary_region_id:
                return region
    table_regions: list[dict[str, Any]] = [
        region for region in regions if str(region.get("type", "")) == "table"
    ]
    if len(table_regions) == 0:
        return None
    normalized_target: dict[str, int] = _normalize_bbox(target_bbox)
    if len(normalized_target) > 0:
        for region in table_regions:
            normalized_bbox: dict[str, int] = _normalize_bbox(region.get("bbox", {}))
            if normalized_bbox == normalized_target:
                return region
    return table_regions[0]


def _build_region_data(
    *,
    bbox: dict[str, int],
    block: dict[str, Any],
    cell_values: dict[tuple[int, int], str],
) -> dict[str, Any]:
    block_type: str = str(block.get("type", "unknown"))
    normalized_header_bbox: dict[str, int] = _normalize_bbox(block.get("header_bbox", {}))
    if block_type == "table" and len(normalized_header_bbox) > 0:
        header_row_index: int = int(normalized_header_bbox["start_row"])
        header: list[str] = []
        for column_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1):
            cell_value: str = cell_values.get((header_row_index, column_index), "").strip()
            header.append(
                cell_value
                if cell_value != ""
                else f"Column {column_index_to_letter(column_index=column_index)}"
            )
        data_start_row: int = int(normalized_header_bbox["end_row"]) + 1
        rows: list[list[str]] = []
        for row_index in range(data_start_row, int(bbox["end_row"]) + 1):
            rows.append(
                [
                    cell_values.get((row_index, column_index), "")
                    for column_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1)
                ]
            )
        return {
            "storage_format": "table_tsv",
            "header": header,
            "rows": rows,
        }
    header = [
        column_index_to_letter(column_index=column_index)
        for column_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1)
    ]
    rows = []
    for row_index in range(int(bbox["start_row"]), int(bbox["end_row"]) + 1):
        rows.append(
            [
                cell_values.get((row_index, column_index), "")
                for column_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1)
            ]
        )
    return {
        "storage_format": "grid_tsv",
        "header": header,
        "rows": rows,
    }


def _build_region_title(
    *,
    bbox: dict[str, int],
    block_type: str,
    cell_values: dict[tuple[int, int], str],
    fallback_id: str,
) -> str:
    first_value: str = ""
    for row_index in range(int(bbox["start_row"]), int(bbox["end_row"]) + 1):
        for column_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1):
            first_value = cell_values.get((row_index, column_index), "").strip()
            if first_value != "":
                break
        if first_value != "":
            break
    if first_value != "":
        return first_value[:80]
    return f"{block_type}_{fallback_id}"


def _normalize_bbox(raw_bbox: Any) -> dict[str, int]:
    bbox: dict[str, Any] = dict(raw_bbox or {})
    start_row: int = int(bbox.get("start_row", 0))
    end_row: int = int(bbox.get("end_row", 0))
    start_col: int = int(bbox.get("start_col", 0))
    end_col: int = int(bbox.get("end_col", 0))
    if start_row <= 0 or end_row <= 0 or start_col <= 0 or end_col <= 0:
        return {}
    if end_row < start_row or end_col < start_col:
        return {}
    return {
        "start_row": start_row,
        "end_row": end_row,
        "start_col": start_col,
        "end_col": end_col,
    }


def _range_intersects_bbox(*, range_ref: str, bbox: dict[str, int]) -> bool:
    start_ref: str
    end_ref: str
    normalized_ref: str = str(range_ref).strip().upper()
    if ":" in normalized_ref:
        start_ref, end_ref = normalized_ref.split(":", maxsplit=1)
    else:
        start_ref = normalized_ref
        end_ref = normalized_ref
    start_row, start_col = _cell_reference_to_coordinates(start_ref)
    end_row, end_col = _cell_reference_to_coordinates(end_ref)
    return not (
        max(start_row, end_row) < int(bbox["start_row"])
        or min(start_row, end_row) > int(bbox["end_row"])
        or max(start_col, end_col) < int(bbox["start_col"])
        or min(start_col, end_col) > int(bbox["end_col"])
    )


def _cell_reference_to_coordinates(cell_reference: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Z]+)(\d+)", cell_reference.upper())
    if match is None:
        raise ValueError(f"Invalid cell reference: {cell_reference}")
    return int(match.group(2)), _column_letter_to_index(match.group(1))


def _column_letter_to_index(column_letter: str) -> int:
    result: int = 0
    for character in column_letter:
        result = (result * 26) + (ord(character.upper()) - ord("A") + 1)
    return result