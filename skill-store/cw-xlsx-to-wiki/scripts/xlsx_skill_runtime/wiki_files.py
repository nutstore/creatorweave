"""File helpers for YAML, TSV, JSON, Markdown, and text bundle artifacts."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import yaml
from xlsx_skill_runtime.common import cell_reference_to_coordinates

TSV_DELIMITER: str = "\t"
BUNDLE_REGION_START_PREFIX: str = "<<< REGION "
BUNDLE_REGION_START_SUFFIX: str = " START >>>"
BUNDLE_REGION_END_SUFFIX: str = " END >>>"


def write_yaml_file(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open(mode="w", encoding="utf-8") as handle:
        yaml.safe_dump(
            data=payload,
            stream=handle,
            allow_unicode=True,
            sort_keys=False,
        )


def read_yaml_file(path: Path) -> dict[str, Any]:
    content: Any = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(content, dict):
        raise ValueError(f"YAML file must contain a mapping: {path}")
    return content


def write_json_file(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open(mode="w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def read_json_file(path: Path) -> dict[str, Any]:
    content: Any = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(content, dict):
        raise ValueError(f"JSON file must contain an object: {path}")
    return content


def append_json_line(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open(mode="a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def write_tsv_file(path: Path, header: list[str], rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open(mode="w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=TSV_DELIMITER)
        writer.writerow(header)
        writer.writerows(rows)


def read_tsv_file(path: Path) -> tuple[list[str], list[list[str]]]:
    with path.open(mode="r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=TSV_DELIMITER)
        data: list[list[str]] = list(reader)
    if not data:
        return [], []
    return data[0], data[1:]


def read_tsv_header_and_row_count(path: Path) -> tuple[list[str], int]:
    with path.open(mode="r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=TSV_DELIMITER)
        try:
            header: list[str] = next(reader)
        except StopIteration:
            return [], 0
        row_count: int = 0
        for _row in reader:
            row_count += 1
    return header, row_count


def write_region_data_bundle(
    path: Path,
    sections: list[dict[str, Any]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open(mode="w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=TSV_DELIMITER)
        for index, section in enumerate(sections):
            region_id: str = str(section["section"]).strip()
            header: list[str] = [str(value) for value in section.get("header", [])]
            writer.writerow([f"{BUNDLE_REGION_START_PREFIX}{region_id}{BUNDLE_REGION_START_SUFFIX}"])
            writer.writerow(["format: tsv"])
            writer.writerow([f"header: {header[0] if header else ''}", *header[1:]])
            writer.writerows(
                [[str(value) for value in row] for row in section.get("rows", [])]
            )
            writer.writerow([f"{BUNDLE_REGION_START_PREFIX}{region_id}{BUNDLE_REGION_END_SUFFIX}"])
            if index != len(sections) - 1:
                writer.writerow([])


def read_region_data_bundle_section(
    path: Path,
    section: str,
) -> tuple[list[str], list[list[str]]]:
    section_name: str = str(section).strip()
    if section_name == "":
        return [], []
    start_marker: str = f"{BUNDLE_REGION_START_PREFIX}{section_name}{BUNDLE_REGION_START_SUFFIX}"
    end_marker: str = f"{BUNDLE_REGION_START_PREFIX}{section_name}{BUNDLE_REGION_END_SUFFIX}"
    inside: bool = False
    format_seen: bool = False
    header: list[str] | None = None
    rows: list[list[str]] = []
    with path.open(mode="r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=TSV_DELIMITER)
        for row in reader:
            if not inside:
                if row == [start_marker]:
                    inside = True
                continue
            if row == [end_marker]:
                break
            if not format_seen:
                if row != ["format: tsv"]:
                    raise ValueError(f"Unsupported region bundle section format in {path}: {section_name}")
                format_seen = True
                continue
            if header is None:
                if len(row) == 0 or not row[0].startswith("header: "):
                    raise ValueError(f"Missing header line in region bundle section {section_name}: {path}")
                header = [row[0][len("header: ") :], *row[1:]]
                continue
            rows.append(row)
    if not format_seen or header is None:
        return [], []
    return header, rows


def write_markdown_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_chunked_cell_mapping(
    directory: Path,
    payload_key: str,
    cell_mapping: dict[str, Any],
    *,
    rows_per_chunk: int,
) -> list[dict[str, Any]]:
    chunks_by_row_block: dict[int, dict[str, Any]] = {}
    for cell_reference in sorted(cell_mapping.keys(), key=_cell_reference_sort_key):
        row_index, _column_index = cell_reference_to_coordinates(cell_reference=str(cell_reference))
        chunk_id: int = (row_index - 1) // rows_per_chunk
        chunks_by_row_block.setdefault(chunk_id, {})[str(cell_reference)] = cell_mapping[cell_reference]
    index_entries: list[dict[str, Any]] = []
    for chunk_id in sorted(chunks_by_row_block.keys()):
        chunk_cells: dict[str, Any] = chunks_by_row_block[chunk_id]
        row_start: int = (chunk_id * rows_per_chunk) + 1
        row_end: int = row_start + rows_per_chunk - 1
        file_name: str = f"rows_{row_start:04d}_{row_end:04d}.yaml"
        write_yaml_file(path=directory / file_name, payload={"version": "1", payload_key: chunk_cells})
        index_entries.append(
            {
                "file": file_name,
                "row_start": row_start,
                "row_end": row_end,
                "count": len(chunk_cells),
            }
        )
    return index_entries


def read_chunked_cell_mapping(directory: Path, payload_key: str, inline_mapping: dict[str, Any], index_entries: list[dict[str, Any]]) -> dict[str, Any]:
    combined_mapping: dict[str, Any] = {str(key): value for key, value in inline_mapping.items()}
    for entry in index_entries:
        chunk_payload: dict[str, Any] = read_yaml_file(path=directory / str(entry["file"]))
        for cell_reference, value in dict(chunk_payload.get(payload_key, {})).items():
            combined_mapping[str(cell_reference)] = value
    return combined_mapping


def write_chunked_records(
    directory: Path,
    payload_key: str,
    records: list[dict[str, Any]],
    *,
    rows_per_chunk: int,
) -> list[dict[str, Any]]:
    chunks_by_row_block: dict[int, list[dict[str, Any]]] = {}
    for record in records:
        row_index, _column_index = cell_reference_to_coordinates(cell_reference=str(record["cell"]))
        chunk_id: int = (row_index - 1) // rows_per_chunk
        chunks_by_row_block.setdefault(chunk_id, []).append(record)
    index_entries: list[dict[str, Any]] = []
    for chunk_id in sorted(chunks_by_row_block.keys()):
        chunk_records: list[dict[str, Any]] = chunks_by_row_block[chunk_id]
        row_start: int = (chunk_id * rows_per_chunk) + 1
        row_end: int = row_start + rows_per_chunk - 1
        file_name: str = f"rows_{row_start:04d}_{row_end:04d}.yaml"
        write_yaml_file(path=directory / file_name, payload={"version": "1", payload_key: chunk_records})
        index_entries.append(
            {
                "file": file_name,
                "row_start": row_start,
                "row_end": row_end,
                "count": len(chunk_records),
            }
        )
    return index_entries


def read_chunked_records(directory: Path, payload_key: str, inline_records: list[dict[str, Any]], index_entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    combined_records: list[dict[str, Any]] = [dict(item) for item in inline_records]
    for entry in index_entries:
        chunk_payload: dict[str, Any] = read_yaml_file(path=directory / str(entry["file"]))
        for record in list(chunk_payload.get(payload_key, [])):
            combined_records.append(dict(record))
    return combined_records


def _cell_reference_sort_key(cell_reference: str) -> tuple[int, int]:
    row_index, column_index = cell_reference_to_coordinates(cell_reference=str(cell_reference))
    return row_index, column_index
