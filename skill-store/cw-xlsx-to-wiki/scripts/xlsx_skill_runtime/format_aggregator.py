"""Data-format-aware aggregation helpers for worksheet compression artifacts."""

from __future__ import annotations

import re
from collections import deque
from typing import Any

from xlsx_skill_runtime.common import (
    cell_reference_to_coordinates,
    coordinates_to_cell_reference,
)


def build_aggregated_sheet_values(
    *,
    sheet_slug: str,
    sheet_name: str,
    regions: list[dict[str, Any]],
    cell_values: dict[tuple[int, int], str],
    cell_metadata: dict[tuple[int, int], dict[str, str]],
    merged_ranges: list[str],
) -> dict[str, Any]:
    merged_map, merged_descriptors = _build_merged_lookup(
        merged_ranges=merged_ranges,
        cell_values=cell_values,
        cell_metadata=cell_metadata,
    )
    aggregated_regions: list[dict[str, Any]] = []
    total_component_count: int = 0
    total_span_count: int = 0
    total_text_object_count: int = 0
    total_merged_object_count: int = 0
    for region in regions:
        meta: dict[str, Any] = dict(region.get("meta", {}))
        bbox: dict[str, int] = _normalize_bbox(meta.get("bbox", {}))
        if len(bbox) == 0:
            continue
        region_payload: dict[str, Any] = _aggregate_region(
            region_id=str(meta.get("region_id", "")),
            title=str(meta.get("title", region.get("region_id", "Region"))),
            region_type=str(meta.get("type", "unknown")),
            bbox=bbox,
            cell_values=cell_values,
            cell_metadata=cell_metadata,
            merged_map=merged_map,
            merged_descriptors=merged_descriptors,
        )
        total_component_count += len(region_payload["aggregated_components"])
        total_span_count += len(region_payload["aggregated_spans"])
        total_text_object_count += len(region_payload["text_objects"])
        total_merged_object_count += len(region_payload["merged_objects"])
        aggregated_regions.append(region_payload)
    return {
        "version": "1",
        "sheet_slug": sheet_slug,
        "sheet_name": sheet_name,
        "region_count": len(aggregated_regions),
        "aggregated_component_count": total_component_count,
        "aggregated_span_count": total_span_count,
        "text_object_count": total_text_object_count,
        "merged_object_count": total_merged_object_count,
        "regions": aggregated_regions,
    }


def _aggregate_region(
    *,
    region_id: str,
    title: str,
    region_type: str,
    bbox: dict[str, int],
    cell_values: dict[tuple[int, int], str],
    cell_metadata: dict[tuple[int, int], dict[str, str]],
    merged_map: dict[tuple[int, int], str],
    merged_descriptors: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    numeric_objects: list[dict[str, Any]] = []
    text_objects: list[dict[str, Any]] = []
    merged_objects: list[dict[str, Any]] = []
    seen_merged_ranges: set[str] = set()

    for row_index in range(int(bbox["start_row"]), int(bbox["end_row"]) + 1):
        for col_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1):
            value: str = cell_values.get((row_index, col_index), "")
            merge_ref: str | None = merged_map.get((row_index, col_index))
            if merge_ref is not None:
                descriptor: dict[str, Any] = merged_descriptors[merge_ref]
                anchor_coords: tuple[int, int] = tuple(descriptor["anchor_coords"])
                if (row_index, col_index) != anchor_coords or merge_ref in seen_merged_ranges:
                    continue
                seen_merged_ranges.add(merge_ref)
                merged_object: dict[str, Any] = _build_merged_object(
                    descriptor=descriptor
                )
                merged_objects.append(_build_public_merged_object(merged_object))
                if bool(merged_object["is_numeric_like"]):
                    numeric_objects.append(merged_object)
                else:
                    text_objects.append(
                        {
                            "range": str(merged_object["range"]),
                            "kind": "merged_text",
                            "text": str(merged_object["value"]),
                            "semantic_type": str(merged_object["semantic_type"]),
                            "cell_count": int(merged_object["cell_count"]),
                        }
                    )
                continue

            if value == "":
                continue
            metadata: dict[str, str] = dict(cell_metadata.get((row_index, col_index), {}))
            cell_object: dict[str, Any] = _build_cell_object(
                row_index=row_index,
                col_index=col_index,
                value=value,
                cell_type=str(metadata.get("cell_type", "")),
                number_format=str(metadata.get("number_format", "General")),
            )
            if bool(cell_object["is_numeric_like"]):
                numeric_objects.append(cell_object)
            else:
                text_objects.append(
                    {
                        "range": str(cell_object["range"]),
                        "kind": "cell_text",
                        "text": str(cell_object["value"]),
                        "semantic_type": str(cell_object["semantic_type"]),
                        "cell_count": 1,
                    }
                )

    aggregated_components: list[dict[str, Any]] = []
    aggregated_spans: list[dict[str, Any]] = []
    for component_index, component_objects in enumerate(
        _group_numeric_objects(numeric_objects), start=1
    ):
        component_payload: dict[str, Any] = _build_component_payload(
            component_index=component_index,
            component_objects=component_objects,
        )
        aggregated_components.append(component_payload)
        aggregated_spans.extend(list(component_payload["spans"]))

    return {
        "region_id": region_id,
        "title": title,
        "type": region_type,
        "bbox": bbox,
        "aggregated_component_count": len(aggregated_components),
        "aggregated_span_count": len(aggregated_spans),
        "text_object_count": len(text_objects),
        "merged_object_count": len(merged_objects),
        "aggregated_components": aggregated_components,
        "aggregated_spans": aggregated_spans,
        "text_objects": text_objects,
        "merged_objects": merged_objects,
    }


def _build_public_merged_object(merged_object: dict[str, Any]) -> dict[str, Any]:
    public_payload: dict[str, Any] = {
        "object_id": str(merged_object["object_id"]),
        "range": str(merged_object["range"]),
        "anchor_cell": str(merged_object["anchor_cell"]),
        "value": str(merged_object["value"]),
        "cell_type": str(merged_object["cell_type"]),
        "number_format": str(merged_object["number_format"]),
        "semantic_type": str(merged_object["semantic_type"]),
        "aggregation_key": str(merged_object["aggregation_key"]),
        "display_label": str(merged_object["display_label"]),
        "signature_source": str(merged_object["signature_source"]),
        "is_numeric_like": bool(merged_object["is_numeric_like"]),
        "is_merged": True,
        "cell_count": int(merged_object["cell_count"]),
    }
    if "bbox" in merged_object:
        public_payload["bbox"] = dict(merged_object["bbox"])
    return public_payload


def _build_component_payload(
    *,
    component_index: int,
    component_objects: list[dict[str, Any]],
) -> dict[str, Any]:
    representative: dict[str, Any] = component_objects[0]
    component_id: str = f"component_{component_index:03d}"
    merged_spans: list[dict[str, Any]] = []
    regular_coordinates: set[tuple[int, int]] = set()
    for obj in component_objects:
        if bool(obj["is_merged"]):
            merged_spans.append(
                {
                    "range": str(obj["range"]),
                    "is_merged": True,
                    "source_object_id": str(obj["object_id"]),
                    "cell_count": int(obj["cell_count"]),
                }
            )
            continue
        regular_coordinates.update(set(obj["occupied_cells"]))
    regular_spans: list[dict[str, Any]] = []
    layout_strategy: str = _choose_span_layout_strategy(
        regular_coordinates=regular_coordinates
    )
    for cell_range in _rectangularize_coordinates(
        regular_coordinates,
        strategy=layout_strategy,
    ):
        regular_spans.append(
            {
                "range": cell_range,
                "is_merged": False,
                "source_object_id": None,
                "cell_count": _range_cell_count(cell_range),
            }
        )
    spans: list[dict[str, Any]] = merged_spans + regular_spans
    return {
        "component_id": component_id,
        "aggregation_key": str(representative["aggregation_key"]),
        "signature_source": str(representative["signature_source"]),
        "label": str(representative["display_label"]),
        "semantic_type": str(representative["semantic_type"]),
        "number_format": str(representative["number_format"]),
        "layout_strategy": layout_strategy,
        "object_count": len(component_objects),
        "cell_count": sum(int(obj["cell_count"]) for obj in component_objects),
        "merged_object_count": sum(1 for obj in component_objects if bool(obj["is_merged"])),
        "spans": spans,
        "object_ids": [str(obj["object_id"]) for obj in component_objects],
    }


def _group_numeric_objects(
    numeric_objects: list[dict[str, Any]],
) -> list[list[dict[str, Any]]]:
    if len(numeric_objects) == 0:
        return []
    objects_by_id: dict[str, dict[str, Any]] = {
        str(obj["object_id"]): obj for obj in numeric_objects
    }
    coord_owner: dict[tuple[int, int], str] = {}
    adjacency: dict[str, set[str]] = {
        str(obj["object_id"]): set() for obj in numeric_objects
    }
    for obj in numeric_objects:
        object_id: str = str(obj["object_id"])
        for coordinates in set(obj["occupied_cells"]):
            coord_owner[coordinates] = object_id
    for obj in numeric_objects:
        object_id = str(obj["object_id"])
        object_key: str = str(obj["aggregation_key"])
        for row_index, col_index in set(obj["occupied_cells"]):
            for neighbor in [
                (row_index - 1, col_index),
                (row_index + 1, col_index),
                (row_index, col_index - 1),
                (row_index, col_index + 1),
            ]:
                neighbor_owner: str | None = coord_owner.get(neighbor)
                if neighbor_owner is None or neighbor_owner == object_id:
                    continue
                if str(objects_by_id[neighbor_owner]["aggregation_key"]) != object_key:
                    continue
                adjacency[object_id].add(neighbor_owner)
                adjacency[neighbor_owner].add(object_id)
    components: list[list[dict[str, Any]]] = []
    visited: set[str] = set()
    for object_id in sorted(objects_by_id.keys()):
        if object_id in visited:
            continue
        queue: deque[str] = deque([object_id])
        component_ids: list[str] = []
        visited.add(object_id)
        while len(queue) > 0:
            current_id: str = queue.popleft()
            component_ids.append(current_id)
            for neighbor_id in sorted(adjacency[current_id]):
                if neighbor_id in visited:
                    continue
                visited.add(neighbor_id)
                queue.append(neighbor_id)
        components.append([objects_by_id[current_id] for current_id in component_ids])
    return components


def _build_cell_object(
    *,
    row_index: int,
    col_index: int,
    value: str,
    cell_type: str,
    number_format: str,
) -> dict[str, Any]:
    signature: dict[str, Any] = _build_signature(
        value=value,
        number_format=number_format,
        cell_type=cell_type,
    )
    cell_ref: str = coordinates_to_cell_reference(row_index, col_index)
    return {
        "object_id": f"cell:{cell_ref}",
        "range": cell_ref,
        "value": value,
        "cell_type": cell_type,
        "number_format": signature["number_format"],
        "semantic_type": signature["semantic_type"],
        "aggregation_key": signature["aggregation_key"],
        "display_label": signature["display_label"],
        "signature_source": signature["signature_source"],
        "is_numeric_like": signature["is_numeric_like"],
        "is_merged": False,
        "cell_count": 1,
        "occupied_cells": {(row_index, col_index)},
    }


def _build_merged_object(*, descriptor: dict[str, Any]) -> dict[str, Any]:
    signature: dict[str, Any] = _build_signature(
        value=str(descriptor.get("value", "")),
        number_format=str(descriptor.get("number_format", "General")),
        cell_type=str(descriptor.get("cell_type", "")),
    )
    bbox: dict[str, int] = dict(descriptor["bbox"])
    occupied_cells: set[tuple[int, int]] = {
        (row_index, col_index)
        for row_index in range(int(bbox["start_row"]), int(bbox["end_row"]) + 1)
        for col_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1)
    }
    return {
        "object_id": f"merge:{descriptor['range']}",
        "range": str(descriptor["range"]),
        "bbox": bbox,
        "anchor_cell": coordinates_to_cell_reference(
            int(descriptor["anchor_coords"][0]),
            int(descriptor["anchor_coords"][1]),
        ),
        "value": str(descriptor.get("value", "")),
        "cell_type": str(descriptor.get("cell_type", "")),
        "number_format": signature["number_format"],
        "semantic_type": signature["semantic_type"],
        "aggregation_key": signature["aggregation_key"],
        "display_label": signature["display_label"],
        "signature_source": signature["signature_source"],
        "is_numeric_like": signature["is_numeric_like"],
        "is_merged": True,
        "cell_count": len(occupied_cells),
        "occupied_cells": occupied_cells,
    }


def _build_signature(
    *,
    value: str,
    number_format: str,
    cell_type: str,
) -> dict[str, Any]:
    normalized_nfs: str = str(number_format or "General").strip() or "General"
    semantic_type: str = _infer_semantic_type(
        value=value,
        number_format=normalized_nfs,
        cell_type=cell_type,
    )
    use_nfs: bool = _should_use_number_format(
        number_format=normalized_nfs,
        semantic_type=semantic_type,
    )
    return {
        "aggregation_key": f"NFS:{normalized_nfs}" if use_nfs else f"TYPE:{semantic_type}",
        "display_label": normalized_nfs if use_nfs else semantic_type,
        "semantic_type": semantic_type,
        "number_format": normalized_nfs,
        "signature_source": "number_format" if use_nfs else "semantic_type",
        "is_numeric_like": semantic_type
        in {
            "Year",
            "Integer",
            "Float",
            "Percentage",
            "Scientific",
            "Date",
            "Time",
            "Currency",
        },
    }


def _infer_semantic_type(
    *,
    value: str,
    number_format: str,
    cell_type: str,
) -> str:
    normalized_format: str = _normalize_number_format_text(number_format)
    stripped: str = str(value).strip()
    if cell_type in {"inline_string", "shared_string", "formula_string"}:
        if _looks_like_email(stripped):
            return "Email"
        if _looks_like_date_text(stripped):
            return "Date"
        if _looks_like_time_text(stripped):
            return "Time"
        if re.fullmatch(r"\d{4}", stripped) is not None:
            return "Year"
        if re.fullmatch(r"-?\d+(?:\.\d+)?%", stripped) is not None:
            return "Percentage"
        if re.fullmatch(r"[-+]?(?:\d+(?:\.\d+)?)[Ee][-+]?\d+", stripped) is not None:
            return "Scientific"
        if _looks_like_currency_text(stripped):
            return "Currency"
        if re.fullmatch(r"-?\d+", stripped) is not None:
            return "Integer"
        if re.fullmatch(r"-?\d+\.\d+", stripped) is not None:
            return "Float"
        return "Text"
    if _looks_like_year_format(normalized_format):
        return "Year"
    if _looks_like_time_format(normalized_format):
        return "Time"
    if _looks_like_date_format(normalized_format):
        return "Date"
    if "%" in normalized_format:
        return "Percentage"
    if "e+" in normalized_format or "e-" in normalized_format:
        return "Scientific"
    if any(
        token in normalized_format
        for token in ["$", "[$", "usd", "cny", "eur", "gbp"]
    ):
        return "Currency"
    if _looks_like_email(stripped):
        return "Email"
    if re.fullmatch(r"\d{4}", stripped) is not None:
        return "Year"
    if re.fullmatch(r"-?\d+(?:\.\d+)?%", stripped) is not None:
        return "Percentage"
    if re.fullmatch(r"[-+]?(?:\d+(?:\.\d+)?)[Ee][-+]?\d+", stripped) is not None:
        return "Scientific"
    if _looks_like_currency_text(stripped):
        return "Currency"
    if _looks_like_date_text(stripped):
        return "Date"
    if _looks_like_time_text(stripped):
        return "Time"
    if re.fullmatch(r"-?\d+", stripped) is not None:
        return "Integer"
    if re.fullmatch(r"-?\d+\.\d+", stripped) is not None:
        return "Float"
    try:
        float(stripped)
    except ValueError:
        return "Other"
    if "." in stripped:
        return "Float"
    return "Integer"


def _should_use_number_format(*, number_format: str, semantic_type: str) -> bool:
    normalized: str = _normalize_number_format_text(number_format)
    if normalized in {"", "general", "@"}:
        return False
    return semantic_type in {
        "Year",
        "Integer",
        "Float",
        "Percentage",
        "Scientific",
        "Date",
        "Time",
        "Currency",
    }


def _rectangularize_coordinates(
    coordinates: set[tuple[int, int]],
    *,
    strategy: str = "rectangle",
) -> list[str]:
    if len(coordinates) == 0:
        return []
    if strategy == "column_first":
        column_spans: list[str] = _build_column_priority_spans(coordinates)
        if len(column_spans) > 0:
            return column_spans
    references: list[str] = [
        coordinates_to_cell_reference(row_index, col_index)
        for row_index, col_index in sorted(coordinates)
    ]
    return _combine_cells(references)


def _choose_span_layout_strategy(
    *,
    regular_coordinates: set[tuple[int, int]],
) -> str:
    if len(regular_coordinates) <= 1:
        return "rectangle"
    rows: list[int] = sorted({row_index for row_index, _ in regular_coordinates})
    cols: list[int] = sorted({col_index for _, col_index in regular_coordinates})
    height: int = rows[-1] - rows[0] + 1
    width: int = cols[-1] - cols[0] + 1
    density: float = len(regular_coordinates) / max(height * width, 1)
    if height >= max(3, width * 2) and density <= 0.85:
        return "column_first"
    return "rectangle"


def _build_column_priority_spans(
    coordinates: set[tuple[int, int]],
) -> list[str]:
    rows_by_col: dict[int, list[int]] = {}
    for row_index, col_index in sorted(coordinates):
        rows_by_col.setdefault(col_index, []).append(row_index)
    if len(rows_by_col) == 0:
        return []
    ranges_by_col: dict[int, list[tuple[int, int]]] = {}
    for col_index, row_indexes in rows_by_col.items():
        ranges_by_col[col_index] = _collapse_sorted_indexes(row_indexes)
    spans: list[str] = []
    consumed: set[tuple[int, int]] = set()
    sorted_columns: list[int] = sorted(ranges_by_col.keys())
    for col_index in sorted_columns:
        for row_start, row_end in ranges_by_col[col_index]:
            if (col_index, row_start, row_end) in consumed:
                continue
            end_col: int = col_index
            while True:
                next_col: int = end_col + 1
                next_ranges: list[tuple[int, int]] | None = ranges_by_col.get(next_col)
                if next_ranges is None or (row_start, row_end) not in next_ranges:
                    break
                end_col = next_col
            for mark_col in range(col_index, end_col + 1):
                consumed.add((mark_col, row_start, row_end))
            spans.append(
                _coordinates_span_to_range(
                    start_row=row_start,
                    end_row=row_end,
                    start_col=col_index,
                    end_col=end_col,
                )
            )
    return spans


def _combine_cells(cells: list[str]) -> list[str]:
    coordinates: list[tuple[int, int, str]] = []
    for cell_reference in cells:
        row_index, column_index = cell_reference_to_coordinates(cell_reference)
        coordinates.append((row_index, column_index, cell_reference))
    if len(coordinates) <= 1:
        return [item[2] for item in coordinates] or list(cells)
    coordinates.sort(key=lambda item: (item[0], item[1]))
    coord_map: dict[tuple[int, int], int] = {
        (row_index, column_index): position
        for position, (row_index, column_index, _cell) in enumerate(coordinates)
    }
    used: set[int] = set()
    combined: list[str] = []
    for index, (row_index, column_index, cell_reference) in enumerate(coordinates):
        if index in used:
            continue
        best_rect: tuple[int, int, int, int, list[int]] | None = None
        max_col: int = column_index
        while (
            (row_index, max_col + 1) in coord_map
            and coord_map[(row_index, max_col + 1)] not in used
        ):
            max_col += 1
        for width in range(max_col - column_index + 1, 0, -1):
            test_end_col: int = column_index + width - 1
            test_end_row: int = row_index
            while True:
                next_row: int = test_end_row + 1
                valid: bool = True
                for test_col in range(column_index, test_end_col + 1):
                    coord_index: int | None = coord_map.get((next_row, test_col))
                    if coord_index is None or coord_index in used:
                        valid = False
                        break
                if not valid:
                    break
                test_end_row = next_row
            rect_indices: list[int] = []
            for rect_row in range(row_index, test_end_row + 1):
                for rect_col in range(column_index, test_end_col + 1):
                    rect_indices.append(coord_map[(rect_row, rect_col)])
            if best_rect is None or len(rect_indices) > len(best_rect[4]):
                best_rect = (
                    row_index,
                    column_index,
                    test_end_row,
                    test_end_col,
                    rect_indices,
                )
        if best_rect is None or len(best_rect[4]) <= 1:
            combined.append(cell_reference)
            used.add(index)
            continue
        start_ref: str = coordinates_to_cell_reference(best_rect[0], best_rect[1])
        end_ref: str = coordinates_to_cell_reference(best_rect[2], best_rect[3])
        combined.append(start_ref if start_ref == end_ref else f"{start_ref}:{end_ref}")
        used.update(best_rect[4])
    return combined


def _build_merged_lookup(
    *,
    merged_ranges: list[str],
    cell_values: dict[tuple[int, int], str],
    cell_metadata: dict[tuple[int, int], dict[str, str]],
) -> tuple[dict[tuple[int, int], str], dict[str, dict[str, Any]]]:
    merged_map: dict[tuple[int, int], str] = {}
    descriptors: dict[str, dict[str, Any]] = {}
    for merge_ref in merged_ranges:
        bbox: dict[str, int] = _normalize_bbox(_range_to_bbox(merge_ref))
        if len(bbox) == 0:
            continue
        anchor_coords: tuple[int, int] = (bbox["start_row"], bbox["start_col"])
        metadata: dict[str, str] = dict(cell_metadata.get(anchor_coords, {}))
        descriptors[merge_ref] = {
            "range": merge_ref,
            "bbox": bbox,
            "anchor_coords": anchor_coords,
            "value": cell_values.get(anchor_coords, ""),
            "cell_type": str(metadata.get("cell_type", "")),
            "number_format": str(metadata.get("number_format", "General")),
        }
        for row_index in range(bbox["start_row"], bbox["end_row"] + 1):
            for col_index in range(bbox["start_col"], bbox["end_col"] + 1):
                merged_map[(row_index, col_index)] = merge_ref
    return merged_map, descriptors


def _range_to_bbox(range_ref: str) -> dict[str, int]:
    normalized_ref: str = str(range_ref).strip()
    if normalized_ref == "":
        return {}
    if ":" in normalized_ref:
        start_ref, end_ref = normalized_ref.split(":", maxsplit=1)
    else:
        start_ref = normalized_ref
        end_ref = normalized_ref
    start_row, start_col = cell_reference_to_coordinates(start_ref)
    end_row, end_col = cell_reference_to_coordinates(end_ref)
    return {
        "start_row": min(start_row, end_row),
        "end_row": max(start_row, end_row),
        "start_col": min(start_col, end_col),
        "end_col": max(start_col, end_col),
    }


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


def _range_cell_count(range_ref: str) -> int:
    bbox: dict[str, int] = _range_to_bbox(range_ref)
    if len(bbox) == 0:
        return 0
    return (bbox["end_row"] - bbox["start_row"] + 1) * (
        bbox["end_col"] - bbox["start_col"] + 1
    )


def _looks_like_year_format(normalized_format: str) -> bool:
    return any(token in normalized_format for token in ["yyyy", "yy", "年"]) and not any(
        token in normalized_format for token in ["d", "h", "s", ":"]
    )


def _looks_like_time_format(normalized_format: str) -> bool:
    return any(token in normalized_format for token in ["h", "ss", "am/pm", "上午/下午", ":"]) and "y" not in normalized_format


def _looks_like_date_format(normalized_format: str) -> bool:
    if normalized_format in {"general", "@"}:
        return False
    return any(token in normalized_format for token in ["y", "年"]) or (
        any(token in normalized_format for token in ["d", "日"]) and any(token in normalized_format for token in ["m", "月"])
    )


def _looks_like_email(value: str) -> bool:
    return re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) is not None


def _looks_like_currency_text(value: str) -> bool:
    return (
        re.fullmatch(r"[-+]?\$\s?\d[\d,]*(?:\.\d+)?", value) is not None
        or re.fullmatch(r"[-+]?(?:usd|cny|rmb|eur|gbp)\s?\d[\d,]*(?:\.\d+)?", value.lower()) is not None
        or re.fullmatch(r"[-+]?\d[\d,]*(?:\.\d+)?\s?(?:元|万元|人民币)", value) is not None
    )


def _looks_like_date_text(value: str) -> bool:
    return (
        re.fullmatch(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", value) is not None
        or re.fullmatch(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", value) is not None
        or re.fullmatch(r"\d{4}年\d{1,2}月(?:\d{1,2}日)?", value) is not None
        or re.fullmatch(r"\d{1,2}月\d{1,2}日", value) is not None
    )


def _looks_like_time_text(value: str) -> bool:
    return (
        re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", value) is not None
        or re.fullmatch(r"(?:上午|下午)?\d{1,2}:\d{2}(?::\d{2})?", value) is not None
    )


def _normalize_number_format_text(number_format: str) -> str:
    normalized: str = str(number_format or "").strip().lower()
    normalized = normalized.replace("\\", "")
    normalized = normalized.replace('"', "")
    normalized = re.sub(r"\[\$-[^\]]+\]", "", normalized)
    normalized = re.sub(r"\[[^\]]+\]", "", normalized)
    normalized = normalized.replace("_", "")
    normalized = normalized.replace("*", "")
    normalized = normalized.replace("上午/下午", "am/pm")
    return normalized


def _collapse_sorted_indexes(indexes: list[int]) -> list[tuple[int, int]]:
    if len(indexes) == 0:
        return []
    ordered: list[int] = sorted(set(indexes))
    ranges: list[tuple[int, int]] = []
    start: int = ordered[0]
    previous: int = ordered[0]
    for value in ordered[1:]:
        if value != previous + 1:
            ranges.append((start, previous))
            start = value
        previous = value
    ranges.append((start, previous))
    return ranges


def _coordinates_span_to_range(
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