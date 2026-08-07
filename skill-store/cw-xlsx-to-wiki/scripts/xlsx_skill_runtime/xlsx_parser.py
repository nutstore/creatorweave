"""Read XLSX OOXML packages into wiki-ready structures."""

from __future__ import annotations

import shutil
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from xlsx_skill_runtime.common import (
    cell_reference_to_coordinates,
    column_letter_to_index,
    column_index_to_letter,
    coordinates_to_cell_reference,
    current_timestamp,
    ensure_directory,
    slugify_sheet_name,
)
from xlsx_skill_runtime.errors import WorkbookImportError
from xlsx_skill_runtime.format_aggregator import build_aggregated_sheet_values
from xlsx_skill_runtime.region_artifacts import build_region_bundle, load_primary_tabular_data
from xlsx_skill_runtime.structural_compressor import (
    DEFAULT_ANCHOR_PRUNE_K,
    build_compressed_layout,
)
from xlsx_skill_runtime.wiki_files import (
    append_json_line,
    read_yaml_file,
    write_markdown_file,
    write_region_data_bundle,
    write_yaml_file,
)
from xlsx_skill_runtime.workspace import WorkspacePaths

NAMESPACES: dict[str, str] = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg_rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

ROWS_PER_CHUNK: int = 5000
MIN_INFERRED_TABULAR_ROWS: int = 1000
MIN_INFERRED_SAMPLE_ROWS: int = 3
MAX_INFERRED_TABULAR_COLUMNS: int = 64
WORKBOOK_OVERVIEW_MD: str = "overview.md"
SHEET_STRUCTURE_YAML: str = "structure.yaml"
SHEET_DATA_PREVIEW_MD: str = "data-preview.md"
SHEET_FORMULAS_YAML: str = "formulas.yaml"
SHEET_VALIDATIONS_YAML: str = "data-validations.yaml"
SHEET_STYLES_YAML: str = "styles.yaml"
SHEET_COMPRESSED_LAYOUT_YAML: str = "compressed_layout.yaml"
SHEET_AGGREGATED_VALUES_YAML: str = "aggregated_values.yaml"
SHEET_OBSERVABILITY_REPORT_YAML: str = "observability_report.yaml"
SHEET_OBSERVABILITY_REPORT_MD: str = "observability_report.md"
SHEET_OVERVIEW_MD: str = "overview.md"


@dataclass(frozen=True)
class ParsedSheet:
    slug: str
    name: str
    position: int
    header: list[str]
    data_row_count: int
    preview_rows: list[list[str]]
    formula_count: int
    validations: list[dict[str, Any]]
    tables: list[dict[str, Any]]
    style_count: int
    static_cell_count: int
    static_cells_sample: dict[str, str]
    structure: dict[str, Any]
    formula_index: list[dict[str, Any]]
    style_index: list[dict[str, Any]]
    styles_payload: dict[str, Any]
    cell_values: dict[tuple[int, int], str]
    cell_metadata: dict[tuple[int, int], dict[str, str]]


@dataclass(frozen=True)
class RowAttributeRun:
    row_start: int
    row_end: int
    attrs: dict[str, str]


@dataclass(frozen=True)
class ParsedCellPayload:
    value: str
    cell_type: str
    formula_text: str | None
    formula_attributes: dict[str, str]


class _ChunkedCellMappingWriter:
    def __init__(self, directory: Path, payload_key: str, rows_per_chunk: int) -> None:
        self._directory = directory
        self._payload_key = payload_key
        self._rows_per_chunk = rows_per_chunk
        self._current_chunk_id: int | None = None
        self._current_cells: dict[str, Any] = {}
        self._index_entries: list[dict[str, Any]] = []
        self.count: int = 0

    @property
    def index_entries(self) -> list[dict[str, Any]]:
        return list(self._index_entries)

    def add(self, cell_reference: str, value: Any) -> None:
        row_index, _column_index = cell_reference_to_coordinates(
            cell_reference=cell_reference
        )
        chunk_id: int = (row_index - 1) // self._rows_per_chunk
        if self._current_chunk_id is None:
            self._current_chunk_id = chunk_id
        if chunk_id < self._current_chunk_id:
            raise ValueError(
                "Chunked cell mapping rows must be written in ascending row order."
            )
        if chunk_id != self._current_chunk_id:
            self._flush()
            self._current_chunk_id = chunk_id
        self._current_cells[str(cell_reference)] = value
        self.count += 1

    def finalize(self) -> list[dict[str, Any]]:
        self._flush()
        return self.index_entries

    def _flush(self) -> None:
        if self._current_chunk_id is None or len(self._current_cells) == 0:
            return
        row_start: int = (self._current_chunk_id * self._rows_per_chunk) + 1
        row_end: int = row_start + self._rows_per_chunk - 1
        file_name: str = f"rows_{row_start:04d}_{row_end:04d}.yaml"
        write_yaml_file(
            path=self._directory / file_name,
            payload={"version": "1", self._payload_key: self._current_cells},
        )
        self._index_entries.append(
            {
                "file": file_name,
                "row_start": row_start,
                "row_end": row_end,
                "count": len(self._current_cells),
            }
        )
        self._current_cells = {}


class _ChunkedRecordWriter:
    def __init__(self, directory: Path, payload_key: str, rows_per_chunk: int) -> None:
        self._directory = directory
        self._payload_key = payload_key
        self._rows_per_chunk = rows_per_chunk
        self._current_chunk_id: int | None = None
        self._current_records: list[dict[str, Any]] = []
        self._index_entries: list[dict[str, Any]] = []
        self.count: int = 0

    @property
    def index_entries(self) -> list[dict[str, Any]]:
        return list(self._index_entries)

    def add(self, record: dict[str, Any]) -> None:
        row_index, _column_index = cell_reference_to_coordinates(
            cell_reference=str(record["cell"])
        )
        chunk_id: int = (row_index - 1) // self._rows_per_chunk
        if self._current_chunk_id is None:
            self._current_chunk_id = chunk_id
        if chunk_id < self._current_chunk_id:
            raise ValueError(
                "Chunked record rows must be written in ascending row order."
            )
        if chunk_id != self._current_chunk_id:
            self._flush()
            self._current_chunk_id = chunk_id
        self._current_records.append(record)
        self.count += 1

    def finalize(self) -> list[dict[str, Any]]:
        self._flush()
        return self.index_entries

    def _flush(self) -> None:
        if self._current_chunk_id is None or len(self._current_records) == 0:
            return
        row_start: int = (self._current_chunk_id * self._rows_per_chunk) + 1
        row_end: int = row_start + self._rows_per_chunk - 1
        file_name: str = f"rows_{row_start:04d}_{row_end:04d}.yaml"
        write_yaml_file(
            path=self._directory / file_name,
            payload={"version": "1", self._payload_key: self._current_records},
        )
        self._index_entries.append(
            {
                "file": file_name,
                "row_start": row_start,
                "row_end": row_end,
                "count": len(self._current_records),
            }
        )
        self._current_records = []


class _ChunkedRowRecordWriter:
    def __init__(self, directory: Path, payload_key: str, rows_per_chunk: int) -> None:
        self._directory = directory
        self._payload_key = payload_key
        self._rows_per_chunk = rows_per_chunk
        self._current_chunk_id: int | None = None
        self._current_records: list[dict[str, Any]] = []
        self._index_entries: list[dict[str, Any]] = []
        self.count: int = 0

    @property
    def index_entries(self) -> list[dict[str, Any]]:
        return list(self._index_entries)

    def add(self, record: dict[str, Any]) -> None:
        row_index: int = int(record["row"])
        chunk_id: int = (row_index - 1) // self._rows_per_chunk
        if self._current_chunk_id is None:
            self._current_chunk_id = chunk_id
        if chunk_id < self._current_chunk_id:
            raise ValueError(
                "Chunked row records must be written in ascending row order."
            )
        if chunk_id != self._current_chunk_id:
            self._flush()
            self._current_chunk_id = chunk_id
        self._current_records.append(record)
        self.count += 1

    def finalize(self) -> list[dict[str, Any]]:
        self._flush()
        return self.index_entries

    def _flush(self) -> None:
        if self._current_chunk_id is None or len(self._current_records) == 0:
            return
        row_start: int = (self._current_chunk_id * self._rows_per_chunk) + 1
        row_end: int = row_start + self._rows_per_chunk - 1
        file_name: str = f"rows_{row_start:04d}_{row_end:04d}.yaml"
        write_yaml_file(
            path=self._directory / file_name,
            payload={"version": "1", self._payload_key: self._current_records},
        )
        self._index_entries.append(
            {
                "file": file_name,
                "row_start": row_start,
                "row_end": row_end,
                "count": len(self._current_records),
            }
        )
        self._current_records = []


@dataclass(frozen=True)
class WorkbookRelationship:
    relationship_id: str
    target: str
    kind: str


@dataclass(frozen=True)
class ContentTypesMap:
    defaults: dict[str, str]
    overrides: dict[str, str]


class XlsxParser:
    """Import one workbook into the wiki workspace."""

    def __init__(
        self,
        preview_rows: int,
        import_mode: str = "full",
        anchor_prune_k: int = DEFAULT_ANCHOR_PRUNE_K,
    ) -> None:
        self._preview_rows = preview_rows
        self._import_mode = str(import_mode).strip().lower()
        self._anchor_prune_k = max(int(anchor_prune_k), 0)
        self._perf_log_path: Path | None = None

    def import_workbook(
        self,
        source_path: Path,
        workspace: WorkspacePaths,
        job_id: str,
        display_name: str,
    ) -> dict[str, Any]:
        # [ACCEPTANCE]: Successful import creates the minimum workspace files.
        # [PLANS]: Implement workspace creation and import tool.
        self._perf_log_path = workspace.logs_dir / "actions.jsonl"
        import_started_at: float = time.perf_counter()
        self._log_perf_event(
            "import_started", source_path=str(source_path), job_id=job_id
        )

        stage_started_at: float = time.perf_counter()
        self._extract_ooxml(
            source_path=source_path, extracted_dir=workspace.extracted_dir
        )
        self._log_perf_event(
            "extract_ooxml_completed",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            extracted_dir=str(workspace.extracted_dir),
        )
        workbook_xml_path: Path = workspace.extracted_dir / "xl" / "workbook.xml"
        workbook_rels_path: Path = (
            workspace.extracted_dir / "xl" / "_rels" / "workbook.xml.rels"
        )
        stage_started_at = time.perf_counter()
        workbook_root: ET.Element = self._parse_xml_part(
            workbook_xml_path,
            missing_error_code="MISSING_WORKBOOK_XML",
            missing_message="Missing required OOXML part: xl/workbook.xml",
        )
        self._log_perf_event(
            "workbook_xml_loaded",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            workbook_xml_path=str(workbook_xml_path),
        )
        stage_started_at = time.perf_counter()
        rel_map: dict[str, WorkbookRelationship] = self._read_relationship_map(
            rels_path=workbook_rels_path
        )
        self._log_perf_event(
            "workbook_relationships_loaded",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            relationship_count=len(rel_map),
        )
        stage_started_at = time.perf_counter()
        content_types_map: ContentTypesMap = self._read_content_types_map(
            extracted_dir=workspace.extracted_dir
        )
        self._log_perf_event(
            "content_types_loaded",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            defaults_count=len(content_types_map.defaults),
            overrides_count=len(content_types_map.overrides),
        )
        stage_started_at = time.perf_counter()
        shared_strings: list[str] = self._read_shared_strings(
            extracted_dir=workspace.extracted_dir
        )
        self._log_perf_event(
            "shared_strings_loaded",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            count=len(shared_strings),
        )
        stage_started_at = time.perf_counter()
        style_map: dict[int, str] = self._read_style_map(
            extracted_dir=workspace.extracted_dir
        )
        self._log_perf_event(
            "style_map_loaded",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            style_count=len(style_map),
        )
        # [ACCEPTANCE]: Successful rebuild preserves imported style IDs and workbook stylesheet data.
        # [PLANS]: Expand the builder to rebuild tables and stylesheet relationships.
        stage_started_at = time.perf_counter()
        self._copy_style_sheet_if_present(
            extracted_dir=workspace.extracted_dir, wiki_dir=workspace.wiki_dir
        )
        self._copy_theme_if_present(
            extracted_dir=workspace.extracted_dir, wiki_dir=workspace.wiki_dir
        )
        self._log_perf_event(
            "copied_workbook_assets",
            elapsed_ms=self._elapsed_ms(stage_started_at),
        )
        sheet_slugs: list[str] = []
        used_sheet_slugs: set[str] = set()
        workbook_sheet_registry: dict[str, Any] = {}
        sheet_slug_by_position: dict[int, str] = {}
        skipped_sheets: list[dict[str, str]] = []
        warnings: list[str] = []
        workbook_part_dir: Path = workbook_xml_path.parent
        for position, sheet_node in enumerate(
            workbook_root.findall("main:sheets/main:sheet", NAMESPACES)
        ):
            sheet_name: str = str(sheet_node.attrib["name"])
            sheet_visibility: str = str(sheet_node.attrib.get("state", "visible"))
            relationship_id: str = str(sheet_node.attrib[f"{{{NAMESPACES['rel']}}}id"])
            relationship: WorkbookRelationship | None = rel_map.get(relationship_id)
            if relationship is None:
                raise WorkbookImportError(
                    "BROKEN_RELATIONSHIP",
                    f"Sheet relationship {relationship_id} was not found in xl/_rels/workbook.xml.rels.",
                )
            if relationship.kind != "worksheet":
                # [ACCEPTANCE]: The UI can list an existing workspace and browse per-sheet files.
                # [PLANS]: Chart rebuild.
                skipped_sheets.append(
                    {
                        "sheet_name": sheet_name,
                        "position": position,
                        "visibility": sheet_visibility,
                        "relationship_id": relationship.relationship_id,
                        "kind": relationship.kind,
                        "target": relationship.target,
                    }
                )
                warnings.append(
                    f"Skipped unsupported sheet '{sheet_name}' of type '{relationship.kind}'."
                )
                continue
            # [ACCEPTANCE]: Successful import creates the minimum workspace files.
            # [PLANS]: Specify xlsx_to_wiki() tool interfaces.
            sheet_path: Path = self._resolve_relationship_target(
                package_root=workspace.extracted_dir,
                source_dir=workbook_part_dir,
                target=relationship.target,
            )
            try:
                sheet_ooxml_target: str = sheet_path.resolve().relative_to(
                    workspace.extracted_dir.resolve()
                ).as_posix()
            except ValueError as error:
                raise WorkbookImportError(
                    "BROKEN_RELATIONSHIP",
                    f"Worksheet relationship {relationship_id} escapes the OOXML package.",
                ) from error
            base_sheet_slug: str = slugify_sheet_name(sheet_name=sheet_name, position=position)
            sheet_slug: str = base_sheet_slug
            suffix: int = 2
            while sheet_slug in used_sheet_slugs:
                sheet_slug = f"{base_sheet_slug}_{suffix}"
                suffix += 1
            used_sheet_slugs.add(sheet_slug)
            sheet_stage_started_at: float = time.perf_counter()
            parsed_sheet: ParsedSheet = self._parse_sheet(
                sheet_path=sheet_path,
                workspace=workspace,
                extracted_dir=workspace.extracted_dir,
                shared_strings=shared_strings,
                style_map=style_map,
                content_types_map=content_types_map,
                sheet_name=sheet_name,
                sheet_slug=sheet_slug,
                position=position,
            )
            parse_elapsed_ms: int = self._elapsed_ms(sheet_stage_started_at)
            sheet_slugs.append(parsed_sheet.slug)
            sheet_slug_by_position[position] = parsed_sheet.slug
            workbook_sheet_registry[parsed_sheet.slug] = {
                "name": parsed_sheet.name,
                "path": f"sheets/{parsed_sheet.slug}",
                "ooxml_target": sheet_ooxml_target,
                "kind": "worksheet",
                "visibility": sheet_visibility,
                "row_count": parsed_sheet.data_row_count + 1,
                "column_count": len(parsed_sheet.header),
                "has_formulas": parsed_sheet.formula_count > 0,
            }
            write_stage_started_at: float = time.perf_counter()
            self._write_sheet_files(workspace=workspace, parsed_sheet=parsed_sheet)
            self._log_perf_event(
                "sheet_import_completed",
                elapsed_ms=parse_elapsed_ms + self._elapsed_ms(write_stage_started_at),
                parse_elapsed_ms=parse_elapsed_ms,
                write_elapsed_ms=self._elapsed_ms(write_stage_started_at),
                sheet_name=sheet_name,
                sheet_slug=parsed_sheet.slug,
                sheet_path=str(sheet_path),
                data_row_count=parsed_sheet.data_row_count,
                header_count=len(parsed_sheet.header),
                formula_count=parsed_sheet.formula_count,
                style_count=parsed_sheet.style_count,
                static_cell_count=parsed_sheet.static_cell_count,
                table_count=len(parsed_sheet.tables),
                validation_count=len(parsed_sheet.validations),
            )
            del parsed_sheet
        stage_started_at = time.perf_counter()
        names_payload: dict[str, Any] = {
            "version": "1",
            "names": self._read_defined_names(
                workbook_root=workbook_root,
                sheet_slug_by_position=sheet_slug_by_position,
            ),
        }
        self._log_perf_event(
            "defined_names_loaded",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            name_count=len(names_payload["names"]),
        )
        workbook_payload: dict[str, Any] = {
            "version": "1",
            "workbook_id": job_id,
            "source_filename": source_path.name,
            "display_name": display_name,
            "import_mode": self._import_mode,
            "created_at": current_timestamp(),
            "updated_at": current_timestamp(),
            "sheet_order": list(sheet_slugs),
            "sheets": workbook_sheet_registry,
            "skipped_sheets": skipped_sheets,
            "build": {"output_filename": "rebuilt.xlsx", "preserve_sheet_order": True},
        }
        stage_started_at = time.perf_counter()
        write_yaml_file(
            path=workspace.wiki_dir / "workbook.yaml", payload=workbook_payload
        )
        write_yaml_file(path=workspace.wiki_dir / "names.yaml", payload=names_payload)
        self._log_perf_event(
            "workbook_artifacts_written",
            elapsed_ms=self._elapsed_ms(stage_started_at),
            sheet_count=len(sheet_slugs),
            skipped_sheet_count=len(skipped_sheets),
        )
        self._log_perf_event(
            "import_completed",
            elapsed_ms=self._elapsed_ms(import_started_at),
            sheet_count=len(sheet_slugs),
            skipped_sheet_count=len(skipped_sheets),
            warning_count=len(warnings),
        )
        return {
            "workspace_path": str(workspace.root),
            "workbook_path": str(workspace.wiki_dir / "workbook.yaml"),
            "sheet_slugs": list(sheet_slugs),
            "import_mode": self._import_mode,
            "warnings": warnings,
            "artifacts": [
                "wiki/workbook.yaml",
                "wiki/names.yaml",
                "wiki/style_sheet.xml",
                "wiki/theme1.xml",
                *[
                    f"wiki/sheets/{sheet_slug}/{SHEET_STRUCTURE_YAML}"
                    for sheet_slug in sheet_slugs
                ],
                *[f"wiki/sheets/{sheet_slug}/summary.yaml" for sheet_slug in sheet_slugs],
                *[f"wiki/sheets/{sheet_slug}/regions.yaml" for sheet_slug in sheet_slugs],
                *(
                    [
                        f"wiki/sheets/{sheet_slug}/{SHEET_COMPRESSED_LAYOUT_YAML}"
                        for sheet_slug in sheet_slugs
                    ]
                    if self._is_debug_mode()
                    else []
                ),
                *(
                    [
                        f"wiki/sheets/{sheet_slug}/{SHEET_AGGREGATED_VALUES_YAML}"
                        for sheet_slug in sheet_slugs
                    ]
                    if self._is_debug_mode()
                    else []
                ),
                *(
                    [
                        f"wiki/sheets/{sheet_slug}/{SHEET_OBSERVABILITY_REPORT_YAML}"
                        for sheet_slug in sheet_slugs
                    ]
                    if self._is_debug_mode()
                    else []
                ),
                *(
                    [
                        f"wiki/sheets/{sheet_slug}/{SHEET_OBSERVABILITY_REPORT_MD}"
                        for sheet_slug in sheet_slugs
                    ]
                    if self._is_debug_mode()
                    else []
                ),
            ],
        }

    def _extract_ooxml(self, source_path: Path, extracted_dir: Path) -> None:
        if extracted_dir.exists():
            shutil.rmtree(extracted_dir)
        ensure_directory(path=extracted_dir)
        try:
            with zipfile.ZipFile(file=source_path, mode="r") as archive:
                archive.extractall(path=extracted_dir)
        except zipfile.BadZipFile as error:
            raise WorkbookImportError(
                "INVALID_ZIP_ARCHIVE",
                f"Workbook is not a valid XLSX ZIP archive: {source_path.name}",
            ) from error
        except zipfile.LargeZipFile as error:
            raise WorkbookImportError(
                "INVALID_ZIP_ARCHIVE",
                f"Workbook requires unsupported ZIP64 features: {source_path.name}",
            ) from error

    def _read_relationship_map(
        self, rels_path: Path
    ) -> dict[str, WorkbookRelationship]:
        rel_root: ET.Element = self._parse_xml_part(
            rels_path,
            missing_error_code="MISSING_WORKBOOK_RELS",
            missing_message="Missing required OOXML part: xl/_rels/workbook.xml.rels",
        )
        relationships: dict[str, WorkbookRelationship] = {}
        for node in rel_root.findall("pkg_rel:Relationship", NAMESPACES):
            relationship_id: str = str(node.attrib["Id"])
            relationship_type: str = str(node.attrib.get("Type", ""))
            target: str = str(node.attrib["Target"])
            kind: str = relationship_type.rsplit("/", maxsplit=1)[-1]
            relationships[relationship_id] = WorkbookRelationship(
                relationship_id=relationship_id,
                target=target,
                kind=kind,
            )
        return relationships

    def _read_shared_strings(self, extracted_dir: Path) -> list[str]:
        shared_strings_path: Path = extracted_dir / "xl" / "sharedStrings.xml"
        if not shared_strings_path.exists():
            return []
        started_at: float = time.perf_counter()
        values: list[str] = []
        for _event, node in ET.iterparse(shared_strings_path, events=("end",)):
            if self._local_name(node.tag) != "si":
                continue
            text_parts: list[str] = []
            for text_node in node.findall(".//main:t", NAMESPACES):
                text_parts.append(text_node.text or "")
            values.append("".join(text_parts))
            node.clear()
        self._log_perf_event(
            "shared_strings_parse_details",
            elapsed_ms=self._elapsed_ms(started_at),
            count=len(values),
            shared_strings_path=str(shared_strings_path),
        )
        return values

    def _read_content_types_map(self, extracted_dir: Path) -> ContentTypesMap:
        content_types_path: Path = extracted_dir / "[Content_Types].xml"
        root: ET.Element = self._parse_xml_part(
            content_types_path,
            missing_error_code="MISSING_CONTENT_TYPES",
            missing_message="Missing required OOXML part: [Content_Types].xml",
        )
        defaults: dict[str, str] = {}
        overrides: dict[str, str] = {}
        namespace: str = "http://schemas.openxmlformats.org/package/2006/content-types"
        for default_node in root.findall(f"{{{namespace}}}Default"):
            defaults[str(default_node.attrib["Extension"])] = str(
                default_node.attrib["ContentType"]
            )
        for override_node in root.findall(f"{{{namespace}}}Override"):
            overrides[str(override_node.attrib["PartName"]).removeprefix("/")] = str(
                override_node.attrib["ContentType"]
            )
        return ContentTypesMap(defaults=defaults, overrides=overrides)

    def _copy_style_sheet_if_present(self, extracted_dir: Path, wiki_dir: Path) -> None:
        source_path: Path = extracted_dir / "xl" / "styles.xml"
        if source_path.exists():
            shutil.copy2(src=source_path, dst=wiki_dir / "style_sheet.xml")

    def _copy_theme_if_present(self, extracted_dir: Path, wiki_dir: Path) -> None:
        source_path: Path = extracted_dir / "xl" / "theme" / "theme1.xml"
        if source_path.exists():
            shutil.copy2(src=source_path, dst=wiki_dir / "theme1.xml")

    def _read_style_map(self, extracted_dir: Path) -> dict[int, str]:
        styles_path: Path = extracted_dir / "xl" / "styles.xml"
        if not styles_path.exists():
            return {}
        started_at: float = time.perf_counter()
        root: ET.Element = self._parse_xml_part(
            styles_path,
            missing_error_code="MISSING_STYLES_XML",
            missing_message="Missing required OOXML part: xl/styles.xml",
        )
        custom_number_formats: dict[int, str] = {}
        num_fmts_parent: ET.Element | None = root.find("main:numFmts", NAMESPACES)
        if num_fmts_parent is not None:
            for num_fmt_node in num_fmts_parent.findall("main:numFmt", NAMESPACES):
                custom_number_formats[int(str(num_fmt_node.attrib["numFmtId"]))] = str(
                    num_fmt_node.attrib["formatCode"]
                )
        cell_xfs_parent: ET.Element | None = root.find("main:cellXfs", NAMESPACES)
        if cell_xfs_parent is None:
            return {}
        style_map: dict[int, str] = {}
        for style_id, xf_node in enumerate(
            cell_xfs_parent.findall("main:xf", NAMESPACES)
        ):
            num_fmt_id: int = int(str(xf_node.attrib.get("numFmtId", "0")))
            style_map[style_id] = custom_number_formats.get(
                num_fmt_id, self._builtin_number_format(num_fmt_id=num_fmt_id)
            )
        self._log_perf_event(
            "style_map_parse_details",
            elapsed_ms=self._elapsed_ms(started_at),
            style_count=len(style_map),
            custom_number_format_count=len(custom_number_formats),
            styles_path=str(styles_path),
        )
        return style_map

    def _builtin_number_format(self, num_fmt_id: int) -> str:
        builtin_formats: dict[int, str] = {
            0: "General",
            1: "0",
            2: "0.00",
            3: "#,##0",
            4: "#,##0.00",
            9: "0%",
            10: "0.00%",
            11: "0.00E+00",
            12: "# ?/?",
            13: "# ??/??",
            14: "mm-dd-yy",
            22: "m/d/yy h:mm",
            49: "@",
        }
        return builtin_formats.get(num_fmt_id, "General")

    def _parse_xml_part(
        self,
        path: Path,
        *,
        missing_error_code: str,
        missing_message: str,
    ) -> ET.Element:
        if not path.exists():
            raise WorkbookImportError(missing_error_code, missing_message)
        try:
            return ET.parse(path).getroot()
        except ET.ParseError as error:
            raise WorkbookImportError(
                "INVALID_XML",
                f"Failed to parse XML part {path.as_posix()}: {error}",
            ) from error

    def _parse_sheet(
        self,
        sheet_path: Path,
        workspace: WorkspacePaths,
        extracted_dir: Path,
        shared_strings: list[str],
        style_map: dict[int, str],
        content_types_map: ContentTypesMap,
        sheet_name: str,
        sheet_slug: str,
        position: int,
    ) -> ParsedSheet:
        sheet_dir: Path = workspace.sheets_dir / sheet_slug
        ensure_directory(path=sheet_dir)

        tables_started_at: float = time.perf_counter()
        tables: list[dict[str, Any]] = self._read_tables(
            sheet_path=sheet_path, extracted_dir=extracted_dir
        )
        tables_elapsed_ms: int = self._elapsed_ms(tables_started_at)
        inferred_data_region: dict[str, int] | None = None
        if len(tables) == 0:
            inferred_data_region = self._infer_large_sheet_data_region(
                sheet_path=sheet_path
            )
        data_region: dict[str, int] = (
            inferred_data_region
            if inferred_data_region is not None
            else self._resolve_data_region(tables=tables, max_row=0, max_col=0)
        )
        data_region_source: str = (
            "table"
            if len(tables) > 0
            else (
                "inferred_large_sheet"
                if inferred_data_region is not None
                else "none"
            )
        )

        static_cells_writer = _ChunkedCellMappingWriter(
            directory=sheet_dir / "static_cells",
            payload_key="cells",
            rows_per_chunk=ROWS_PER_CHUNK,
        )
        formulas_writer = _ChunkedRecordWriter(
            directory=sheet_dir / "formulas",
            payload_key="formulas",
            rows_per_chunk=ROWS_PER_CHUNK,
        )
        use_compact_style_runs: bool = data_region_source == "inferred_large_sheet"
        styles_writer: _ChunkedCellMappingWriter | None = None
        style_overrides_writer: _ChunkedRowRecordWriter | None = None
        if use_compact_style_runs:
            style_overrides_writer = _ChunkedRowRecordWriter(
                directory=sheet_dir / "style_runs",
                payload_key="rows",
                rows_per_chunk=ROWS_PER_CHUNK,
            )
        else:
            styles_writer = _ChunkedCellMappingWriter(
                directory=sheet_dir / "styles",
                payload_key="cells",
                rows_per_chunk=ROWS_PER_CHUNK,
            )

        row_attribute_runs: list[RowAttributeRun] = []
        max_row: int = 1
        max_col: int = 1
        header: list[str] = []
        preview_rows: list[list[str]] = []
        data_row_count: int = 0
        merged_ranges: list[str] = []
        validations: list[dict[str, Any]] = []
        frozen_panes: dict[str, Any] | None = None
        filters: dict[str, Any] = {"enabled": False, "ref": None}
        sheet_format: dict[str, str] | None = None
        column_definitions: list[dict[str, str]] = []
        sheet_pr_xml: str | None = None
        sheet_views_xml: str | None = None
        page_margins_xml: str | None = None
        page_setup_xml: str | None = None
        drawing_xml: str | None = None
        column_type_stats: dict[int, dict[str, bool]] = {}
        column_number_formats: dict[int, str] = {}
        sample_static_cells: dict[str, str] = {}
        sheet_values: dict[tuple[int, int], str] = {}
        cell_metadata: dict[tuple[int, int], dict[str, str]] = {}
        structural_cells: dict[tuple[int, int], dict[str, Any]] = {}
        row_profiles: dict[int, dict[str, Any]] = {}
        column_profiles: dict[int, dict[str, Any]] = {}
        style_count: int = 0
        default_row_style_runs: list[dict[str, int]] | None = None
        deferred_style_rows: list[dict[str, Any]] = []
        current_row_attribute_run: RowAttributeRun | None = None

        header_row_index: int = int(data_region["header_row_index"])
        start_col: int = int(data_region["start_col"])
        end_col: int = int(data_region["end_col"])
        end_row: int = int(data_region["end_row"])
        default_style_row_index: int = (
            header_row_index + 1 if end_row > header_row_index else header_row_index
        )
        has_tabular_region: bool = not self._is_empty_data_region(
            data_region=data_region
        )
        rows_started_at: float = time.perf_counter()
        row_count: int = 0
        cell_count: int = 0
        formula_cell_count: int = 0
        non_empty_value_count: int = 0
        column_index_cache: dict[str, int] = {}
        timed_row_attribute_ms: float = 0.0
        timed_coordinate_parse_ms: float = 0.0
        timed_value_read_ms: float = 0.0
        timed_style_handling_ms: float = 0.0
        timed_formula_handling_ms: float = 0.0
        timed_column_stats_ms: float = 0.0
        timed_static_cell_ms: float = 0.0
        timed_style_run_ms: float = 0.0
        timed_header_write_ms: float = 0.0
        timed_data_write_ms: float = 0.0
        timed_tag_dispatch_ms: float = 0.0
        timed_row_node_setup_ms: float = 0.0
        timed_row_find_cells_ms: float = 0.0
        timed_cell_misc_ms: float = 0.0
        timed_row_finalize_ms: float = 0.0
        timed_non_row_node_ms: float = 0.0
        timed_node_clear_ms: float = 0.0

        for _event, node in ET.iterparse(sheet_path, events=("end",)):
            stage_started_at = time.perf_counter()
            tag_name: str = self._local_name(node.tag)
            timed_tag_dispatch_ms += (
                time.perf_counter() - stage_started_at
            ) * 1000
            if tag_name == "row":
                row_started_at: float = time.perf_counter()
                row_index: int = int(str(node.attrib["r"]))
                row_count += 1
                max_row = max(max_row, row_index)
                stage_started_at = time.perf_counter()
                row_metadata: dict[str, str] = {
                    key: str(value) for key, value in node.attrib.items() if key != "r"
                }
                current_row_attribute_run = self._update_row_attribute_runs(
                    runs=row_attribute_runs,
                    current_run=current_row_attribute_run,
                    row_index=row_index,
                    row_metadata=row_metadata,
                )
                row_node_setup_elapsed_ms: float = (
                    time.perf_counter() - stage_started_at
                ) * 1000
                timed_row_node_setup_ms += row_node_setup_elapsed_ms
                timed_row_attribute_ms += row_node_setup_elapsed_ms
                row_values_by_column: dict[int, str] = {}
                header_values_by_column: dict[int, str] = {}
                row_style_ids_by_column: dict[int, int] = {}
                stage_started_at = time.perf_counter()
                row_cells: list[ET.Element] = node.findall("main:c", NAMESPACES)
                timed_row_find_cells_ms += (
                    time.perf_counter() - stage_started_at
                ) * 1000
                for cell in row_cells:
                    cell_started_at: float = time.perf_counter()
                    coordinate_elapsed_ms: float = 0.0
                    value_read_elapsed_ms: float = 0.0
                    style_handling_elapsed_ms: float = 0.0
                    formula_handling_elapsed_ms: float = 0.0
                    column_stats_elapsed_ms: float = 0.0
                    static_cell_elapsed_ms: float = 0.0
                    cell_count += 1
                    reference: str = str(cell.attrib["r"])
                    stage_started_at = time.perf_counter()
                    column_index = self._column_index_from_cell_reference(
                        cell_reference=reference,
                        cache=column_index_cache,
                    )
                    coordinate_elapsed_ms = (
                        time.perf_counter() - stage_started_at
                    ) * 1000
                    timed_coordinate_parse_ms += coordinate_elapsed_ms
                    max_col = max(max_col, column_index)
                    stage_started_at = time.perf_counter()
                    parsed_cell: ParsedCellPayload = self._read_cell_payload(
                        cell=cell, shared_strings=shared_strings
                    )
                    value_read_elapsed_ms = (
                        time.perf_counter() - stage_started_at
                    ) * 1000
                    timed_value_read_ms += value_read_elapsed_ms
                    value: str = parsed_cell.value
                    cell_type: str = parsed_cell.cell_type
                    has_style: bool = "s" in cell.attrib
                    structural_number_format: str = (
                        style_map.get(int(str(cell.attrib["s"])), "General")
                        if has_style
                        else "General"
                    )
                    if value != "":
                        sheet_values[(row_index, column_index)] = value
                        cell_metadata[(row_index, column_index)] = {
                            "cell_type": cell_type,
                            "number_format": structural_number_format,
                        }
                    if value != "":
                        non_empty_value_count += 1

                    if has_style:
                        stage_started_at = time.perf_counter()
                        style_id: int = int(str(cell.attrib["s"]))
                        style_count += 1
                        if use_compact_style_runs and has_tabular_region:
                            row_style_ids_by_column[column_index] = style_id
                        else:
                            style_entry: dict[str, Any] = {
                                "style_id": style_id,
                                "number_format": style_map.get(style_id, "General"),
                                "cell_type": cell_type,
                            }
                            if styles_writer is not None:
                                styles_writer.add(reference, style_entry)
                        column_number_formats.setdefault(
                            column_index, str(style_map.get(style_id, "General"))
                        )
                        style_handling_elapsed_ms = (
                            time.perf_counter() - stage_started_at
                        ) * 1000
                        timed_style_handling_ms += style_handling_elapsed_ms
                    elif not use_compact_style_runs and cell_type != "number":
                        stage_started_at = time.perf_counter()
                        style_count += 1
                        if styles_writer is not None:
                            styles_writer.add(reference, {"cell_type": cell_type})
                        style_handling_elapsed_ms = (
                            time.perf_counter() - stage_started_at
                        ) * 1000
                        timed_style_handling_ms += style_handling_elapsed_ms

                    if parsed_cell.formula_text is not None:
                        formula_cell_count += 1
                        stage_started_at = time.perf_counter()
                        formulas_writer.add(
                            {
                                "cell": reference,
                                "formula": f"={parsed_cell.formula_text}",
                                "formula_attributes": dict(
                                    parsed_cell.formula_attributes
                                ),
                                "cached_value": value if value != "" else None,
                                "note": f"Imported formula at {reference}",
                            }
                        )
                        formula_handling_elapsed_ms = (
                            time.perf_counter() - stage_started_at
                        ) * 1000
                        timed_formula_handling_ms += formula_handling_elapsed_ms

                    if (
                        value != ""
                        or parsed_cell.formula_text is not None
                        or has_style
                    ):
                        self._record_structural_cell(
                            structural_cells=structural_cells,
                            row_profiles=row_profiles,
                            column_profiles=column_profiles,
                            row_index=row_index,
                            column_index=column_index,
                            value=value,
                            cell_type=cell_type,
                            number_format=structural_number_format,
                            has_formula=parsed_cell.formula_text is not None,
                            has_style=has_style,
                        )

                    within_data_columns: bool = (
                        has_tabular_region and start_col <= column_index <= end_col
                    )
                    within_data_rows: bool = (
                        has_tabular_region and header_row_index <= row_index <= end_row
                    )

                    if within_data_columns and within_data_rows:
                        if row_index == header_row_index:
                            header_values_by_column[column_index] = value.strip()
                        else:
                            row_values_by_column[column_index] = value
                            if value != "":
                                stage_started_at = time.perf_counter()
                                column_stats: dict[str, bool] = (
                                    column_type_stats.setdefault(
                                        column_index,
                                        {
                                            "seen_non_empty": False,
                                            "all_digit": True,
                                            "all_float": True,
                                        },
                                    )
                                )
                                column_stats["seen_non_empty"] = True
                                if not value.isdigit():
                                    column_stats["all_digit"] = False
                                try:
                                    float(value)
                                except ValueError:
                                    column_stats["all_float"] = False
                                column_stats_elapsed_ms = (
                                    time.perf_counter() - stage_started_at
                                ) * 1000
                                timed_column_stats_ms += column_stats_elapsed_ms
                        continue

                    if parsed_cell.formula_text is None and value != "":
                        stage_started_at = time.perf_counter()
                        static_cells_writer.add(reference, value)
                        if len(sample_static_cells) < 10:
                            sample_static_cells[reference] = value
                        static_cell_elapsed_ms = (
                            time.perf_counter() - stage_started_at
                        ) * 1000
                        timed_static_cell_ms += static_cell_elapsed_ms
                    known_cell_ms: float = (
                        coordinate_elapsed_ms
                        + value_read_elapsed_ms
                        + style_handling_elapsed_ms
                        + formula_handling_elapsed_ms
                        + column_stats_elapsed_ms
                        + static_cell_elapsed_ms
                    )
                    timed_cell_misc_ms += max(
                        ((time.perf_counter() - cell_started_at) * 1000)
                        - known_cell_ms,
                        0.0,
                    )

                if has_tabular_region:
                    stage_started_at = time.perf_counter()
                    if use_compact_style_runs and header_row_index <= row_index <= end_row:
                        nested_stage_started_at = time.perf_counter()
                        row_style_runs: list[dict[str, int]] = self._build_row_style_runs(
                            start_col=start_col,
                            end_col=end_col,
                            style_ids_by_column=row_style_ids_by_column,
                        )
                        if row_index == default_style_row_index:
                            default_row_style_runs = [dict(run) for run in row_style_runs]
                            for deferred_row in deferred_style_rows:
                                if deferred_row["runs"] != default_row_style_runs and style_overrides_writer is not None:
                                    style_overrides_writer.add(deferred_row)
                            deferred_style_rows = []
                        elif default_row_style_runs is None:
                            deferred_style_rows.append(
                                {"row": row_index, "runs": [dict(run) for run in row_style_runs]}
                            )
                        elif row_style_runs != default_row_style_runs and style_overrides_writer is not None:
                            style_overrides_writer.add(
                                {"row": row_index, "runs": [dict(run) for run in row_style_runs]}
                            )
                        timed_style_run_ms += (
                            time.perf_counter() - nested_stage_started_at
                        ) * 1000
                    if row_index == header_row_index:
                        header = []
                        for column_index in range(start_col, end_col + 1):
                            header_value: str = header_values_by_column.get(
                                column_index, ""
                            )
                            header.append(
                                header_value
                                if header_value
                                else f"Column {column_index_to_letter(column_index=column_index)}"
                            )
                        stage_started_at = time.perf_counter()
                        timed_header_write_ms += (
                            time.perf_counter() - stage_started_at
                        ) * 1000
                    elif header_row_index < row_index <= end_row:
                        row_values: list[str] = [
                            row_values_by_column.get(column_index, "")
                            for column_index in range(start_col, end_col + 1)
                        ]
                        data_row_count += 1
                        if len(preview_rows) < self._preview_rows:
                            preview_rows.append(row_values)
                    timed_row_finalize_ms += (
                        time.perf_counter() - stage_started_at
                    ) * 1000
                stage_started_at = time.perf_counter()
                node.clear()
                timed_node_clear_ms += (
                    time.perf_counter() - stage_started_at
                ) * 1000
                continue

            non_row_started_at: float = time.perf_counter()
            if tag_name == "mergeCell":
                merged_ranges.append(str(node.attrib["ref"]))
            elif tag_name == "dataValidation":
                validations.append(self._read_validation_node(validation_node=node))
            elif tag_name == "pane" and frozen_panes is None:
                frozen_panes = {
                    "x_split": self._parse_optional_float(
                        value=node.attrib.get("xSplit")
                    ),
                    "y_split": self._parse_optional_float(
                        value=node.attrib.get("ySplit")
                    ),
                    "top_left_cell": node.attrib.get("topLeftCell"),
                    "active_pane": node.attrib.get("activePane"),
                    "state": node.attrib.get("state"),
                }
            elif tag_name == "autoFilter":
                filters = {"enabled": True, "ref": node.attrib.get("ref")}
            elif tag_name == "sheetFormatPr":
                sheet_format = {key: str(value) for key, value in node.attrib.items()}
            elif tag_name == "col":
                column_definitions.append(
                    {key: str(value) for key, value in node.attrib.items()}
                )
            elif tag_name == "sheetPr":
                sheet_pr_xml = None
            elif tag_name == "sheetViews":
                sheet_views_xml = None
            elif tag_name == "pageMargins" and page_margins_xml is None:
                page_margins_xml = ET.tostring(node, encoding="unicode")
            elif tag_name == "pageSetup" and page_setup_xml is None:
                page_setup_xml = ET.tostring(node, encoding="unicode")
            elif tag_name == "drawing" and drawing_xml is None:
                drawing_xml = ET.tostring(node, encoding="unicode")

            if tag_name in {
                "mergeCell",
                "dataValidation",
                "pane",
                "autoFilter",
                "sheetFormatPr",
                "col",
                "sheetPr",
                "sheetViews",
                "pageMargins",
                "pageSetup",
                "drawing",
            }:
                stage_started_at = time.perf_counter()
                node.clear()
                timed_node_clear_ms += (
                    time.perf_counter() - stage_started_at
                ) * 1000
            timed_non_row_node_ms += (
                time.perf_counter() - non_row_started_at
            ) * 1000

        rows_elapsed_ms: int = self._elapsed_ms(rows_started_at)
        self._flush_row_attribute_run(
            runs=row_attribute_runs,
            current_run=current_row_attribute_run,
        )
        finalize_started_at: float = time.perf_counter()
        static_cells_index: list[dict[str, Any]] = static_cells_writer.finalize()
        formula_index: list[dict[str, Any]] = formulas_writer.finalize()
        style_index: list[dict[str, Any]] = []
        styles_payload: dict[str, Any]
        if use_compact_style_runs:
            override_style_index: list[dict[str, Any]] = (
                style_overrides_writer.finalize() if style_overrides_writer is not None else []
            )
            default_row_style_runs = default_row_style_runs or []
            styles_payload = {
                "version": "1",
                "sheet_slug": sheet_slug,
                "cell_count": style_count,
                "style_mode": "default_row_runs",
                "default_row_style_runs": default_row_style_runs,
                "row_run_overrides": [],
                "row_run_overrides_index": override_style_index,
            }
        else:
            style_index = styles_writer.finalize() if styles_writer is not None else []
            styles_payload = {
                "version": "1",
                "sheet_slug": sheet_slug,
                "cell_count": style_count,
                "cells": {},
                "cells_index": style_index,
            }
        finalize_elapsed_ms: int = self._elapsed_ms(finalize_started_at)

        columns: list[dict[str, Any]] = []
        for column_index, column_name in enumerate(header, start=1):
            absolute_column_index: int = (
                int(data_region["start_col"]) + column_index - 1
            )
            columns.append(
                {
                    "index": column_index,
                    "letter": column_index_to_letter(
                        column_index=absolute_column_index
                    ),
                    "name": column_name,
                    "data_type": self._infer_streamed_column_type(
                        column_stats=column_type_stats.get(absolute_column_index)
                    ),
                    "number_format": column_number_formats.get(
                        absolute_column_index, "General"
                    ),
                }
            )
        worksheet_relationships: list[dict[str, Any]] = (
            self._read_worksheet_relationships(
                sheet_path=sheet_path,
                extracted_dir=extracted_dir,
                content_types_map=content_types_map,
            )
        )
        self._apply_merged_ranges_to_structural_cells(
            structural_cells=structural_cells,
            row_profiles=row_profiles,
            column_profiles=column_profiles,
            merged_ranges=merged_ranges,
        )
        layout_analysis: dict[str, Any] = self._build_sheet_layout_analysis(
            sheet_slug=sheet_slug,
            sheet_name=sheet_name,
            data_region=data_region,
            data_region_source=data_region_source,
            structural_cells=structural_cells,
            row_profiles=row_profiles,
            column_profiles=column_profiles,
            merged_ranges=merged_ranges,
            tables=tables,
        )
        self._log_perf_event(
            "sheet_parse_details",
            sheet_name=sheet_name,
            sheet_slug=sheet_slug,
            sheet_path=str(sheet_path),
            tables_elapsed_ms=tables_elapsed_ms,
            row_scan_elapsed_ms=rows_elapsed_ms,
            finalize_elapsed_ms=finalize_elapsed_ms,
            row_count=row_count,
            max_row=max_row,
            max_col=max_col,
            has_tabular_region=has_tabular_region,
            data_region_source=data_region_source,
            merged_range_count=len(merged_ranges),
            validation_count=len(validations),
            formula_count=formulas_writer.count,
            style_count=style_count,
            static_cell_count=static_cells_writer.count,
            table_count=len(tables),
        )
        self._log_perf_event(
            "sheet_row_scan_breakdown",
            sheet_name=sheet_name,
            sheet_slug=sheet_slug,
            row_count=row_count,
            cell_count=cell_count,
            formula_cell_count=formula_cell_count,
            non_empty_value_count=non_empty_value_count,
            row_attribute_ms=int(timed_row_attribute_ms),
            coordinate_parse_ms=int(timed_coordinate_parse_ms),
            value_read_ms=int(timed_value_read_ms),
            style_handling_ms=int(timed_style_handling_ms),
            formula_handling_ms=int(timed_formula_handling_ms),
            column_stats_ms=int(timed_column_stats_ms),
            static_cell_ms=int(timed_static_cell_ms),
            style_run_ms=int(timed_style_run_ms),
            header_write_ms=int(timed_header_write_ms),
            data_write_ms=int(timed_data_write_ms),
            tag_dispatch_ms=int(timed_tag_dispatch_ms),
            row_node_setup_ms=int(timed_row_node_setup_ms),
            row_find_cells_ms=int(timed_row_find_cells_ms),
            row_finalize_ms=int(timed_row_finalize_ms),
            non_row_node_ms=int(timed_non_row_node_ms),
            node_clear_ms=int(timed_node_clear_ms),
            cell_misc_ms=int(timed_cell_misc_ms),
        )
        structure: dict[str, Any] = {
            "version": "1",
            "sheet_slug": sheet_slug,
            "sheet_name": sheet_name,
            "position": position,
            "dimensions": {
                "min_row": 1,
                "max_row": max_row,
                "min_col": 1,
                "max_col": max_col,
            },
            "header": {
                "row_index": int(data_region["header_row_index"]),
                "values": header,
            },
            "data_region": data_region,
            "data_region_source": data_region_source,
            "columns": columns,
            "static_cells": {},
            "static_cells_count": static_cells_writer.count,
            "static_cells_index": static_cells_index,
            "merged_ranges": merged_ranges,
            "frozen_panes": frozen_panes,
            "filters": filters,
            "sheet_format": sheet_format,
            "column_definitions": column_definitions,
            "row_attributes": {},
            "row_attribute_runs": [
                {
                    "r1": run.row_start,
                    "r2": run.row_end,
                    "attrs": dict(run.attrs),
                }
                for run in row_attribute_runs
            ],
            "sheet_pr_xml": sheet_pr_xml,
            "sheet_views_xml": sheet_views_xml,
            "page_margins_xml": page_margins_xml,
            "page_setup_xml": page_setup_xml,
            "drawing_xml": drawing_xml,
            "worksheet_relationships": worksheet_relationships,
            "structural_anchors": dict(layout_analysis["anchors"]),
            "sheet_blocks": list(layout_analysis["blocks"]),
        }
        return ParsedSheet(
            slug=str(structure["sheet_slug"]),
            name=sheet_name,
            position=position,
            header=header,
            data_row_count=data_row_count,
            preview_rows=preview_rows,
            formula_count=formulas_writer.count,
            validations=validations,
            tables=tables,
            style_count=style_count,
            static_cell_count=static_cells_writer.count,
            static_cells_sample=sample_static_cells,
            structure=structure,
            formula_index=formula_index,
            style_index=style_index,
            styles_payload=styles_payload,
            cell_values=sheet_values,
            cell_metadata=cell_metadata,
        )

    def _resolve_data_region(
        self, tables: list[dict[str, Any]], max_row: int, max_col: int
    ) -> dict[str, int]:
        primary_table: dict[str, Any] | None = tables[0] if len(tables) > 0 else None
        if primary_table is None:
            # [ACCEPTANCE]: Successful import creates the minimum workspace files.
            # [PLANS]: Implement merge-range and data-validation round-trip for the wiki layer.
            return {
                "start_row": 0,
                "end_row": 0,
                "start_col": 0,
                "end_col": 0,
                "header_row_index": 0,
            }
        start_reference: str
        end_reference: str
        start_reference, end_reference = str(primary_table["ref"]).split(
            ":", maxsplit=1
        )
        start_row, start_col = cell_reference_to_coordinates(
            cell_reference=start_reference
        )
        end_row, end_col = cell_reference_to_coordinates(cell_reference=end_reference)
        header_row_count: int = int(primary_table.get("header_row_count", 1))
        return {
            "start_row": start_row,
            "end_row": end_row,
            "start_col": start_col,
            "end_col": end_col,
            "header_row_index": start_row + header_row_count - 1,
        }

    def _infer_large_sheet_data_region(
        self,
        sheet_path: Path,
    ) -> dict[str, int] | None:
        dimension_ref: str | None = None
        sampled_rows: list[dict[str, int]] = []
        for _event, node in ET.iterparse(sheet_path, events=("end",)):
            tag_name: str = self._local_name(node.tag)
            if tag_name == "dimension" and dimension_ref is None:
                dimension_ref = str(node.attrib.get("ref", "")).strip()
                node.clear()
                continue
            if tag_name != "row":
                continue
            row_index: int = int(str(node.attrib.get("r", "0") or "0"))
            column_indexes: list[int] = []
            for cell in node.findall("main:c", NAMESPACES):
                reference: str = str(cell.attrib.get("r", "")).strip()
                if reference == "":
                    continue
                _cell_row_index, column_index = cell_reference_to_coordinates(
                    cell_reference=reference
                )
                column_indexes.append(column_index)
            if len(column_indexes) > 0:
                sampled_rows.append(
                    {
                        "row_index": row_index,
                        "start_col": min(column_indexes),
                        "end_col": max(column_indexes),
                        "cell_count": len(column_indexes),
                    }
                )
                if len(sampled_rows) >= 10:
                    node.clear()
                    break
            node.clear()
        if dimension_ref in {None, ""} or len(sampled_rows) < MIN_INFERRED_SAMPLE_ROWS:
            return None
        dimension_start_ref: str
        dimension_end_ref: str
        if ":" in str(dimension_ref):
            dimension_start_ref, dimension_end_ref = str(dimension_ref).split(
                ":", maxsplit=1
            )
        else:
            dimension_start_ref = str(dimension_ref)
            dimension_end_ref = str(dimension_ref)
        start_row, start_col = cell_reference_to_coordinates(
            cell_reference=dimension_start_ref
        )
        end_row, end_col = cell_reference_to_coordinates(
            cell_reference=dimension_end_ref
        )
        width: int = end_col - start_col + 1
        first_sample: dict[str, int] = sampled_rows[0]
        if (
            start_row != 1
            or first_sample["row_index"] != 1
            or end_row < MIN_INFERRED_TABULAR_ROWS
            or width < 2
            or width > MAX_INFERRED_TABULAR_COLUMNS
        ):
            return None
        for offset, sample in enumerate(sampled_rows):
            expected_row_index: int = start_row + offset
            if (
                sample["row_index"] != expected_row_index
                or sample["start_col"] != start_col
                or sample["end_col"] != end_col
                or sample["cell_count"] != width
            ):
                return None
        self._log_perf_event(
            "inferred_large_sheet_data_region",
            sheet_path=str(sheet_path),
            start_row=start_row,
            end_row=end_row,
            start_col=start_col,
            end_col=end_col,
            sampled_row_count=len(sampled_rows),
        )
        return {
            "start_row": start_row,
            "end_row": end_row,
            "start_col": start_col,
            "end_col": end_col,
            "header_row_index": start_row,
        }

    def _build_header(
        self, sheet_data: dict[tuple[int, int], str], data_region: dict[str, int]
    ) -> list[str]:
        if self._is_empty_data_region(data_region=data_region):
            return []
        header: list[str] = []
        header_row_index: int = int(data_region["header_row_index"])
        for column_index in range(
            int(data_region["start_col"]), int(data_region["end_col"]) + 1
        ):
            header_value: str = sheet_data.get(
                (header_row_index, column_index), ""
            ).strip()
            header.append(
                header_value
                if header_value
                else f"Column {column_index_to_letter(column_index=column_index)}"
            )
        return header

    def _build_row_style_runs(
        self,
        *,
        start_col: int,
        end_col: int,
        style_ids_by_column: dict[int, int],
    ) -> list[dict[str, int]]:
        runs: list[dict[str, int]] = []
        current_style_id: int | None = None
        run_start: int | None = None
        for column_index in range(start_col, end_col + 1):
            style_id: int | None = style_ids_by_column.get(column_index)
            if run_start is None:
                run_start = column_index
                current_style_id = style_id
                continue
            if style_id == current_style_id:
                continue
            runs.append(
                self._make_style_run(
                    start_col=run_start,
                    end_col=column_index - 1,
                    style_id=current_style_id,
                )
            )
            run_start = column_index
            current_style_id = style_id
        if run_start is not None:
            runs.append(
                self._make_style_run(
                    start_col=run_start,
                    end_col=end_col,
                    style_id=current_style_id,
                )
            )
        return runs

    def _make_style_run(
        self,
        *,
        start_col: int,
        end_col: int,
        style_id: int | None,
    ) -> dict[str, int]:
        payload: dict[str, int] = {
            "c1": start_col,
            "c2": end_col,
        }
        if style_id is not None:
            payload["style_id"] = style_id
        return payload

    def _update_row_attribute_runs(
        self,
        *,
        runs: list[RowAttributeRun],
        current_run: RowAttributeRun | None,
        row_index: int,
        row_metadata: dict[str, str],
    ) -> RowAttributeRun | None:
        if len(row_metadata) == 0:
            self._flush_row_attribute_run(runs=runs, current_run=current_run)
            return None
        if current_run is None:
            return RowAttributeRun(
                row_start=row_index,
                row_end=row_index,
                attrs=dict(row_metadata),
            )
        if (
            current_run.attrs == row_metadata
            and row_index == current_run.row_end + 1
        ):
            return RowAttributeRun(
                row_start=current_run.row_start,
                row_end=row_index,
                attrs=dict(current_run.attrs),
            )
        self._flush_row_attribute_run(runs=runs, current_run=current_run)
        return RowAttributeRun(
            row_start=row_index,
            row_end=row_index,
            attrs=dict(row_metadata),
        )

    def _flush_row_attribute_run(
        self,
        *,
        runs: list[RowAttributeRun],
        current_run: RowAttributeRun | None,
    ) -> None:
        if current_run is None:
            return
        runs.append(current_run)

    def _build_data_rows(
        self, sheet_data: dict[tuple[int, int], str], data_region: dict[str, int]
    ) -> list[list[str]]:
        if self._is_empty_data_region(data_region=data_region):
            return []
        data_rows: list[list[str]] = []
        for row_index in range(
            int(data_region["header_row_index"]) + 1, int(data_region["end_row"]) + 1
        ):
            row_values: list[str] = []
            for column_index in range(
                int(data_region["start_col"]), int(data_region["end_col"]) + 1
            ):
                row_values.append(sheet_data.get((row_index, column_index), ""))
            data_rows.append(row_values)
        return data_rows

    def _is_empty_data_region(self, data_region: dict[str, int]) -> bool:
        return (
            int(data_region["start_row"]) <= 0
            or int(data_region["end_row"]) <= 0
            or int(data_region["start_col"]) <= 0
            or int(data_region["end_col"]) <= 0
            or int(data_region["header_row_index"]) <= 0
        )

    def _collect_static_cells(
        self,
        sheet_data: dict[tuple[int, int], str],
        formulas: list[dict[str, Any]],
        data_region: dict[str, int],
    ) -> dict[str, str]:
        formula_cells: set[str] = {
            str(formula_entry["cell"]) for formula_entry in formulas
        }
        static_cells: dict[str, str] = {}
        header_row_index: int = int(data_region["header_row_index"])
        for (row_index, column_index), value in sheet_data.items():
            cell_reference: str = coordinates_to_cell_reference(
                row_index=row_index, column_index=column_index
            )
            if cell_reference in formula_cells:
                continue
            within_data_columns: bool = (
                int(data_region["start_col"])
                <= column_index
                <= int(data_region["end_col"])
            )
            within_data_rows: bool = (
                header_row_index <= row_index <= int(data_region["end_row"])
            )
            if within_data_columns and within_data_rows:
                continue
            if value == "":
                continue
            static_cells[cell_reference] = value
        return static_cells

    def _read_validations(self, root: ET.Element) -> list[dict[str, Any]]:
        validations: list[dict[str, Any]] = []
        validations_parent: ET.Element | None = root.find(
            "main:dataValidations", NAMESPACES
        )
        if validations_parent is None:
            return validations
        for validation_node in validations_parent.findall(
            "main:dataValidation", NAMESPACES
        ):
            validations.append(
                self._read_validation_node(validation_node=validation_node)
            )
        return validations

    def _read_validation_node(self, validation_node: ET.Element) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "sqref": str(validation_node.attrib.get("sqref", "")),
            "type": str(validation_node.attrib.get("type", "none")),
        }
        for attribute_name in [
            "allowBlank",
            "showDropDown",
            "showErrorMessage",
            "showInputMessage",
            "operator",
            "errorStyle",
            "imeMode",
            "errorTitle",
            "error",
            "promptTitle",
            "prompt",
        ]:
            if attribute_name in validation_node.attrib:
                payload[attribute_name] = str(validation_node.attrib[attribute_name])
        formula1_node: ET.Element | None = validation_node.find(
            "main:formula1", NAMESPACES
        )
        formula2_node: ET.Element | None = validation_node.find(
            "main:formula2", NAMESPACES
        )
        payload["formula1"] = formula1_node.text if formula1_node is not None else None
        payload["formula2"] = formula2_node.text if formula2_node is not None else None
        return payload

    def _read_frozen_panes(self, root: ET.Element) -> dict[str, Any] | None:
        pane_node: ET.Element | None = root.find(
            "main:sheetViews/main:sheetView/main:pane", NAMESPACES
        )
        if pane_node is None:
            return None
        return {
            "x_split": self._parse_optional_float(value=pane_node.attrib.get("xSplit")),
            "y_split": self._parse_optional_float(value=pane_node.attrib.get("ySplit")),
            "top_left_cell": pane_node.attrib.get("topLeftCell"),
            "active_pane": pane_node.attrib.get("activePane"),
            "state": pane_node.attrib.get("state"),
        }

    def _read_filters(self, root: ET.Element) -> dict[str, Any]:
        auto_filter_node: ET.Element | None = root.find("main:autoFilter", NAMESPACES)
        if auto_filter_node is None:
            return {"enabled": False, "ref": None}
        return {"enabled": True, "ref": auto_filter_node.attrib.get("ref")}

    def _read_tables(
        self, sheet_path: Path, extracted_dir: Path
    ) -> list[dict[str, Any]]:
        rels_path: Path = sheet_path.parent / "_rels" / f"{sheet_path.name}.rels"
        if not rels_path.exists():
            return []
        started_at: float = time.perf_counter()
        rel_root: ET.Element = ET.parse(rels_path).getroot()
        tables: list[dict[str, Any]] = []
        for node in rel_root.findall("pkg_rel:Relationship", NAMESPACES):
            relationship_type: str = str(node.attrib.get("Type", ""))
            if not relationship_type.endswith("/table"):
                continue
            target: str = str(node.attrib["Target"])
            table_path: Path = self._resolve_relationship_target(
                package_root=extracted_dir,
                source_dir=sheet_path.parent,
                target=target,
            )
            table_root: ET.Element = ET.parse(table_path).getroot()
            columns: list[dict[str, Any]] = []
            columns_parent: ET.Element | None = table_root.find(
                "main:tableColumns", NAMESPACES
            )
            if columns_parent is not None:
                for column_node in columns_parent.findall(
                    "main:tableColumn", NAMESPACES
                ):
                    columns.append(
                        {
                            "id": int(str(column_node.attrib["id"])),
                            "name": str(column_node.attrib["name"]),
                        }
                    )
            style_payload: dict[str, Any] | None = None
            style_info_node: ET.Element | None = table_root.find(
                "main:tableStyleInfo", NAMESPACES
            )
            if style_info_node is not None:
                style_payload = {
                    "name": style_info_node.attrib.get("name"),
                    "show_first_column": style_info_node.attrib.get(
                        "showFirstColumn", "0"
                    )
                    == "1",
                    "show_last_column": style_info_node.attrib.get(
                        "showLastColumn", "0"
                    )
                    == "1",
                    "show_row_stripes": style_info_node.attrib.get(
                        "showRowStripes", "0"
                    )
                    == "1",
                    "show_column_stripes": style_info_node.attrib.get(
                        "showColumnStripes", "0"
                    )
                    == "1",
                }
            auto_filter_node: ET.Element | None = table_root.find(
                "main:autoFilter", NAMESPACES
            )
            tables.append(
                {
                    "id": int(str(table_root.attrib["id"])),
                    "name": str(table_root.attrib["name"]),
                    "display_name": str(
                        table_root.attrib.get("displayName", table_root.attrib["name"])
                    ),
                    "ref": str(table_root.attrib["ref"]),
                    "table_file": table_path.name,
                    "header_row_count": int(
                        str(table_root.attrib.get("headerRowCount", "1"))
                    ),
                    "totals_row_count": int(
                        str(table_root.attrib.get("totalsRowCount", "0"))
                    ),
                    "auto_filter_ref": (
                        auto_filter_node.attrib.get("ref")
                        if auto_filter_node is not None
                        else None
                    ),
                    "columns": columns,
                    "style": style_payload,
                }
            )
        self._log_perf_event(
            "sheet_tables_loaded",
            elapsed_ms=self._elapsed_ms(started_at),
            sheet_path=str(sheet_path),
            table_count=len(tables),
        )
        return tables

    def _elapsed_ms(self, started_at: float) -> int:
        return int((time.perf_counter() - started_at) * 1000)

    def _log_perf_event(self, event: str, **payload: Any) -> None:
        if self._perf_log_path is None:
            return
        append_json_line(
            path=self._perf_log_path,
            payload={
                "timestamp": current_timestamp(),
                "event": event,
                **payload,
            },
        )

    def _read_sheet_format(self, root: ET.Element) -> dict[str, str] | None:
        sheet_format_node: ET.Element | None = root.find(
            "main:sheetFormatPr", NAMESPACES
        )
        if sheet_format_node is None:
            return None
        return {key: str(value) for key, value in sheet_format_node.attrib.items()}

    def _read_column_definitions(self, root: ET.Element) -> list[dict[str, str]]:
        columns_parent: ET.Element | None = root.find("main:cols", NAMESPACES)
        if columns_parent is None:
            return []
        column_definitions: list[dict[str, str]] = []
        for column_node in columns_parent.findall("main:col", NAMESPACES):
            column_definitions.append(
                {key: str(value) for key, value in column_node.attrib.items()}
            )
        return column_definitions

    def _read_optional_node_xml(self, root: ET.Element, tag_name: str) -> str | None:
        node: ET.Element | None = root.find(f"main:{tag_name}", NAMESPACES)
        if node is None:
            return None
        return ET.tostring(node, encoding="unicode")

    def _read_worksheet_relationships(
        self,
        sheet_path: Path,
        extracted_dir: Path,
        content_types_map: ContentTypesMap,
    ) -> list[dict[str, Any]]:
        rels_path: Path = sheet_path.parent / "_rels" / f"{sheet_path.name}.rels"
        if not rels_path.exists():
            return []
        rel_root: ET.Element = ET.parse(rels_path).getroot()
        relationships: list[dict[str, Any]] = []
        for node in rel_root.findall("pkg_rel:Relationship", NAMESPACES):
            relationship_type: str = str(node.attrib.get("Type", ""))
            if relationship_type.endswith("/table"):
                continue
            target: str = str(node.attrib["Target"])
            target_path: Path = self._resolve_relationship_target(
                package_root=extracted_dir,
                source_dir=sheet_path.parent,
                target=target,
            )
            package_path: str = (
                target_path.resolve().relative_to(extracted_dir.resolve()).as_posix()
            )
            relationships.append(
                {
                    "relationship_id": str(node.attrib["Id"]),
                    "relationship_type": relationship_type,
                    "target": target,
                    "package_path": package_path,
                    "content_type": self._resolve_content_type(
                        package_path=package_path,
                        content_types_map=content_types_map,
                    ),
                }
            )
        return relationships

    def _resolve_content_type(
        self, package_path: str, content_types_map: ContentTypesMap
    ) -> str:
        if package_path in content_types_map.overrides:
            return content_types_map.overrides[package_path]
        extension: str = Path(package_path).suffix.removeprefix(".")
        return content_types_map.defaults.get(extension, "application/octet-stream")

    def _resolve_relationship_target(
        self, package_root: Path, source_dir: Path, target: str
    ) -> Path:
        """Resolve an OOXML relationship target against the package root and source part."""

        normalized_target: str = target.replace("\\", "/")
        if normalized_target.startswith("/"):
            return package_root / normalized_target.removeprefix("/")
        candidate_paths: list[Path] = [
            source_dir / normalized_target,
            package_root / normalized_target,
        ]
        for candidate_path in candidate_paths:
            if candidate_path.exists():
                return candidate_path
        return candidate_paths[0]

    def _read_defined_names(
        self, workbook_root: ET.Element, sheet_slug_by_position: dict[int, str]
    ) -> list[dict[str, Any]]:
        names: list[dict[str, Any]] = []
        defined_names_parent: ET.Element | None = workbook_root.find(
            "main:definedNames", NAMESPACES
        )
        if defined_names_parent is None:
            return names
        for node in defined_names_parent.findall("main:definedName", NAMESPACES):
            scope: str = "workbook"
            local_sheet_id: str | None = node.attrib.get("localSheetId")
            if local_sheet_id is not None:
                scope = sheet_slug_by_position.get(int(local_sheet_id), "workbook")
            names.append(
                {
                    "name": str(node.attrib["name"]),
                    "scope": scope,
                    "formula": node.text or "",
                    "hidden": node.attrib.get("hidden", "0") in {"1", "true", "True"},
                }
            )
        return names

    def _read_cell_payload(
        self, cell: ET.Element, shared_strings: list[str]
    ) -> ParsedCellPayload:
        cell_type: str = str(cell.attrib.get("t", "n"))
        raw_value: str = ""
        inline_value_parts: list[str] = []
        formula_text: str | None = None
        formula_attributes: dict[str, str] = {}

        for child_node in cell:
            child_name: str = self._local_name(child_node.tag)
            if child_name == "f":
                formula_text = child_node.text or ""
                formula_attributes = {
                    str(key): str(value) for key, value in child_node.attrib.items()
                }
                continue
            if child_name == "v":
                raw_value = child_node.text or ""
                continue
            if child_name == "is":
                for inline_child in child_node:
                    if self._local_name(inline_child.tag) != "t":
                        continue
                    inline_value_parts.append(inline_child.text or "")

        if len(inline_value_parts) > 0:
            return ParsedCellPayload(
                value="".join(inline_value_parts),
                cell_type="inline_string",
                formula_text=formula_text,
                formula_attributes=formula_attributes,
            )
        if cell_type == "s" and raw_value != "":
            return ParsedCellPayload(
                value=shared_strings[int(raw_value)],
                cell_type="shared_string",
                formula_text=formula_text,
                formula_attributes=formula_attributes,
            )
        if cell_type == "b":
            return ParsedCellPayload(
                value="TRUE" if raw_value == "1" else "FALSE",
                cell_type="boolean",
                formula_text=formula_text,
                formula_attributes=formula_attributes,
            )
        if cell_type == "str":
            return ParsedCellPayload(
                value=raw_value,
                cell_type="formula_string",
                formula_text=formula_text,
                formula_attributes=formula_attributes,
            )
        return ParsedCellPayload(
            value=raw_value,
            cell_type="number",
            formula_text=formula_text,
            formula_attributes=formula_attributes,
        )

    def _column_index_from_cell_reference(
        self, *, cell_reference: str, cache: dict[str, int]
    ) -> int:
        column_letters: list[str] = []
        for character in cell_reference:
            if character.isdigit():
                break
            column_letters.append(character.upper())
        if len(column_letters) == 0:
            raise ValueError(f"Invalid cell reference: {cell_reference}")
        column_letter_key: str = "".join(column_letters)
        cached_column_index: int | None = cache.get(column_letter_key)
        if cached_column_index is not None:
            return cached_column_index
        column_index: int = column_letter_to_index(column_letter=column_letter_key)
        cache[column_letter_key] = column_index
        return column_index

    def _infer_column_type(self, data_rows: list[list[str]], column_index: int) -> str:
        non_empty_values: list[str] = [
            row[column_index]
            for row in data_rows
            if column_index < len(row) and row[column_index] != ""
        ]
        if not non_empty_values:
            return "string"
        if all(value.isdigit() for value in non_empty_values):
            return "integer"
        try:
            for value in non_empty_values:
                float(value)
            return "number"
        except ValueError:
            return "string"

    def _infer_streamed_column_type(self, column_stats: dict[str, bool] | None) -> str:
        if column_stats is None or not column_stats.get("seen_non_empty", False):
            return "string"
        if column_stats.get("all_digit", False):
            return "integer"
        if column_stats.get("all_float", False):
            return "number"
        return "string"

    def _parse_optional_float(self, value: str | None) -> float | None:
        if value is None or value == "":
            return None
        return float(value)

    def _local_name(self, tag: str) -> str:
        if "}" in tag:
            return tag.rsplit("}", maxsplit=1)[-1]
        return tag

    def _infer_column_number_format(
        self, styles: dict[str, dict[str, Any]], column_index: int
    ) -> str:
        column_letter: str = column_index_to_letter(column_index=column_index)
        for cell_reference in sorted(styles.keys()):
            style_entry: dict[str, Any] = styles[cell_reference]
            if (
                cell_reference.startswith(column_letter)
                and "number_format" in style_entry
            ):
                return str(styles[cell_reference]["number_format"])
        return "General"

    def _record_structural_cell(
        self,
        *,
        structural_cells: dict[tuple[int, int], dict[str, Any]],
        row_profiles: dict[int, dict[str, Any]],
        column_profiles: dict[int, dict[str, Any]],
        row_index: int,
        column_index: int,
        value: str,
        cell_type: str,
        number_format: str,
        has_formula: bool,
        has_style: bool,
    ) -> None:
        cell_kind: str = self._classify_structural_cell_kind(
            value=value,
            cell_type=cell_type,
            number_format=number_format,
            has_formula=has_formula,
            has_style=has_style,
        )
        structural_cells[(row_index, column_index)] = {
            "kind": cell_kind,
            "has_formula": has_formula,
            "has_style": has_style,
        }
        row_profile: dict[str, Any] = row_profiles.setdefault(
            row_index,
            self._new_axis_profile(index=row_index),
        )
        column_profile: dict[str, Any] = column_profiles.setdefault(
            column_index,
            self._new_axis_profile(index=column_index),
        )
        self._update_axis_profile(
            profile=row_profile,
            counterpart_index=column_index,
            cell_kind=cell_kind,
            has_formula=has_formula,
            has_style=has_style,
        )
        self._update_axis_profile(
            profile=column_profile,
            counterpart_index=row_index,
            cell_kind=cell_kind,
            has_formula=has_formula,
            has_style=has_style,
        )

    def _new_axis_profile(self, *, index: int) -> dict[str, Any]:
        return {
            "index": index,
            "occupied_count": 0,
            "text_count": 0,
            "number_count": 0,
            "date_count": 0,
            "formula_count": 0,
            "styled_count": 0,
            "merged_count": 0,
            "min_counterpart": None,
            "max_counterpart": None,
        }

    def _update_axis_profile(
        self,
        *,
        profile: dict[str, Any],
        counterpart_index: int,
        cell_kind: str,
        has_formula: bool,
        has_style: bool,
    ) -> None:
        profile["occupied_count"] = int(profile.get("occupied_count", 0)) + 1
        if cell_kind in {"text", "boolean"}:
            profile["text_count"] = int(profile.get("text_count", 0)) + 1
        elif cell_kind == "date":
            profile["date_count"] = int(profile.get("date_count", 0)) + 1
            profile["number_count"] = int(profile.get("number_count", 0)) + 1
        elif cell_kind == "number":
            profile["number_count"] = int(profile.get("number_count", 0)) + 1
        if has_formula:
            profile["formula_count"] = int(profile.get("formula_count", 0)) + 1
        if has_style:
            profile["styled_count"] = int(profile.get("styled_count", 0)) + 1
        current_min: int | None = profile.get("min_counterpart")
        current_max: int | None = profile.get("max_counterpart")
        profile["min_counterpart"] = counterpart_index if current_min is None else min(current_min, counterpart_index)
        profile["max_counterpart"] = counterpart_index if current_max is None else max(current_max, counterpart_index)

    def _classify_structural_cell_kind(
        self,
        *,
        value: str,
        cell_type: str,
        number_format: str,
        has_formula: bool,
        has_style: bool,
    ) -> str:
        if value == "" and has_formula:
            return "formula"
        if value == "" and has_style:
            return "styled_empty"
        normalized_format: str = number_format.lower()
        if cell_type in {"inline_string", "shared_string", "formula_string"}:
            return "text"
        if cell_type == "boolean":
            return "boolean"
        if value == "":
            return "empty"
        if self._looks_like_date_format(normalized_format=normalized_format):
            return "date"
        try:
            float(value)
        except ValueError:
            return "text"
        return "number"

    def _looks_like_date_format(self, *, normalized_format: str) -> bool:
        if normalized_format in {"general", "@"}:
            return False
        return any(token in normalized_format for token in ["yy", "dd", "mm", "hh", "ss"])

    def _apply_merged_ranges_to_structural_cells(
        self,
        *,
        structural_cells: dict[tuple[int, int], dict[str, Any]],
        row_profiles: dict[int, dict[str, Any]],
        column_profiles: dict[int, dict[str, Any]],
        merged_ranges: list[str],
    ) -> None:
        for merge_ref in merged_ranges:
            start_row, end_row, start_col, end_col = self._range_to_bounds(range_ref=merge_ref)
            if start_row <= 0 or start_col <= 0:
                continue
            anchor_cell: dict[str, Any] | None = structural_cells.get((start_row, start_col))
            if anchor_cell is None:
                continue
            for row_index in range(start_row, end_row + 1):
                row_profile: dict[str, Any] = row_profiles.setdefault(
                    row_index,
                    self._new_axis_profile(index=row_index),
                )
                row_profile["merged_count"] = int(row_profile.get("merged_count", 0)) + 1
            for column_index in range(start_col, end_col + 1):
                column_profile: dict[str, Any] = column_profiles.setdefault(
                    column_index,
                    self._new_axis_profile(index=column_index),
                )
                column_profile["merged_count"] = int(column_profile.get("merged_count", 0)) + 1
            cell_area: int = (end_row - start_row + 1) * (end_col - start_col + 1)
            if cell_area > 256:
                continue
            for row_index in range(start_row, end_row + 1):
                for column_index in range(start_col, end_col + 1):
                    if (row_index, column_index) in structural_cells:
                        continue
                    self._record_structural_cell(
                        structural_cells=structural_cells,
                        row_profiles=row_profiles,
                        column_profiles=column_profiles,
                        row_index=row_index,
                        column_index=column_index,
                        value="",
                        cell_type="inline_string",
                        number_format="General",
                        has_formula=False,
                        has_style=True,
                    )

    def _build_sheet_layout_analysis(
        self,
        *,
        sheet_slug: str,
        sheet_name: str,
        data_region: dict[str, int],
        data_region_source: str,
        structural_cells: dict[tuple[int, int], dict[str, Any]],
        row_profiles: dict[int, dict[str, Any]],
        column_profiles: dict[int, dict[str, Any]],
        merged_ranges: list[str],
        tables: list[dict[str, Any]],
    ) -> dict[str, Any]:
        explicit_blocks: list[dict[str, Any]] = self._build_explicit_table_blocks(
            tables=tables
        )
        covered_cells: set[tuple[int, int]] = set()
        for block in explicit_blocks:
            bbox: dict[str, int] = dict(block["bbox"])
            for row_index in range(int(bbox["start_row"]), int(bbox["end_row"]) + 1):
                for column_index in range(int(bbox["start_col"]), int(bbox["end_col"]) + 1):
                    covered_cells.add((row_index, column_index))
        residual_cells: dict[tuple[int, int], dict[str, Any]] = {
            coordinates: dict(cell_payload)
            for coordinates, cell_payload in structural_cells.items()
            if coordinates not in covered_cells
        }
        inferred_blocks: list[dict[str, Any]] = self._segment_residual_blocks(
            structural_cells=residual_cells,
            row_profiles=row_profiles,
            column_profiles=column_profiles,
            merged_ranges=merged_ranges,
        )
        self._apply_inferred_data_region_block_metadata(
            blocks=inferred_blocks,
            data_region=data_region,
            data_region_source=data_region_source,
        )
        blocks: list[dict[str, Any]] = explicit_blocks + inferred_blocks
        row_anchors: list[dict[str, Any]] = self._build_axis_anchors(
            axis="row",
            axis_profiles=row_profiles,
            blocks=blocks,
        )
        column_anchors: list[dict[str, Any]] = self._build_axis_anchors(
            axis="column",
            axis_profiles=column_profiles,
            blocks=blocks,
        )
        self._log_perf_event(
            "sheet_layout_analysis_completed",
            sheet_name=sheet_name,
            sheet_slug=sheet_slug,
            block_count=len(blocks),
            row_anchor_count=len(row_anchors),
            column_anchor_count=len(column_anchors),
            explicit_table_block_count=len(explicit_blocks),
            inferred_block_count=len(inferred_blocks),
        )
        return {
            "anchors": {
                "rows": row_anchors,
                "columns": column_anchors,
            },
            "blocks": blocks,
        }

    def _apply_inferred_data_region_block_metadata(
        self,
        *,
        blocks: list[dict[str, Any]],
        data_region: dict[str, int],
        data_region_source: str,
    ) -> None:
        if data_region_source != "inferred_large_sheet":
            return
        header_row_index: int = int(data_region.get("header_row_index", 0))
        start_row: int = int(data_region.get("start_row", 0))
        end_row: int = int(data_region.get("end_row", 0))
        start_col: int = int(data_region.get("start_col", 0))
        end_col: int = int(data_region.get("end_col", 0))
        if (
            header_row_index <= 0
            or start_row <= 0
            or end_row <= 0
            or start_col <= 0
            or end_col <= 0
        ):
            return
        for block in blocks:
            if str(block.get("type", "")) != "table":
                continue
            bbox: dict[str, Any] = dict(block.get("bbox", {}))
            if (
                int(bbox.get("start_row", 0)) != start_row
                or int(bbox.get("end_row", 0)) != end_row
                or int(bbox.get("start_col", 0)) != start_col
                or int(bbox.get("end_col", 0)) != end_col
            ):
                continue
            block["header_bbox"] = {
                "start_row": header_row_index,
                "end_row": header_row_index,
                "start_col": start_col,
                "end_col": end_col,
            }
            block["data_bbox"] = (
                {
                    "start_row": header_row_index + 1,
                    "end_row": end_row,
                    "start_col": start_col,
                    "end_col": end_col,
                }
                if end_row > header_row_index
                else None
            )
            return

    def _build_explicit_table_blocks(
        self,
        *,
        tables: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        blocks: list[dict[str, Any]] = []
        for table_index, table in enumerate(tables, start=1):
            start_row, end_row, start_col, end_col = self._range_to_bounds(
                range_ref=str(table.get("ref", ""))
            )
            if start_row <= 0 or start_col <= 0:
                continue
            header_row_count: int = int(table.get("header_row_count", 1))
            header_end_row: int = min(end_row, start_row + max(header_row_count, 1) - 1)
            data_start_row: int = min(end_row, header_end_row + 1)
            data_row_count: int = max(end_row - header_end_row, 0)
            blocks.append(
                {
                    "block_id": f"block_table_{table_index}",
                    "type": "table",
                    "source": "excel_table",
                    "confidence": 1.0,
                    "bbox": {
                        "start_row": start_row,
                        "end_row": end_row,
                        "start_col": start_col,
                        "end_col": end_col,
                    },
                    "header_bbox": {
                        "start_row": start_row,
                        "end_row": header_end_row,
                        "start_col": start_col,
                        "end_col": end_col,
                    },
                    "data_bbox": (
                        {
                            "start_row": data_start_row,
                            "end_row": end_row,
                            "start_col": start_col,
                            "end_col": end_col,
                        }
                        if data_row_count > 0
                        else None
                    ),
                    "anchor_rows": [start_row, end_row],
                    "anchor_cols": [start_col, end_col],
                    "cell_count": (end_row - start_row + 1) * (end_col - start_col + 1),
                    "table_name": str(table.get("display_name", table.get("name", f"Table{table_index}"))),
                }
            )
        return blocks

    def _segment_residual_blocks(
        self,
        *,
        structural_cells: dict[tuple[int, int], dict[str, Any]],
        row_profiles: dict[int, dict[str, Any]],
        column_profiles: dict[int, dict[str, Any]],
        merged_ranges: list[str],
    ) -> list[dict[str, Any]]:
        if len(structural_cells) == 0:
            return []
        row_groups: list[tuple[int, int]] = self._build_row_groups(
            structural_cells=structural_cells,
            row_profiles=row_profiles,
        )
        blocks: list[dict[str, Any]] = []
        block_counter: int = 1
        for row_start, row_end in row_groups:
            cols_in_rows: set[int] = {
                column_index
                for (row_index, column_index) in structural_cells.keys()
                if row_start <= row_index <= row_end
            }
            for col_start, col_end in self._cluster_indices(indices=sorted(cols_in_rows)):
                block_cells: list[tuple[int, int]] = [
                    coordinates
                    for coordinates in structural_cells.keys()
                    if row_start <= coordinates[0] <= row_end
                    and col_start <= coordinates[1] <= col_end
                ]
                if len(block_cells) == 0:
                    continue
                bbox: dict[str, int] = {
                    "start_row": min(row_index for row_index, _ in block_cells),
                    "end_row": max(row_index for row_index, _ in block_cells),
                    "start_col": min(column_index for _, column_index in block_cells),
                    "end_col": max(column_index for _, column_index in block_cells),
                }
                block_type: str = self._classify_inferred_block(
                    bbox=bbox,
                    structural_cells=structural_cells,
                    row_profiles=row_profiles,
                    merged_ranges=merged_ranges,
                )
                blocks.append(
                    {
                        "block_id": f"block_inferred_{block_counter}",
                        "type": block_type,
                        "source": "structural_anchor_inference",
                        "confidence": self._estimate_block_confidence(
                            block_type=block_type,
                            cell_count=len(block_cells),
                        ),
                        "bbox": bbox,
                        "header_bbox": bbox if block_type == "title" else None,
                        "data_bbox": bbox if block_type == "table" else None,
                        "anchor_rows": [bbox["start_row"], bbox["end_row"]],
                        "anchor_cols": [bbox["start_col"], bbox["end_col"]],
                        "cell_count": len(block_cells),
                    }
                )
                block_counter += 1
        return blocks

    def _build_row_groups(
        self,
        *,
        structural_cells: dict[tuple[int, int], dict[str, Any]],
        row_profiles: dict[int, dict[str, Any]],
    ) -> list[tuple[int, int]]:
        rows: list[int] = sorted({row_index for row_index, _ in structural_cells.keys()})
        if len(rows) == 0:
            return []
        groups: list[tuple[int, int]] = []
        group_start: int = rows[0]
        previous_row: int = rows[0]
        for row_index in rows[1:]:
            if row_index > previous_row + 1:
                groups.append((group_start, previous_row))
                group_start = row_index
                previous_row = row_index
                continue
            if self._should_split_row_group(
                current_row=previous_row,
                next_row=row_index,
                row_profiles=row_profiles,
            ):
                groups.append((group_start, previous_row))
                group_start = row_index
            previous_row = row_index
        groups.append((group_start, previous_row))
        return groups

    def _should_split_row_group(
        self,
        *,
        current_row: int,
        next_row: int,
        row_profiles: dict[int, dict[str, Any]],
    ) -> bool:
        current_profile: dict[str, Any] = row_profiles.get(current_row, {})
        next_profile: dict[str, Any] = row_profiles.get(next_row, {})
        current_count: int = int(current_profile.get("occupied_count", 0))
        next_count: int = int(next_profile.get("occupied_count", 0))
        current_number_count: int = int(current_profile.get("number_count", 0))
        current_text_count: int = int(current_profile.get("text_count", 0))
        has_merged_signal: bool = int(current_profile.get("merged_count", 0)) > 0
        merged_title_like: bool = (
            has_merged_signal
            and current_number_count == 0
            and current_text_count > 0
        )
        current_is_title_like: bool = (
            merged_title_like
            or (
                current_count > 0
                and current_number_count == 0
                and current_count <= 2
            )
        )
        if not current_is_title_like:
            return False
        if merged_title_like and next_count >= 2:
            return True
        return next_count >= max(current_count + 2, 3)

    def _cluster_indices(self, *, indices: list[int]) -> list[tuple[int, int]]:
        if len(indices) == 0:
            return []
        groups: list[tuple[int, int]] = []
        group_start: int = indices[0]
        previous_index: int = indices[0]
        for index in indices[1:]:
            if index > previous_index + 1:
                groups.append((group_start, previous_index))
                group_start = index
            previous_index = index
        groups.append((group_start, previous_index))
        return groups

    def _classify_inferred_block(
        self,
        *,
        bbox: dict[str, int],
        structural_cells: dict[tuple[int, int], dict[str, Any]],
        row_profiles: dict[int, dict[str, Any]],
        merged_ranges: list[str],
    ) -> str:
        height: int = int(bbox["end_row"]) - int(bbox["start_row"]) + 1
        width: int = int(bbox["end_col"]) - int(bbox["start_col"]) + 1
        block_cells: list[dict[str, Any]] = [
            cell_payload
            for (row_index, column_index), cell_payload in structural_cells.items()
            if int(bbox["start_row"]) <= row_index <= int(bbox["end_row"])
            and int(bbox["start_col"]) <= column_index <= int(bbox["end_col"])
        ]
        text_count: int = sum(1 for cell_payload in block_cells if cell_payload.get("kind") in {"text", "boolean"})
        number_count: int = sum(1 for cell_payload in block_cells if cell_payload.get("kind") in {"number", "date"})
        first_row_profile: dict[str, Any] = row_profiles.get(int(bbox["start_row"]), {})
        has_merged_title_signal: bool = int(first_row_profile.get("merged_count", 0)) > 0 or any(
            self._range_intersects_bbox(range_ref=merge_ref, bbox=bbox)
            for merge_ref in merged_ranges
        )
        if height <= 2 and number_count == 0 and (has_merged_title_signal or text_count > 0):
            return "title"
        if width >= 2 and height >= 2 and (number_count > 0 or text_count >= width):
            return "table"
        if text_count >= number_count:
            return "note"
        return "mixed_unknown"

    def _estimate_block_confidence(self, *, block_type: str, cell_count: int) -> float:
        if block_type == "table":
            return 0.85 if cell_count >= 4 else 0.7
        if block_type == "title":
            return 0.75
        if block_type == "note":
            return 0.6
        return 0.5

    def _build_axis_anchors(
        self,
        *,
        axis: str,
        axis_profiles: dict[int, dict[str, Any]],
        blocks: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        anchor_map: dict[int, set[str]] = {}
        for block in blocks:
            bbox: dict[str, int] = dict(block["bbox"])
            if axis == "row":
                indexes: list[int] = [int(bbox["start_row"]), int(bbox["end_row"])]
            else:
                indexes = [int(bbox["start_col"]), int(bbox["end_col"])]
            for index in indexes:
                reasons: set[str] = anchor_map.setdefault(index, set())
                reasons.add("block_edge")
                if str(block.get("type")) == "table":
                    reasons.add("table_boundary")
        active_indexes: list[int] = sorted(axis_profiles.keys())
        for previous_index, current_index in zip(active_indexes, active_indexes[1:]):
            if current_index > previous_index + 1:
                anchor_map.setdefault(previous_index, set()).add("blank_gap")
                anchor_map.setdefault(current_index, set()).add("blank_gap")
        anchors: list[dict[str, Any]] = []
        for index in sorted(anchor_map.keys()):
            reasons_list: list[str] = sorted(anchor_map[index])
            profile: dict[str, Any] = axis_profiles.get(index, {})
            if int(profile.get("merged_count", 0)) > 0:
                reasons_list.append("merged_structure")
            anchors.append(
                {
                    "index": index,
                    "score": len(set(reasons_list)),
                    "reasons": sorted(set(reasons_list)),
                    "occupied_count": int(profile.get("occupied_count", 0)),
                }
            )
        return anchors

    def _range_to_bounds(self, *, range_ref: str) -> tuple[int, int, int, int]:
        normalized_ref: str = str(range_ref).strip()
        if normalized_ref == "":
            return 0, 0, 0, 0
        start_ref: str
        end_ref: str
        if ":" in normalized_ref:
            start_ref, end_ref = normalized_ref.split(":", maxsplit=1)
        else:
            start_ref = normalized_ref
            end_ref = normalized_ref
        start_row, start_col = cell_reference_to_coordinates(cell_reference=start_ref)
        end_row, end_col = cell_reference_to_coordinates(cell_reference=end_ref)
        return min(start_row, end_row), max(start_row, end_row), min(start_col, end_col), max(start_col, end_col)

    def _range_intersects_bbox(
        self,
        *,
        range_ref: str,
        bbox: dict[str, int],
    ) -> bool:
        start_row, end_row, start_col, end_col = self._range_to_bounds(range_ref=range_ref)
        return not (
            end_row < int(bbox["start_row"])
            or start_row > int(bbox["end_row"])
            or end_col < int(bbox["start_col"])
            or start_col > int(bbox["end_col"])
        )

    def _write_sheet_files(
        self, workspace: WorkspacePaths, parsed_sheet: ParsedSheet
    ) -> None:
        sheet_dir: Path = workspace.sheets_dir / parsed_sheet.slug
        ensure_directory(path=sheet_dir)
        structure_payload: dict[str, Any] = dict(parsed_sheet.structure)
        region_bundle: dict[str, Any] = build_region_bundle(
            sheet_slug=parsed_sheet.slug,
            sheet_name=parsed_sheet.name,
            blocks=list(structure_payload.get("sheet_blocks", [])),
            cell_values=dict(parsed_sheet.cell_values),
            merged_ranges=list(structure_payload.get("merged_ranges", [])),
        )
        compressed_layout_payload: dict[str, Any] = {}
        aggregated_values_payload: dict[str, Any] = {}
        if self._is_debug_mode():
            compressed_layout_payload = build_compressed_layout(
                sheet_slug=parsed_sheet.slug,
                sheet_name=parsed_sheet.name,
                dimensions=dict(structure_payload.get("dimensions", {})),
                structural_cells=self._build_structural_cells_from_payload(
                    structure_payload=structure_payload,
                    cell_values=dict(parsed_sheet.cell_values),
                    cell_metadata=dict(parsed_sheet.cell_metadata),
                ),
                cell_values=dict(parsed_sheet.cell_values),
                anchors=dict(structure_payload.get("structural_anchors", {})),
                blocks=list(structure_payload.get("sheet_blocks", [])),
                merged_ranges=list(structure_payload.get("merged_ranges", [])),
                k=self._anchor_prune_k,
            )
            aggregated_values_payload = build_aggregated_sheet_values(
                sheet_slug=parsed_sheet.slug,
                sheet_name=parsed_sheet.name,
                regions=list(region_bundle["regions"]),
                cell_values=dict(parsed_sheet.cell_values),
                cell_metadata=dict(parsed_sheet.cell_metadata),
                merged_ranges=list(structure_payload.get("merged_ranges", [])),
            )
        structure_payload["primary_region_id"] = region_bundle["index"].get("primary_region_id")
        write_yaml_file(
            path=sheet_dir / SHEET_STRUCTURE_YAML, payload=structure_payload
        )
        if self._is_debug_mode():
            write_yaml_file(
                path=sheet_dir / SHEET_COMPRESSED_LAYOUT_YAML,
                payload=compressed_layout_payload,
            )
            write_yaml_file(
                path=sheet_dir / SHEET_AGGREGATED_VALUES_YAML,
                payload=aggregated_values_payload,
            )
        write_yaml_file(
            path=sheet_dir / SHEET_FORMULAS_YAML,
            payload={
                "version": "1",
                "sheet_slug": parsed_sheet.slug,
                "formula_count": parsed_sheet.formula_count,
                "formulas": [],
                "formulas_index": parsed_sheet.formula_index,
            },
        )
        write_yaml_file(
            path=sheet_dir / SHEET_VALIDATIONS_YAML,
            payload={
                "version": "1",
                "sheet_slug": parsed_sheet.slug,
                "validations": parsed_sheet.validations,
            },
        )
        write_yaml_file(
            path=sheet_dir / "tables.yaml",
            payload={
                "version": "1",
                "sheet_slug": parsed_sheet.slug,
                "tables": parsed_sheet.tables,
            },
        )
        write_yaml_file(
            path=sheet_dir / SHEET_STYLES_YAML,
            payload=dict(parsed_sheet.styles_payload),
        )
        write_yaml_file(
            path=sheet_dir / "regions.yaml",
            payload=dict(region_bundle["index"]),
        )
        write_region_data_bundle(
            path=sheet_dir / "data_bundle.txt",
            sections=list(region_bundle["bundle_sections"]),
        )
        write_yaml_file(
            path=sheet_dir / "summary.yaml",
            payload=self._build_sheet_summary(
                parsed_sheet=parsed_sheet,
                structure_payload=structure_payload,
                region_index_payload=dict(region_bundle["index"]),
                compressed_layout_payload=compressed_layout_payload,
                aggregated_values_payload=aggregated_values_payload,
            ),
        )
        if self._is_debug_mode():
            observability_payload: dict[str, Any] = self._build_sheet_observability_report(
                parsed_sheet=parsed_sheet,
                structure_payload=structure_payload,
                region_index_payload=dict(region_bundle["index"]),
                compressed_layout_payload=compressed_layout_payload,
                aggregated_values_payload=aggregated_values_payload,
            )
            write_yaml_file(
                path=sheet_dir / SHEET_OBSERVABILITY_REPORT_YAML,
                payload=observability_payload,
            )
            write_markdown_file(
                path=sheet_dir / SHEET_OBSERVABILITY_REPORT_MD,
                content=self._build_sheet_observability_markdown(observability_payload),
            )

    def _build_sheet_summary(
        self,
        parsed_sheet: ParsedSheet,
        *,
        structure_payload: dict[str, Any],
        region_index_payload: dict[str, Any],
        compressed_layout_payload: dict[str, Any],
        aggregated_values_payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "version": "1",
            "sheet_slug": parsed_sheet.slug,
            "sheet_name": parsed_sheet.name,
            "dimensions": dict(structure_payload["dimensions"]),
            "data_region": dict(structure_payload["data_region"]),
            "data_region_source": str(
                structure_payload.get("data_region_source", "none")
            ),
            "header": list(parsed_sheet.header),
            "table_count": len(parsed_sheet.tables),
            "formula_count": parsed_sheet.formula_count,
            "style_count": parsed_sheet.style_count,
            "style_mode": str(parsed_sheet.styles_payload.get("style_mode", "cells")),
            "validation_count": len(parsed_sheet.validations),
            "static_cell_count": parsed_sheet.static_cell_count,
            "static_cells_chunk_count": len(
                structure_payload.get("static_cells_index", [])
            ),
            "formula_chunk_count": len(parsed_sheet.formula_index),
            "style_chunk_count": len(parsed_sheet.style_index),
            "style_override_chunk_count": len(
                parsed_sheet.styles_payload.get("row_run_overrides_index", [])
            ),
            "sheet_block_count": len(structure_payload.get("sheet_blocks", [])),
            "sheet_block_types": [
                str(block.get("type", "unknown"))
                for block in list(structure_payload.get("sheet_blocks", []))
            ],
            "region_count": int(region_index_payload.get("region_count", 0)),
            "primary_region_id": region_index_payload.get("primary_region_id"),
            "region_types": [
                str(region.get("type", "unknown"))
                for region in list(region_index_payload.get("regions", []))
            ],
            "row_anchor_count": len(
                dict(structure_payload.get("structural_anchors", {})).get("rows", [])
            ),
            "column_anchor_count": len(
                dict(structure_payload.get("structural_anchors", {})).get(
                    "columns", []
                )
            ),
            "anchor_prune_k": int(
                compressed_layout_payload.get("k", self._anchor_prune_k)
            ),
            "compressed_row_count": int(
                dict(compressed_layout_payload.get("compressed_dimensions", {})).get(
                    "row_count", 0
                )
            ),
            "compressed_col_count": int(
                dict(compressed_layout_payload.get("compressed_dimensions", {})).get(
                    "col_count", 0
                )
            ),
            "compressed_cell_count": int(
                compressed_layout_payload.get("cell_count", 0)
            ),
            "aggregated_region_count": int(
                aggregated_values_payload.get("region_count", 0)
            ),
            "aggregated_component_count": int(
                aggregated_values_payload.get("aggregated_component_count", 0)
            ),
            "aggregated_span_count": int(
                aggregated_values_payload.get("aggregated_span_count", 0)
            ),
            "text_object_count": int(
                aggregated_values_payload.get("text_object_count", 0)
            ),
            "merged_object_count": int(
                aggregated_values_payload.get("merged_object_count", 0)
            ),
            "sample_static_cells": dict(parsed_sheet.static_cells_sample),
        }

    def _build_sheet_observability_report(
        self,
        parsed_sheet: ParsedSheet,
        *,
        structure_payload: dict[str, Any],
        region_index_payload: dict[str, Any],
        compressed_layout_payload: dict[str, Any],
        aggregated_values_payload: dict[str, Any],
    ) -> dict[str, Any]:
        dimensions: dict[str, Any] = dict(structure_payload.get("dimensions", {}))
        max_row: int = int(dimensions.get("max_row", 0))
        max_col: int = int(dimensions.get("max_col", 0))
        total_grid_capacity: int = max(max_row, 0) * max(max_col, 0)
        structural_cell_count: int = len(parsed_sheet.cell_values)
        merged_ranges: list[str] = [str(value) for value in structure_payload.get("merged_ranges", [])]
        blocks: list[dict[str, Any]] = [dict(item) for item in structure_payload.get("sheet_blocks", [])]
        regions: list[dict[str, Any]] = [dict(item) for item in region_index_payload.get("regions", [])]
        compressed_cell_count: int = int(compressed_layout_payload.get("cell_count", 0))
        compressed_row_count: int = int(
            dict(compressed_layout_payload.get("compressed_dimensions", {})).get("row_count", 0)
        )
        compressed_col_count: int = int(
            dict(compressed_layout_payload.get("compressed_dimensions", {})).get("col_count", 0)
        )
        aggregated_region_count: int = int(aggregated_values_payload.get("region_count", 0))
        aggregated_component_count: int = int(aggregated_values_payload.get("aggregated_component_count", 0))
        aggregated_span_count: int = int(aggregated_values_payload.get("aggregated_span_count", 0))
        text_object_count: int = int(aggregated_values_payload.get("text_object_count", 0))
        merged_object_count: int = int(aggregated_values_payload.get("merged_object_count", 0))
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
        fragmented_row_run_count: int = self._count_fragmented_single_row_runs(regions)
        block_overview: list[dict[str, Any]] = []
        for block in blocks:
            bbox: dict[str, Any] = dict(block.get("bbox", {}))
            block_overview.append(
                {
                    "block_id": str(block.get("block_id", "")),
                    "type": str(block.get("type", "unknown")),
                    "source": str(block.get("source", "unknown")),
                    "confidence": float(block.get("confidence", 0.0)),
                    "height": max(
                        int(bbox.get("end_row", 0)) - int(bbox.get("start_row", 0)) + 1,
                        0,
                    ),
                    "width": max(
                        int(bbox.get("end_col", 0)) - int(bbox.get("start_col", 0)) + 1,
                        0,
                    ),
                    "bbox": bbox,
                }
            )
        observations: list[str] = []
        if total_grid_capacity > 0 and compressed_cell_count > 0:
            ratio: float = compressed_cell_count / total_grid_capacity
            if ratio <= 0.35:
                observations.append("compressed_layout keeps a relatively small structural subset of the full grid")
            else:
                observations.append("compressed_layout keeps a large portion of the sheet, so structural compression is limited on this sheet")
        if len(one_row_non_table_regions) >= 3 and fragmented_row_run_count >= 1:
            observations.append("region detection looks fragmented: multiple consecutive one-row non-table regions were produced")
        if aggregated_component_count > 0 and aggregated_span_count >= aggregated_component_count:
            observations.append("aggregation is active, but component/span counts suggest mostly shallow grouping rather than strong consolidation")
        observations.append("wiki output is a normalized editable workspace, not a storage-compressed archive, so total file size can grow even when structural summaries become smaller")
        return {
            "version": "1",
            "sheet_slug": parsed_sheet.slug,
            "sheet_name": parsed_sheet.name,
            "source_grid": {
                "max_row": max_row,
                "max_col": max_col,
                "grid_capacity": total_grid_capacity,
                "populated_cell_count": structural_cell_count,
                "formula_count": parsed_sheet.formula_count,
                "style_count": parsed_sheet.style_count,
                "static_cell_count": parsed_sheet.static_cell_count,
                "merged_range_count": len(merged_ranges),
            },
            "region_detection": {
                "block_count": len(blocks),
                "region_count": len(regions),
                "primary_region_id": region_index_payload.get("primary_region_id"),
                "block_type_counts": self._count_block_types(blocks),
                "one_row_non_table_region_count": len(one_row_non_table_regions),
                "fragmented_single_row_run_count": fragmented_row_run_count,
                "one_row_non_table_regions": one_row_non_table_regions[:12],
                "block_overview": block_overview,
            },
            "compression": {
                "anchor_prune_k": int(compressed_layout_payload.get("k", self._anchor_prune_k)),
                "compressed_row_count": compressed_row_count,
                "compressed_col_count": compressed_col_count,
                "compressed_cell_count": compressed_cell_count,
                "row_ratio": self._safe_ratio(compressed_row_count, max_row),
                "col_ratio": self._safe_ratio(compressed_col_count, max_col),
                "cell_ratio_vs_grid_capacity": self._safe_ratio(
                    compressed_cell_count, total_grid_capacity
                ),
                "cell_ratio_vs_populated_cells": self._safe_ratio(
                    compressed_cell_count, structural_cell_count
                ),
            },
            "aggregation": {
                "aggregated_region_count": aggregated_region_count,
                "aggregated_component_count": aggregated_component_count,
                "aggregated_span_count": aggregated_span_count,
                "text_object_count": text_object_count,
                "merged_object_count": merged_object_count,
                "component_per_region_ratio": self._safe_ratio(
                    aggregated_component_count, aggregated_region_count
                ),
                "span_per_component_ratio": self._safe_ratio(
                    aggregated_span_count, aggregated_component_count
                ),
            },
            "readability_notes": {
                "storage_note": "The wiki workspace is a normalized editable representation. It favors inspectability and round-trip safety over archive-size minimization.",
                "how_to_read": [
                    "Use regions.yaml to inspect whether the sheet was segmented sensibly.",
                    "Use compressed_layout.yaml to see how much of the original grid survived anchor-pruned structural compression.",
                    "Use aggregated_values.yaml to inspect numeric grouping and span aggregation behavior.",
                    "Use this report to spot fragmentation and weak compression without manually reading every artifact.",
                ],
            },
            "observations": observations,
        }

    def _build_sheet_observability_markdown(
        self,
        observability_payload: dict[str, Any],
    ) -> str:
        source_grid: dict[str, Any] = dict(observability_payload.get("source_grid", {}))
        region_detection: dict[str, Any] = dict(
            observability_payload.get("region_detection", {})
        )
        compression: dict[str, Any] = dict(observability_payload.get("compression", {}))
        aggregation: dict[str, Any] = dict(observability_payload.get("aggregation", {}))
        lines: list[str] = [
            f"# {observability_payload.get('sheet_name', observability_payload.get('sheet_slug', 'Sheet'))} Observability",
            "",
            "## Quick Verdict",
            "",
        ]
        for observation in list(observability_payload.get("observations", [])):
            lines.append(f"- {observation}")
        lines.extend(
            [
                "",
                "## Source Grid",
                "",
                f"- Grid capacity: {int(source_grid.get('grid_capacity', 0))}",
                f"- Populated cells: {int(source_grid.get('populated_cell_count', 0))}",
                f"- Formulas: {int(source_grid.get('formula_count', 0))}",
                f"- Styles: {int(source_grid.get('style_count', 0))}",
                f"- Static cells: {int(source_grid.get('static_cell_count', 0))}",
                f"- Merged ranges: {int(source_grid.get('merged_range_count', 0))}",
                "",
                "## Region Detection",
                "",
                f"- Blocks: {int(region_detection.get('block_count', 0))}",
                f"- Regions: {int(region_detection.get('region_count', 0))}",
                f"- Primary region: {region_detection.get('primary_region_id')}",
                f"- One-row non-table regions: {int(region_detection.get('one_row_non_table_region_count', 0))}",
                f"- Fragmented single-row runs: {int(region_detection.get('fragmented_single_row_run_count', 0))}",
                "",
                "## Compression",
                "",
                f"- Anchor prune k: {int(compression.get('anchor_prune_k', 0))}",
                f"- Compressed rows: {int(compression.get('compressed_row_count', 0))}",
                f"- Compressed cols: {int(compression.get('compressed_col_count', 0))}",
                f"- Compressed cells: {int(compression.get('compressed_cell_count', 0))}",
                f"- Row ratio: {self._format_ratio(compression.get('row_ratio'))}",
                f"- Col ratio: {self._format_ratio(compression.get('col_ratio'))}",
                f"- Cell ratio vs grid: {self._format_ratio(compression.get('cell_ratio_vs_grid_capacity'))}",
                f"- Cell ratio vs populated cells: {self._format_ratio(compression.get('cell_ratio_vs_populated_cells'))}",
                "",
                "## Aggregation",
                "",
                f"- Aggregated regions: {int(aggregation.get('aggregated_region_count', 0))}",
                f"- Aggregated components: {int(aggregation.get('aggregated_component_count', 0))}",
                f"- Aggregated spans: {int(aggregation.get('aggregated_span_count', 0))}",
                f"- Text objects: {int(aggregation.get('text_object_count', 0))}",
                f"- Merged objects: {int(aggregation.get('merged_object_count', 0))}",
                f"- Components per region: {self._format_ratio(aggregation.get('component_per_region_ratio'))}",
                f"- Spans per component: {self._format_ratio(aggregation.get('span_per_component_ratio'))}",
                "",
                "## Storage Note",
                "",
                f"- {dict(observability_payload.get('readability_notes', {})).get('storage_note', '')}",
            ]
        )
        return "\n".join(lines) + "\n"

    def _count_block_types(self, blocks: list[dict[str, Any]]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for block in blocks:
            block_type: str = str(block.get("type", "unknown"))
            counts[block_type] = counts.get(block_type, 0) + 1
        return counts

    def _count_fragmented_single_row_runs(
        self,
        regions: list[dict[str, Any]],
    ) -> int:
        ordered_regions: list[dict[str, Any]] = sorted(
            [dict(region) for region in regions],
            key=lambda region: (
                int(dict(region.get("bbox", {})).get("start_row", 0)),
                int(dict(region.get("bbox", {})).get("start_col", 0)),
            ),
        )
        current_run: int = 0
        fragmented_runs: int = 0
        previous_end_row: int | None = None
        previous_type: str | None = None
        for region in ordered_regions:
            bbox: dict[str, Any] = dict(region.get("bbox", {}))
            start_row: int = int(bbox.get("start_row", 0))
            end_row: int = int(bbox.get("end_row", 0))
            region_type: str = str(region.get("type", "unknown"))
            is_single_row_non_table: bool = (
                region_type != "table"
                and start_row > 0
                and start_row == end_row
            )
            if (
                is_single_row_non_table
                and previous_end_row is not None
                and start_row == previous_end_row + 1
                and previous_type != "table"
            ):
                current_run += 1
            elif is_single_row_non_table:
                current_run = 1
            else:
                if current_run >= 3:
                    fragmented_runs += 1
                current_run = 0
            previous_end_row = end_row if end_row > 0 else previous_end_row
            previous_type = region_type
        if current_run >= 3:
            fragmented_runs += 1
        return fragmented_runs

    def _safe_ratio(self, numerator: int, denominator: int) -> float | None:
        if denominator <= 0:
            return None
        return numerator / denominator

    def _format_ratio(self, value: Any) -> str:
        if value is None:
            return "n/a"
        return f"{float(value):.2%}"

    def _build_structural_cells_from_payload(
        self,
        *,
        structure_payload: dict[str, Any],
        cell_values: dict[tuple[int, int], str],
        cell_metadata: dict[tuple[int, int], dict[str, str]],
    ) -> dict[tuple[int, int], dict[str, Any]]:
        structural_cells: dict[tuple[int, int], dict[str, Any]] = {}
        for (row_index, col_index), value in cell_values.items():
            metadata: dict[str, str] = dict(cell_metadata.get((row_index, col_index), {}))
            number_format: str = str(metadata.get("number_format", "General"))
            structural_cells[(row_index, col_index)] = {
                "kind": self._classify_structural_cell_kind(
                    value=value,
                    cell_type=str(metadata.get("cell_type", "")),
                    number_format=number_format,
                    has_formula=False,
                    has_style=number_format != "General",
                ),
                "has_formula": False,
                "has_style": number_format != "General",
            }
        for merge_ref in list(structure_payload.get("merged_ranges", [])):
            start_row, end_row, start_col, end_col = self._range_to_bounds(
                range_ref=merge_ref
            )
            for row_index in range(start_row, end_row + 1):
                for col_index in range(start_col, end_col + 1):
                    structural_cells.setdefault(
                        (row_index, col_index),
                        {
                            "kind": "styled_empty",
                            "has_formula": False,
                            "has_style": True,
                        },
                    )
        return structural_cells

    def _build_workbook_overview(
        self, parsed_sheets: list[ParsedSheet], display_name: str
    ) -> str:
        lines: list[str] = [f"# {display_name}", "", "## Sheets", ""]
        for sheet in parsed_sheets:
            lines.append(
                f"- `{sheet.name}`: {sheet.data_row_count + 1} rows, {len(sheet.header)} columns"
            )
        return "\n".join(lines) + "\n"

    def _build_index(self, parsed_sheets: list[ParsedSheet], display_name: str) -> str:
        lines: list[str] = [f"# Index for {display_name}", "", "## Sheets", ""]
        for sheet in parsed_sheets:
            lines.append(
                f"- [sheets/{sheet.slug}/{SHEET_OVERVIEW_MD}](sheets/{sheet.slug}/{SHEET_OVERVIEW_MD}) - {sheet.name}"
            )
        lines.extend(
            [
                "",
                "## Workbook Metadata",
                "",
                "- Named ranges: `wiki/names.yaml`",
                "- Stylesheet: `wiki/style_sheet.xml`",
                "",
                "## Status",
                "",
                "- Latest check: `wiki/checks/latest_check.json`",
            ]
        )
        return "\n".join(lines) + "\n"

    def _build_log(self, source_filename: str, parsed_sheets: list[ParsedSheet]) -> str:
        lines: list[str] = [f"## [{current_timestamp()}] import | {source_filename}"]
        lines.append("- created workspace")
        for sheet in parsed_sheets:
            lines.append(f"- generated {sheet.name} ({sheet.data_row_count + 1} rows)")
        return "\n".join(lines) + "\n"

    def _build_sheet_overview(self, parsed_sheet: ParsedSheet) -> str:
        lines: list[str] = [
            f"# {parsed_sheet.name}",
            "",
            "## Purpose",
            "",
            "- Imported worksheet.",
            "",
            "## Columns",
            "",
        ]
        if parsed_sheet.header:
            for column in parsed_sheet.header:
                lines.append(f"- {column}")
        else:
            lines.append("- No tabular data region was imported for this sheet.")
        lines.extend(
            [
                "",
                "## Formula Summary",
                "",
                f"- Formula cells: {parsed_sheet.formula_count}",
                f"- Merge ranges: {len(parsed_sheet.structure['merged_ranges'])}",
                f"- Validation rules: {len(parsed_sheet.validations)}",
                f"- Tables: {len(parsed_sheet.tables)}",
                f"- Styled cells: {parsed_sheet.style_count}",
                "",
                "## Warnings",
                "",
                "- None",
            ]
        )
        return "\n".join(lines) + "\n"

    def _build_data_preview(self, parsed_sheet: ParsedSheet) -> str:
        preview_rows: list[list[str]] = parsed_sheet.preview_rows[: self._preview_rows]
        lines: list[str] = [
            f"# {parsed_sheet.name} Preview",
            "",
            f"- Row count: {parsed_sheet.data_row_count}",
            f"- Column count: {len(parsed_sheet.header)}",
            "",
            "## Sample",
            "",
        ]
        if not parsed_sheet.header:
            lines.extend(
                [
                    "No tabular data region was imported for this sheet.",
                    "",
                    f"`{SHEET_STRUCTURE_YAML}`, `{SHEET_STYLES_YAML}`, and worksheet relationships preserve the sheet layout.",
                ]
            )
            return "\n".join(lines) + "\n"
        lines.append("| " + " | ".join(parsed_sheet.header) + " |")
        lines.append("| " + " | ".join(["---"] * len(parsed_sheet.header)) + " |")
        for row in preview_rows:
            lines.append(
                "| " + " | ".join(value if value != "" else " " for value in row) + " |"
            )
        lines.extend(["", "`regions/<region-id>/data.tsv` is the primary region data file."])
        return "\n".join(lines) + "\n"

    def _is_debug_mode(self) -> bool:
        return self._import_mode == "debug"


def ensure_sheet_secondary_files(
    workspace_path: Path,
    sheet_slug: str,
    *,
    preview_rows: int = 10,
) -> None:
    sheet_dir: Path = workspace_path / "wiki" / "sheets" / sheet_slug
    summary_path: Path = sheet_dir / "summary.yaml"
    if not summary_path.exists():
        return
    summary_payload: dict[str, Any] = read_yaml_file(path=summary_path)
    overview_path: Path = sheet_dir / SHEET_OVERVIEW_MD
    if not overview_path.exists():
        write_markdown_file(
            path=overview_path,
            content=_build_sheet_overview_from_summary(summary_payload),
        )
    preview_path: Path = sheet_dir / SHEET_DATA_PREVIEW_MD
    if not preview_path.exists():
        header, data_rows = load_primary_tabular_data(
            sheet_dir=sheet_dir,
            summary_payload=summary_payload,
        )
        write_markdown_file(
            path=preview_path,
            content=_build_sheet_preview_from_summary(
                summary_payload=summary_payload,
                header=header,
                data_rows=data_rows[:preview_rows],
            ),
        )


def _build_sheet_overview_from_summary(summary_payload: dict[str, Any]) -> str:
    header: list[str] = [str(value) for value in summary_payload.get("header", [])]
    lines: list[str] = [
        f"# {summary_payload.get('sheet_name', summary_payload.get('sheet_slug', 'Sheet'))}",
        "",
        "## Purpose",
        "",
        "- Imported worksheet.",
        "",
        "## Columns",
        "",
    ]
    if len(header) > 0:
        for column in header:
            lines.append(f"- {column}")
    else:
        lines.append("- No tabular data region was imported for this sheet.")
    lines.extend(
        [
            "",
            "## Formula Summary",
            "",
            f"- Formula cells: {int(summary_payload.get('formula_count', 0))}",
            f"- Validation rules: {int(summary_payload.get('validation_count', 0))}",
            f"- Tables: {int(summary_payload.get('table_count', 0))}",
            f"- Styled cells: {int(summary_payload.get('style_count', 0))}",
            "",
            "## Warnings",
            "",
            "- None",
        ]
    )
    return "\n".join(lines) + "\n"


def _build_sheet_preview_from_summary(
    summary_payload: dict[str, Any],
    header: list[str],
    data_rows: list[list[str]],
) -> str:
    row_count: int = 0
    data_region: dict[str, Any] = dict(summary_payload.get("data_region", {}))
    header_row_index: int = int(data_region.get("header_row_index", 0))
    end_row: int = int(data_region.get("end_row", 0))
    if header_row_index > 0 and end_row > 0:
        row_count = max(end_row - header_row_index, 0)
    lines: list[str] = [
        f"# {summary_payload.get('sheet_name', summary_payload.get('sheet_slug', 'Sheet'))} Preview",
        "",
        f"- Row count: {row_count}",
        f"- Column count: {len(header)}",
        "",
        "## Sample",
        "",
    ]
    if len(header) == 0:
        lines.extend(
            [
                "No tabular data region was imported for this sheet.",
                "",
                f"`{SHEET_STRUCTURE_YAML}`, `{SHEET_STYLES_YAML}`, and worksheet relationships preserve the sheet layout.",
            ]
        )
        return "\n".join(lines) + "\n"
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join(["---"] * len(header)) + " |")
    for row in data_rows:
        lines.append(
            "| " + " | ".join(value if value != "" else " " for value in row) + " |"
        )
    lines.extend(["", "`regions/<region-id>/data.tsv` is the primary region data file."])
    return "\n".join(lines) + "\n"
