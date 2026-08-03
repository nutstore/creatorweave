"""Structural-anchor-based compression helpers for worksheet skeleton views."""

from __future__ import annotations

from typing import Any

from xlsx_skill_runtime.common import (
    cell_reference_to_coordinates,
    coordinates_to_cell_reference,
)

DEFAULT_ANCHOR_PRUNE_K: int = 2


def build_compressed_layout(
    *,
    sheet_slug: str,
    sheet_name: str,
    dimensions: dict[str, Any],
    structural_cells: dict[tuple[int, int], dict[str, Any]],
    cell_values: dict[tuple[int, int], str],
    anchors: dict[str, Any],
    blocks: list[dict[str, Any]],
    merged_ranges: list[str],
    k: int = DEFAULT_ANCHOR_PRUNE_K,
) -> dict[str, Any]:
    max_row: int = int(dimensions.get("max_row", 0))
    max_col: int = int(dimensions.get("max_col", 0))
    normalized_k: int = max(int(k), 0)

    anchor_rows: set[int] = _collect_axis_indexes(
        anchor_payload=list(dict(anchors).get("rows", [])),
        block_key="anchor_rows",
        blocks=blocks,
        merged_ranges=merged_ranges,
        axis="row",
    )
    anchor_cols: set[int] = _collect_axis_indexes(
        anchor_payload=list(dict(anchors).get("columns", [])),
        block_key="anchor_cols",
        blocks=blocks,
        merged_ranges=merged_ranges,
        axis="col",
    )
    if len(anchor_rows) == 0:
        anchor_rows = {row_index for row_index, _ in structural_cells.keys()}
    if len(anchor_cols) == 0:
        anchor_cols = {col_index for _, col_index in structural_cells.keys()}

    kept_rows: list[int] = _select_axis_indexes(
        max_index=max_row,
        anchor_indexes=anchor_rows,
        k=normalized_k,
    )
    kept_cols: list[int] = _select_axis_indexes(
        max_index=max_col,
        anchor_indexes=anchor_cols,
        k=normalized_k,
    )
    row_mapping: dict[int, int] = {
        row_index: mapped_index
        for mapped_index, row_index in enumerate(kept_rows, start=1)
    }
    col_mapping: dict[int, int] = {
        col_index: mapped_index
        for mapped_index, col_index in enumerate(kept_cols, start=1)
    }

    compressed_cells: list[dict[str, Any]] = []
    for row_index, col_index in sorted(structural_cells.keys()):
        if row_index not in row_mapping or col_index not in col_mapping:
            continue
        compressed_cells.append(
            {
                "original_cell": coordinates_to_cell_reference(row_index, col_index),
                "compressed_cell": coordinates_to_cell_reference(
                    row_mapping[row_index],
                    col_mapping[col_index],
                ),
                "kind": str(structural_cells[(row_index, col_index)].get("kind", "unknown")),
                "value": cell_values.get((row_index, col_index), ""),
                "has_formula": bool(
                    structural_cells[(row_index, col_index)].get("has_formula", False)
                ),
                "has_style": bool(
                    structural_cells[(row_index, col_index)].get("has_style", False)
                ),
            }
        )

    compressed_merged_ranges: list[dict[str, Any]] = []
    for merge_ref in merged_ranges:
        start_row, end_row, start_col, end_col = _range_to_bounds(range_ref=merge_ref)
        if (
            start_row not in row_mapping
            or end_row not in row_mapping
            or start_col not in col_mapping
            or end_col not in col_mapping
        ):
            continue
        compressed_merged_ranges.append(
            {
                "original_range": merge_ref,
                "compressed_range": _bounds_to_range(
                    start_row=row_mapping[start_row],
                    end_row=row_mapping[end_row],
                    start_col=col_mapping[start_col],
                    end_col=col_mapping[end_col],
                ),
            }
        )

    compressed_blocks: list[dict[str, Any]] = []
    for block in blocks:
        compressed_blocks.append(
            {
                "block_id": str(block.get("block_id", "")),
                "type": str(block.get("type", "unknown")),
                "source": str(block.get("source", "unknown")),
                "confidence": float(block.get("confidence", 0.0)),
                "original_bbox": dict(block.get("bbox", {})),
                "compressed_bbox": _remap_bbox(
                    bbox=dict(block.get("bbox", {})),
                    row_mapping=row_mapping,
                    col_mapping=col_mapping,
                ),
                "compressed_header_bbox": _remap_bbox(
                    bbox=dict(block.get("header_bbox") or {}),
                    row_mapping=row_mapping,
                    col_mapping=col_mapping,
                ),
                "compressed_data_bbox": _remap_bbox(
                    bbox=dict(block.get("data_bbox") or {}),
                    row_mapping=row_mapping,
                    col_mapping=col_mapping,
                ),
            }
        )

    return {
        "version": "1",
        "sheet_slug": sheet_slug,
        "sheet_name": sheet_name,
        "k": normalized_k,
        "original_dimensions": {
            "max_row": max_row,
            "max_col": max_col,
        },
        "compressed_dimensions": {
            "row_count": len(kept_rows),
            "col_count": len(kept_cols),
        },
        "anchors": {
            "rows": sorted(anchor_rows),
            "columns": sorted(anchor_cols),
        },
        "kept_rows": kept_rows,
        "kept_cols": kept_cols,
        "row_mapping": [
            {"original": original_index, "compressed": compressed_index}
            for original_index, compressed_index in row_mapping.items()
        ],
        "col_mapping": [
            {"original": original_index, "compressed": compressed_index}
            for original_index, compressed_index in col_mapping.items()
        ],
        "cell_count": len(compressed_cells),
        "compressed_cells": compressed_cells,
        "merged_ranges": compressed_merged_ranges,
        "blocks": compressed_blocks,
    }


def _collect_axis_indexes(
    *,
    anchor_payload: list[dict[str, Any]],
    block_key: str,
    blocks: list[dict[str, Any]],
    merged_ranges: list[str],
    axis: str,
) -> set[int]:
    indexes: set[int] = set()
    for anchor_entry in anchor_payload:
        anchor_index: int = int(dict(anchor_entry).get("index", 0))
        if anchor_index > 0:
            indexes.add(anchor_index)
    for block in blocks:
        for value in list(block.get(block_key, [])):
            axis_index: int = int(value)
            if axis_index > 0:
                indexes.add(axis_index)
    for merge_ref in merged_ranges:
        start_row, end_row, start_col, end_col = _range_to_bounds(range_ref=merge_ref)
        if axis == "row":
            indexes.update(range(start_row, end_row + 1))
        else:
            indexes.update(range(start_col, end_col + 1))
    return indexes


def _select_axis_indexes(
    *,
    max_index: int,
    anchor_indexes: set[int],
    k: int,
) -> list[int]:
    if max_index <= 0 or len(anchor_indexes) == 0:
        return []
    sorted_anchors: list[int] = sorted(anchor_indexes)
    kept: list[int] = []
    for candidate in range(1, max_index + 1):
        if min(abs(candidate - anchor_index) for anchor_index in sorted_anchors) <= k:
            kept.append(candidate)
    return kept


def _remap_bbox(
    *,
    bbox: dict[str, Any],
    row_mapping: dict[int, int],
    col_mapping: dict[int, int],
) -> dict[str, int] | None:
    if len(bbox) == 0:
        return None
    start_row: int = int(bbox.get("start_row", 0))
    end_row: int = int(bbox.get("end_row", 0))
    start_col: int = int(bbox.get("start_col", 0))
    end_col: int = int(bbox.get("end_col", 0))
    if (
        start_row not in row_mapping
        or end_row not in row_mapping
        or start_col not in col_mapping
        or end_col not in col_mapping
    ):
        return None
    return {
        "start_row": row_mapping[start_row],
        "end_row": row_mapping[end_row],
        "start_col": col_mapping[start_col],
        "end_col": col_mapping[end_col],
    }


def _range_to_bounds(*, range_ref: str) -> tuple[int, int, int, int]:
    normalized_ref: str = str(range_ref).strip()
    if normalized_ref == "":
        return 0, 0, 0, 0
    if ":" in normalized_ref:
        start_ref, end_ref = normalized_ref.split(":", maxsplit=1)
    else:
        start_ref = normalized_ref
        end_ref = normalized_ref
    start_row, start_col = cell_reference_to_coordinates(start_ref)
    end_row, end_col = cell_reference_to_coordinates(end_ref)
    return (
        min(start_row, end_row),
        max(start_row, end_row),
        min(start_col, end_col),
        max(start_col, end_col),
    )


def _bounds_to_range(
    *,
    start_row: int,
    end_row: int,
    start_col: int,
    end_col: int,
) -> str:
    start_ref: str = coordinates_to_cell_reference(start_row, start_col)
    end_ref: str = coordinates_to_cell_reference(end_row, end_col)
    if start_ref == end_ref:
        return start_ref
    return f"{start_ref}:{end_ref}"