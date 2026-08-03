"""Validate wiki workspace consistency."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from xlsx_skill_runtime.common import (
    cell_reference_to_coordinates,
    coordinates_to_cell_reference,
    current_timestamp,
)
from xlsx_skill_runtime.contracts import ValidationIssue, ValidationSummary
from xlsx_skill_runtime.region_artifacts import load_primary_tabular_data
from xlsx_skill_runtime.wiki_files import (
    read_chunked_cell_mapping,
    read_chunked_records,
    read_region_data_bundle_section,
    read_tsv_file,
    read_yaml_file,
    write_json_file,
)

SHEET_STRUCTURE_FILE = "structure.yaml"
SHEET_COMPRESSED_LAYOUT_FILE = "compressed_layout.yaml"
SHEET_AGGREGATED_VALUES_FILE = "aggregated_values.yaml"
SHEET_FORMULA_FILE = "formulas.yaml"
SHEET_VALIDATION_FILE = "data-validations.yaml"
SHEET_STYLE_FILE = "styles.yaml"


class WikiChecker:
    """Run structural checks over the workspace wiki layer."""

    def run(self, workspace_path: Path, fail_on_warning: bool) -> dict[str, Any]:
        # [ACCEPTANCE]: check_wiki() validates required files, primary region/header consistency, and formula coordinates.
        # [PLANS]: Implement wiki checker.
        errors: list[ValidationIssue] = []
        warnings: list[ValidationIssue] = []
        wiki_dir: Path = workspace_path / "wiki"
        required_files: list[Path] = [wiki_dir / "workbook.yaml", wiki_dir / "names.yaml"]
        for path in required_files:
            if not path.exists():
                errors.append(ValidationIssue(code="MISSING_FILE", path=str(path.relative_to(workspace_path)), message="Required file is missing."))
        workbook_payload: dict[str, Any] = {}
        if not errors:
            workbook_payload = read_yaml_file(path=wiki_dir / "workbook.yaml")
            names_payload: dict[str, Any] = read_yaml_file(path=wiki_dir / "names.yaml")
            style_sheet_path: Path = wiki_dir / "style_sheet.xml"
            if style_sheet_path.exists():
                try:
                    ET.parse(style_sheet_path)
                except ET.ParseError as error:
                    errors.append(ValidationIssue(code="INVALID_STYLE_SHEET", path="wiki/style_sheet.xml", message=str(error)))
            theme_path: Path = wiki_dir / "theme1.xml"
            if theme_path.exists():
                try:
                    ET.parse(theme_path)
                except ET.ParseError as error:
                    errors.append(ValidationIssue(code="INVALID_THEME", path="wiki/theme1.xml", message=str(error)))
            sheet_order: list[str] = [str(item) for item in workbook_payload.get("sheet_order", [])]
            sheet_registry: dict[str, Any] = dict(workbook_payload.get("sheets", {}))
            import_mode: str = str(workbook_payload.get("import_mode", "full")).strip().lower()
            if set(sheet_order) != set(sheet_registry.keys()):
                errors.append(ValidationIssue(code="SHEET_REGISTRY_MISMATCH", path="wiki/workbook.yaml", message="sheet_order does not match sheet registry keys."))
            for name_entry in names_payload.get("names", []):
                self._check_name_entry(workspace_path=workspace_path, sheet_order=sheet_order, name_entry=name_entry, errors=errors)
            for sheet_slug in sheet_order:
                sheet_dir: Path = wiki_dir / "sheets" / sheet_slug
                self._check_sheet(workspace_path=workspace_path, sheet_dir=sheet_dir, import_mode=import_mode, errors=errors, warnings=warnings)
        summary: ValidationSummary = ValidationSummary(
            sheet_count=len(workbook_payload.get("sheet_order", [])),
            error_count=len(errors),
            warning_count=len(warnings),
        )
        ok: bool = len(errors) == 0 and (len(warnings) == 0 or not fail_on_warning)
        report_payload: dict[str, Any] = {
            "ok": ok,
            "checked_at": current_timestamp(),
            "summary": summary.to_dict(),
            "errors": [issue.to_dict() for issue in errors],
            "warnings": [issue.to_dict() for issue in warnings],
        }
        report_path: Path = wiki_dir / "checks" / "latest_check.json"
        write_json_file(path=report_path, payload=report_payload)
        return {
            "ok": ok,
            "workspace_path": str(workspace_path),
            "summary": summary.to_dict(),
            "errors": [issue.to_dict() for issue in errors],
            "warnings": [issue.to_dict() for issue in warnings],
            "report_path": str(report_path),
        }

    def _check_sheet(self, workspace_path: Path, sheet_dir: Path, import_mode: str, errors: list[ValidationIssue], warnings: list[ValidationIssue]) -> None:
        for name in [
            SHEET_STRUCTURE_FILE,
            "summary.yaml",
            SHEET_FORMULA_FILE,
            "tables.yaml",
            SHEET_STYLE_FILE,
        ]:
            file_path: Path = sheet_dir / name
            if not file_path.exists():
                errors.append(ValidationIssue(code="MISSING_FILE", path=str(file_path.relative_to(workspace_path)), message="Required sheet file is missing."))
        validation_file_path: Path = sheet_dir / SHEET_VALIDATION_FILE
        if not validation_file_path.exists():
            errors.append(ValidationIssue(code="MISSING_FILE", path=str(validation_file_path.relative_to(workspace_path)), message="Required sheet file is missing."))
        if errors:
            return
        structure: dict[str, Any] = read_yaml_file(path=sheet_dir / SHEET_STRUCTURE_FILE)
        compressed_layout_path: Path = sheet_dir / SHEET_COMPRESSED_LAYOUT_FILE
        aggregated_values_path: Path = sheet_dir / SHEET_AGGREGATED_VALUES_FILE
        compressed_layout_payload: dict[str, Any] | None = (
            read_yaml_file(path=compressed_layout_path)
            if compressed_layout_path.exists()
            else None
        )
        aggregated_values_payload: dict[str, Any] | None = (
            read_yaml_file(path=aggregated_values_path)
            if aggregated_values_path.exists()
            else None
        )
        formulas_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / SHEET_FORMULA_FILE)
        validations_payload: dict[str, Any] = read_yaml_file(path=validation_file_path)
        tables_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / "tables.yaml")
        styles_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / SHEET_STYLE_FILE)
        static_cells: dict[str, Any] = self._load_static_cells(sheet_dir=sheet_dir, structure=structure)
        formulas: list[dict[str, Any]] = self._load_formulas(sheet_dir=sheet_dir, formulas_payload=formulas_payload)
        styles: dict[str, Any] = self._load_styles(
            sheet_dir=sheet_dir,
            styles_payload=styles_payload,
            structure=structure,
        )
        regions_path: Path = sheet_dir / "regions.yaml"
        regions_payload: dict[str, Any] | None = (
            read_yaml_file(path=regions_path) if regions_path.exists() else None
        )
        summary_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / "summary.yaml")
        column_names: list[str] = [str(column["name"]) for column in structure["columns"]]
        data_region: dict[str, Any] = dict(structure.get("data_region", {}))
        header_row_index: int = int(data_region.get("header_row_index", structure["header"]["row_index"]))
        row_count: int = 0
        if self._has_primary_tabular_definition(
            structure=structure,
            summary_payload=summary_payload,
            column_names=column_names,
        ):
            header, data_rows = load_primary_tabular_data(
                sheet_dir=sheet_dir,
                summary_payload=summary_payload,
                structure_payload=structure,
            )
            row_count = len(data_rows)
            if header != column_names:
                errors.append(
                    ValidationIssue(
                        code="TSV_HEADER_MISMATCH",
                        path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                        message="Primary region header does not match structure.yaml columns.",
                    )
                )
            end_row: int = int(data_region.get("end_row", structure["dimensions"]["max_row"]))
            expected_rows: int = 0
            if header_row_index > 0 and end_row > 0:
                expected_rows = max(end_row - header_row_index, 0)
            if row_count != expected_rows:
                warnings.append(
                    ValidationIssue(
                        code="ROW_COUNT_CHANGED",
                        path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                        message="Primary region row count differs from imported dimensions.",
                    )
                )
        max_row: int = max(header_row_index + row_count, int(structure["dimensions"]["max_row"]))
        max_col: int = int(structure["dimensions"]["max_col"])
        static_cells_count: int = int(structure.get("static_cells_count", len(static_cells)))
        if static_cells_count != len(static_cells):
            errors.append(
                ValidationIssue(
                    code="STATIC_CELL_COUNT_MISMATCH",
                    path=str((sheet_dir / SHEET_STRUCTURE_FILE).relative_to(workspace_path)),
                    message="static_cells_count does not match the chunked static cell payload.",
                )
            )
        frozen_panes: Any = structure.get("frozen_panes")
        if frozen_panes is not None and not isinstance(frozen_panes, dict):
            errors.append(
                ValidationIssue(
                    code="INVALID_FROZEN_PANES",
                    path=str((sheet_dir / SHEET_STRUCTURE_FILE).relative_to(workspace_path)),
                    message="frozen_panes must be null or a mapping.",
                )
            )
        filters: dict[str, Any] = dict(structure.get("filters", {}))
        if filters.get("enabled") and not filters.get("ref"):
            errors.append(
                ValidationIssue(
                    code="INVALID_FILTERS",
                    path=str((sheet_dir / SHEET_STRUCTURE_FILE).relative_to(workspace_path)),
                    message="Enabled filters must include ref.",
                )
            )
        for table_entry in tables_payload.get("tables", []):
            if table_entry.get("name") in {None, ""} or table_entry.get("ref") in {None, ""}:
                errors.append(
                    ValidationIssue(
                        code="INVALID_TABLE_ENTRY",
                        path=str((sheet_dir / "tables.yaml").relative_to(workspace_path)),
                        message="Each table must contain name and ref.",
                    )
                )
            if not isinstance(table_entry.get("columns"), list):
                errors.append(
                    ValidationIssue(
                        code="INVALID_TABLE_ENTRY",
                        path=str((sheet_dir / "tables.yaml").relative_to(workspace_path)),
                        message="Each table must contain a columns list.",
                    )
                )
        style_count: int = int(styles_payload.get("cell_count", len(styles)))
        if style_count != len(styles):
            errors.append(
                ValidationIssue(
                    code="STYLE_COUNT_MISMATCH",
                    path=str((sheet_dir / SHEET_STYLE_FILE).relative_to(workspace_path)),
                    message="cell_count does not match the chunked style payload.",
                )
            )
        for cell_reference, style_entry in styles.items():
            if "style_id" not in style_entry and "cell_type" not in style_entry:
                errors.append(
                    ValidationIssue(
                        code="INVALID_STYLE_ENTRY",
                        path=str((sheet_dir / SHEET_STYLE_FILE).relative_to(workspace_path)),
                        message=f"Style entry must contain style_id or cell_type for {cell_reference}.",
                    )
                )
        formula_count: int = int(formulas_payload.get("formula_count", len(formulas)))
        if formula_count != len(formulas):
            errors.append(
                ValidationIssue(
                    code="FORMULA_COUNT_MISMATCH",
                    path=str((sheet_dir / SHEET_FORMULA_FILE).relative_to(workspace_path)),
                    message="formula_count does not match the chunked formula payload.",
                )
            )
        for formula_entry in formulas:
            cell_reference: str = str(formula_entry["cell"])
            row_index, column_index = cell_reference_to_coordinates(cell_reference=cell_reference)
            if row_index > max_row or column_index > max_col:
                errors.append(
                    ValidationIssue(
                        code="FORMULA_OUT_OF_RANGE",
                        path=str((sheet_dir / SHEET_FORMULA_FILE).relative_to(workspace_path)),
                        message=f"Formula cell {cell_reference} is outside the sheet dimensions.",
                    )
                )
            if str(formula_entry.get("note", "")).strip() == "":
                warnings.append(
                    ValidationIssue(
                        code="FORMULA_NOTE_MISSING",
                        path=str((sheet_dir / SHEET_FORMULA_FILE).relative_to(workspace_path)),
                        message=f"Formula note is empty for {cell_reference}.",
                    )
                )
        for validation in validations_payload.get("validations", []):
            sqref: str = str(validation.get("sqref", "")).strip()
            validation_type: str = str(validation.get("type", "")).strip()
            if sqref == "" or validation_type == "":
                errors.append(
                    ValidationIssue(
                        code="INVALID_VALIDATION_RULE",
                        path=str(validation_file_path.relative_to(workspace_path)),
                        message="Validation rule must contain sqref and type.",
                    )
                )
            if validation_type == "list" and validation.get("formula1") in {None, ""}:
                errors.append(
                    ValidationIssue(
                        code="INVALID_VALIDATION_RULE",
                        path=str(validation_file_path.relative_to(workspace_path)),
                        message="List validation must contain formula1.",
                    )
                )
        if regions_payload is None:
            warnings.append(
                ValidationIssue(
                    code="MISSING_REGION_INDEX",
                    path=str(regions_path.relative_to(workspace_path)),
                    message="regions.yaml was not found; region-level artifacts were not generated.",
                )
            )
        else:
            self._check_regions(
                workspace_path=workspace_path,
                sheet_dir=sheet_dir,
                regions_payload=regions_payload,
                summary_payload=summary_payload,
                import_mode=import_mode,
                errors=errors,
                warnings=warnings,
            )
            if compressed_layout_payload is not None:
                self._check_compressed_layout(
                    workspace_path=workspace_path,
                    sheet_dir=sheet_dir,
                    structure=structure,
                    summary_payload=summary_payload,
                    compressed_layout_payload=compressed_layout_payload,
                    errors=errors,
                )
            elif import_mode == "debug":
                errors.append(
                    ValidationIssue(
                        code="MISSING_FILE",
                        path=str(compressed_layout_path.relative_to(workspace_path)),
                        message="Debug workspace is missing compressed_layout.yaml.",
                    )
                )
            if aggregated_values_payload is not None:
                self._check_aggregated_values(
                    workspace_path=workspace_path,
                    sheet_dir=sheet_dir,
                    summary_payload=summary_payload,
                    regions_payload=regions_payload,
                    aggregated_values_payload=aggregated_values_payload,
                    errors=errors,
                )
            elif import_mode == "debug":
                errors.append(
                    ValidationIssue(
                        code="MISSING_FILE",
                        path=str(aggregated_values_path.relative_to(workspace_path)),
                        message="Debug workspace is missing aggregated_values.yaml.",
                    )
                )

    def _check_regions(
        self,
        *,
        workspace_path: Path,
        sheet_dir: Path,
        regions_payload: dict[str, Any],
        summary_payload: dict[str, Any],
        import_mode: str,
        errors: list[ValidationIssue],
        warnings: list[ValidationIssue],
    ) -> None:
        regions: list[dict[str, Any]] = [dict(item) for item in regions_payload.get("regions", [])]
        expected_region_count: int = int(summary_payload.get("region_count", len(regions)))
        summary_primary_region_id: str = str(summary_payload.get("primary_region_id", "")).strip()
        regions_primary_region_id: str = str(regions_payload.get("primary_region_id", "")).strip()
        if expected_region_count != len(regions):
            errors.append(
                ValidationIssue(
                    code="REGION_COUNT_MISMATCH",
                    path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                    message="summary.yaml region_count does not match regions.yaml.",
                )
            )
        if summary_primary_region_id != regions_primary_region_id:
            errors.append(
                ValidationIssue(
                    code="PRIMARY_REGION_MISMATCH",
                    path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                    message="summary.yaml primary_region_id does not match regions.yaml.",
                )
            )
        for region in regions:
            region_id: str = str(region.get("region_id", "")).strip()
            if region_id == "":
                errors.append(
                    ValidationIssue(
                        code="INVALID_REGION_ENTRY",
                        path=str((sheet_dir / "regions.yaml").relative_to(workspace_path)),
                        message="Each region entry must contain region_id.",
                    )
                )
                continue
            files: dict[str, Any] = dict(region.get("files", {}))
            data_locator: dict[str, Any] = dict(region.get("data_locator", {}))
            region_meta_payload: dict[str, Any] = dict(region.get("meta", {}))
            if str(region_meta_payload.get("region_id", "")).strip() != region_id:
                errors.append(
                    ValidationIssue(
                        code="INVALID_REGION_ENTRY",
                        path=str((sheet_dir / "regions.yaml").relative_to(workspace_path)),
                        message=f"Region {region_id} is missing embedded meta or has mismatched region_id.",
                    )
                )
            if str(data_locator.get("storage", "")).strip() == "bundled":
                bundle_relative_path: str = str(data_locator.get("file", "")).strip()
                section_name: str = str(data_locator.get("section", "")).strip()
                if bundle_relative_path == "" or section_name == "":
                    errors.append(
                        ValidationIssue(
                            code="INVALID_REGION_ENTRY",
                            path=str((sheet_dir / "regions.yaml").relative_to(workspace_path)),
                            message=f"Region {region_id} is missing bundled data locator fields.",
                        )
                    )
                    continue
                bundle_path: Path = sheet_dir / bundle_relative_path
                if not bundle_path.exists():
                    errors.append(
                        ValidationIssue(
                            code="MISSING_FILE",
                            path=str(bundle_path.relative_to(workspace_path)),
                            message="Region data bundle is missing.",
                        )
                    )
                    continue
                header, rows = read_region_data_bundle_section(path=bundle_path, section=section_name)
                if len(header) == 0 and len(rows) == 0:
                    errors.append(
                        ValidationIssue(
                            code="INVALID_REGION_ENTRY",
                            path=str(bundle_path.relative_to(workspace_path)),
                            message=f"Region {region_id} section was not found in the data bundle.",
                        )
                    )
                    continue
                if len(rows) == 0:
                    warnings.append(
                        ValidationIssue(
                            code="EMPTY_REGION_DATA",
                            path=str(bundle_path.relative_to(workspace_path)),
                            message=f"Region {region_id} contains no data rows.",
                        )
                    )
                continue
            data_relative_path: str = str(files.get("data", "")).strip()
            if data_relative_path == "":
                errors.append(
                    ValidationIssue(
                        code="INVALID_REGION_ENTRY",
                        path=str((sheet_dir / "regions.yaml").relative_to(workspace_path)),
                        message=f"Region {region_id} is missing data location metadata.",
                    )
                )
                continue
            data_path: Path = sheet_dir / data_relative_path
            if not data_path.exists():
                errors.append(
                    ValidationIssue(
                        code="MISSING_FILE",
                        path=str(data_path.relative_to(workspace_path)),
                        message="Region artifact is missing.",
                    )
                )
                continue
            _header, rows = read_tsv_file(path=data_path)
            if len(rows) == 0:
                warnings.append(
                    ValidationIssue(
                        code="EMPTY_REGION_DATA",
                        path=str(data_path.relative_to(workspace_path)),
                        message=f"Region {region_id} contains no data rows.",
                    )
                )

    def _check_compressed_layout(
        self,
        *,
        workspace_path: Path,
        sheet_dir: Path,
        structure: dict[str, Any],
        summary_payload: dict[str, Any],
        compressed_layout_payload: dict[str, Any],
        errors: list[ValidationIssue],
    ) -> None:
        compressed_path: Path = sheet_dir / SHEET_COMPRESSED_LAYOUT_FILE
        expected_sheet_slug: str = str(
            summary_payload.get("sheet_slug", structure.get("sheet_slug", sheet_dir.name))
        )
        if str(compressed_layout_payload.get("sheet_slug", "")).strip() != expected_sheet_slug:
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_SHEET_MISMATCH",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml sheet_slug does not match the sheet summary.",
                )
            )
        original_dimensions: dict[str, Any] = dict(
            compressed_layout_payload.get("original_dimensions", {})
        )
        structure_dimensions: dict[str, Any] = dict(structure.get("dimensions", {}))
        if int(original_dimensions.get("max_row", 0)) != int(structure_dimensions.get("max_row", 0)):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_DIMENSION_MISMATCH",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml original max_row does not match structure.yaml.",
                )
            )
        if int(original_dimensions.get("max_col", 0)) != int(structure_dimensions.get("max_col", 0)):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_DIMENSION_MISMATCH",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml original max_col does not match structure.yaml.",
                )
            )
        kept_rows: list[int] = [int(value) for value in compressed_layout_payload.get("kept_rows", [])]
        kept_cols: list[int] = [int(value) for value in compressed_layout_payload.get("kept_cols", [])]
        compressed_dimensions: dict[str, Any] = dict(
            compressed_layout_payload.get("compressed_dimensions", {})
        )
        if int(compressed_dimensions.get("row_count", -1)) != len(kept_rows):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_COUNT_MISMATCH",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml row_count does not match kept_rows.",
                )
            )
        if int(compressed_dimensions.get("col_count", -1)) != len(kept_cols):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_COUNT_MISMATCH",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml col_count does not match kept_cols.",
                )
            )
        if kept_rows != sorted(set(kept_rows)):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_INVALID_INDEXES",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml kept_rows must be unique and sorted.",
                )
            )
        if kept_cols != sorted(set(kept_cols)):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_INVALID_INDEXES",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml kept_cols must be unique and sorted.",
                )
            )
        max_row: int = int(original_dimensions.get("max_row", 0))
        max_col: int = int(original_dimensions.get("max_col", 0))
        for row_index in kept_rows:
            if row_index <= 0 or row_index > max_row:
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_INDEXES",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message=f"compressed_layout.yaml kept row {row_index} is outside original dimensions.",
                    )
                )
        for col_index in kept_cols:
            if col_index <= 0 or col_index > max_col:
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_INDEXES",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message=f"compressed_layout.yaml kept column {col_index} is outside original dimensions.",
                    )
                )
        row_mapping: list[dict[str, Any]] = [
            dict(item) for item in compressed_layout_payload.get("row_mapping", [])
        ]
        col_mapping: list[dict[str, Any]] = [
            dict(item) for item in compressed_layout_payload.get("col_mapping", [])
        ]
        self._check_axis_mapping(
            workspace_path=workspace_path,
            sheet_path=compressed_path,
            axis_name="row",
            kept_indexes=kept_rows,
            mapping_entries=row_mapping,
            errors=errors,
        )
        self._check_axis_mapping(
            workspace_path=workspace_path,
            sheet_path=compressed_path,
            axis_name="column",
            kept_indexes=kept_cols,
            mapping_entries=col_mapping,
            errors=errors,
        )
        row_mapping_by_original: dict[int, int] = {
            int(entry.get("original", 0)): int(entry.get("compressed", 0))
            for entry in row_mapping
        }
        col_mapping_by_original: dict[int, int] = {
            int(entry.get("original", 0)): int(entry.get("compressed", 0))
            for entry in col_mapping
        }
        compressed_cells: list[dict[str, Any]] = [
            dict(item) for item in compressed_layout_payload.get("compressed_cells", [])
        ]
        if int(compressed_layout_payload.get("cell_count", -1)) != len(compressed_cells):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_COUNT_MISMATCH",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml cell_count does not match compressed_cells.",
                )
            )
        seen_compressed_cells: set[str] = set()
        for compressed_cell in compressed_cells:
            original_ref: str = str(compressed_cell.get("original_cell", "")).strip()
            compressed_ref: str = str(compressed_cell.get("compressed_cell", "")).strip()
            if original_ref == "" or compressed_ref == "":
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_CELL",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message="compressed_layout.yaml cells must contain original_cell and compressed_cell.",
                    )
                )
                continue
            original_row, original_col = cell_reference_to_coordinates(original_ref)
            compressed_row, compressed_col = cell_reference_to_coordinates(compressed_ref)
            if row_mapping_by_original.get(original_row) != compressed_row:
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_CELL",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message=f"compressed_layout.yaml row mapping mismatch for {original_ref}.",
                    )
                )
            if col_mapping_by_original.get(original_col) != compressed_col:
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_CELL",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message=f"compressed_layout.yaml column mapping mismatch for {original_ref}.",
                    )
                )
            if compressed_ref in seen_compressed_cells:
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_DUPLICATE_CELL",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message=f"compressed_layout.yaml contains duplicate compressed cell {compressed_ref}.",
                    )
                )
            seen_compressed_cells.add(compressed_ref)
        blocks: list[dict[str, Any]] = [dict(item) for item in compressed_layout_payload.get("blocks", [])]
        structure_blocks: list[dict[str, Any]] = [dict(item) for item in structure.get("sheet_blocks", [])]
        if len(blocks) != len(structure_blocks):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_BLOCK_MISMATCH",
                    path=str(compressed_path.relative_to(workspace_path)),
                    message="compressed_layout.yaml block count does not match structure.yaml sheet_blocks.",
                )
            )
        structure_block_ids: set[str] = {
            str(block.get("block_id", "")).strip() for block in structure_blocks
        }
        for block in blocks:
            block_id: str = str(block.get("block_id", "")).strip()
            if block_id == "" or block_id not in structure_block_ids:
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_BLOCK_MISMATCH",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message="compressed_layout.yaml contains an unknown block entry.",
                    )
                )
            for bbox_key in ["compressed_bbox", "compressed_header_bbox", "compressed_data_bbox"]:
                self._check_optional_bbox_within_compressed_space(
                    workspace_path=workspace_path,
                    sheet_path=compressed_path,
                    bbox=dict(block.get(bbox_key) or {}),
                    row_count=len(kept_rows),
                    col_count=len(kept_cols),
                    errors=errors,
                    issue_code="COMPRESSED_LAYOUT_BLOCK_MISMATCH",
                    label=bbox_key,
                )
        for merged_entry in compressed_layout_payload.get("merged_ranges", []):
            merged_payload: dict[str, Any] = dict(merged_entry)
            compressed_ref = str(merged_payload.get("compressed_range", "")).strip()
            if compressed_ref == "":
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_MERGE",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message="compressed_layout.yaml merged_ranges must contain compressed_range.",
                    )
                )
                continue
            merge_start_row, merge_start_col = cell_reference_to_coordinates(
                compressed_ref.split(":", maxsplit=1)[0]
            )
            merge_end_row, merge_end_col = cell_reference_to_coordinates(
                compressed_ref.split(":", maxsplit=1)[-1]
            )
            if (
                merge_start_row <= 0
                or merge_start_col <= 0
                or merge_end_row > len(kept_rows)
                or merge_end_col > len(kept_cols)
            ):
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_MERGE",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message=f"compressed_layout.yaml merge {compressed_ref} is outside compressed dimensions.",
                    )
                )
            if str(merged_payload.get("original_range", "")).strip() not in {
                str(value) for value in structure.get("merged_ranges", [])
            }:
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_MERGE",
                        path=str(compressed_path.relative_to(workspace_path)),
                        message="compressed_layout.yaml references an unknown original merged range.",
                    )
                )
        if int(summary_payload.get("anchor_prune_k", compressed_layout_payload.get("k", 0))) != int(
            compressed_layout_payload.get("k", 0)
        ):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_SUMMARY_MISMATCH",
                    path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                    message="summary.yaml anchor_prune_k does not match compressed_layout.yaml.",
                )
            )
        if int(summary_payload.get("compressed_row_count", len(kept_rows))) != len(kept_rows):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_SUMMARY_MISMATCH",
                    path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                    message="summary.yaml compressed_row_count does not match compressed_layout.yaml.",
                )
            )
        if int(summary_payload.get("compressed_col_count", len(kept_cols))) != len(kept_cols):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_SUMMARY_MISMATCH",
                    path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                    message="summary.yaml compressed_col_count does not match compressed_layout.yaml.",
                )
            )
        if int(summary_payload.get("compressed_cell_count", len(compressed_cells))) != len(compressed_cells):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_SUMMARY_MISMATCH",
                    path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                    message="summary.yaml compressed_cell_count does not match compressed_layout.yaml.",
                )
            )

    def _check_aggregated_values(
        self,
        *,
        workspace_path: Path,
        sheet_dir: Path,
        summary_payload: dict[str, Any],
        regions_payload: dict[str, Any],
        aggregated_values_payload: dict[str, Any],
        errors: list[ValidationIssue],
    ) -> None:
        aggregated_path: Path = sheet_dir / SHEET_AGGREGATED_VALUES_FILE
        expected_sheet_slug: str = str(summary_payload.get("sheet_slug", sheet_dir.name))
        if str(aggregated_values_payload.get("sheet_slug", "")).strip() != expected_sheet_slug:
            errors.append(
                ValidationIssue(
                    code="AGGREGATED_VALUES_SHEET_MISMATCH",
                    path=str(aggregated_path.relative_to(workspace_path)),
                    message="aggregated_values.yaml sheet_slug does not match the sheet summary.",
                )
            )
        aggregated_regions: list[dict[str, Any]] = [
            dict(item) for item in aggregated_values_payload.get("regions", [])
        ]
        if int(aggregated_values_payload.get("region_count", -1)) != len(aggregated_regions):
            errors.append(
                ValidationIssue(
                    code="AGGREGATED_VALUES_COUNT_MISMATCH",
                    path=str(aggregated_path.relative_to(workspace_path)),
                    message="aggregated_values.yaml region_count does not match regions.",
                )
            )
        regions_index: list[dict[str, Any]] = [dict(item) for item in regions_payload.get("regions", [])]
        regions_by_id: dict[str, dict[str, Any]] = {
            str(region.get("region_id", "")).strip(): region for region in regions_index
        }
        total_component_count: int = 0
        total_span_count: int = 0
        total_text_object_count: int = 0
        total_merged_object_count: int = 0
        for aggregated_region in aggregated_regions:
            region_id: str = str(aggregated_region.get("region_id", "")).strip()
            if region_id == "" or region_id not in regions_by_id:
                errors.append(
                    ValidationIssue(
                        code="AGGREGATED_VALUES_REGION_MISMATCH",
                        path=str(aggregated_path.relative_to(workspace_path)),
                        message="aggregated_values.yaml contains an unknown region_id.",
                    )
                )
                continue
            region_entry: dict[str, Any] = dict(regions_by_id[region_id])
            if dict(aggregated_region.get("bbox", {})) != dict(region_entry.get("bbox", {})):
                errors.append(
                    ValidationIssue(
                        code="AGGREGATED_VALUES_REGION_MISMATCH",
                        path=str(aggregated_path.relative_to(workspace_path)),
                        message=f"aggregated_values.yaml bbox mismatch for region {region_id}.",
                    )
                )
            aggregated_components: list[dict[str, Any]] = [
                dict(item) for item in aggregated_region.get("aggregated_components", [])
            ]
            aggregated_spans: list[dict[str, Any]] = [
                dict(item) for item in aggregated_region.get("aggregated_spans", [])
            ]
            text_objects: list[dict[str, Any]] = [
                dict(item) for item in aggregated_region.get("text_objects", [])
            ]
            merged_objects: list[dict[str, Any]] = [
                dict(item) for item in aggregated_region.get("merged_objects", [])
            ]
            if int(aggregated_region.get("aggregated_component_count", -1)) != len(aggregated_components):
                errors.append(
                    ValidationIssue(
                        code="AGGREGATED_VALUES_COUNT_MISMATCH",
                        path=str(aggregated_path.relative_to(workspace_path)),
                        message=f"aggregated_values.yaml component count mismatch for region {region_id}.",
                    )
                )
            if int(aggregated_region.get("aggregated_span_count", -1)) != len(aggregated_spans):
                errors.append(
                    ValidationIssue(
                        code="AGGREGATED_VALUES_COUNT_MISMATCH",
                        path=str(aggregated_path.relative_to(workspace_path)),
                        message=f"aggregated_values.yaml span count mismatch for region {region_id}.",
                    )
                )
            if int(aggregated_region.get("text_object_count", -1)) != len(text_objects):
                errors.append(
                    ValidationIssue(
                        code="AGGREGATED_VALUES_COUNT_MISMATCH",
                        path=str(aggregated_path.relative_to(workspace_path)),
                        message=f"aggregated_values.yaml text object count mismatch for region {region_id}.",
                    )
                )
            if int(aggregated_region.get("merged_object_count", -1)) != len(merged_objects):
                errors.append(
                    ValidationIssue(
                        code="AGGREGATED_VALUES_COUNT_MISMATCH",
                        path=str(aggregated_path.relative_to(workspace_path)),
                        message=f"aggregated_values.yaml merged object count mismatch for region {region_id}.",
                    )
                )
            total_component_count += len(aggregated_components)
            total_span_count += len(aggregated_spans)
            total_text_object_count += len(text_objects)
            total_merged_object_count += len(merged_objects)
            for component in aggregated_components:
                spans: list[dict[str, Any]] = [dict(item) for item in component.get("spans", [])]
                object_ids: list[str] = [str(item) for item in component.get("object_ids", [])]
                if int(component.get("object_count", -1)) != len(object_ids):
                    errors.append(
                        ValidationIssue(
                            code="AGGREGATED_VALUES_COMPONENT_MISMATCH",
                            path=str(aggregated_path.relative_to(workspace_path)),
                            message=f"aggregated_values.yaml object_count mismatch in region {region_id}.",
                        )
                    )
                if int(component.get("merged_object_count", -1)) != sum(
                    1 for span in spans if bool(span.get("is_merged"))
                ):
                    errors.append(
                        ValidationIssue(
                            code="AGGREGATED_VALUES_COMPONENT_MISMATCH",
                            path=str(aggregated_path.relative_to(workspace_path)),
                            message=f"aggregated_values.yaml merged_object_count mismatch in region {region_id}.",
                        )
                    )
                if int(component.get("cell_count", -1)) != sum(
                    int(span.get("cell_count", 0)) for span in spans
                ):
                    errors.append(
                        ValidationIssue(
                            code="AGGREGATED_VALUES_COMPONENT_MISMATCH",
                            path=str(aggregated_path.relative_to(workspace_path)),
                            message=f"aggregated_values.yaml cell_count mismatch in region {region_id}.",
                        )
                    )
            self._check_region_summary_upgrade(
                workspace_path=workspace_path,
                sheet_dir=sheet_dir,
                region_entry=region_entry,
                aggregated_region=aggregated_region,
                errors=errors,
            )
        if int(aggregated_values_payload.get("aggregated_component_count", -1)) != total_component_count:
            errors.append(
                ValidationIssue(
                    code="AGGREGATED_VALUES_COUNT_MISMATCH",
                    path=str(aggregated_path.relative_to(workspace_path)),
                    message="aggregated_values.yaml aggregated_component_count does not match region totals.",
                )
            )
        if int(aggregated_values_payload.get("aggregated_span_count", -1)) != total_span_count:
            errors.append(
                ValidationIssue(
                    code="AGGREGATED_VALUES_COUNT_MISMATCH",
                    path=str(aggregated_path.relative_to(workspace_path)),
                    message="aggregated_values.yaml aggregated_span_count does not match region totals.",
                )
            )
        if int(aggregated_values_payload.get("text_object_count", -1)) != total_text_object_count:
            errors.append(
                ValidationIssue(
                    code="AGGREGATED_VALUES_COUNT_MISMATCH",
                    path=str(aggregated_path.relative_to(workspace_path)),
                    message="aggregated_values.yaml text_object_count does not match region totals.",
                )
            )
        if int(aggregated_values_payload.get("merged_object_count", -1)) != total_merged_object_count:
            errors.append(
                ValidationIssue(
                    code="AGGREGATED_VALUES_COUNT_MISMATCH",
                    path=str(aggregated_path.relative_to(workspace_path)),
                    message="aggregated_values.yaml merged_object_count does not match region totals.",
                )
            )
        summary_count_keys: list[tuple[str, str]] = [
            ("aggregated_region_count", "region_count"),
            ("aggregated_component_count", "aggregated_component_count"),
            ("aggregated_span_count", "aggregated_span_count"),
            ("text_object_count", "text_object_count"),
            ("merged_object_count", "merged_object_count"),
        ]
        for summary_key, aggregated_key in summary_count_keys:
            if summary_key not in summary_payload:
                continue
            if int(summary_payload.get(summary_key, -1)) != int(
                aggregated_values_payload.get(aggregated_key, -1)
            ):
                errors.append(
                    ValidationIssue(
                        code="AGGREGATED_VALUES_SUMMARY_MISMATCH",
                        path=str((sheet_dir / "summary.yaml").relative_to(workspace_path)),
                        message=f"summary.yaml {summary_key} does not match aggregated_values.yaml.",
                    )
                )

    def _check_region_summary_upgrade(
        self,
        *,
        workspace_path: Path,
        sheet_dir: Path,
        region_entry: dict[str, Any],
        aggregated_region: dict[str, Any],
        errors: list[ValidationIssue],
    ) -> None:
        llm_summary_relative_path: str = str(
            dict(region_entry.get("files", {})).get("llm_summary", "")
        ).strip()
        if llm_summary_relative_path == "":
            return
        llm_summary_path: Path = sheet_dir / llm_summary_relative_path
        if not llm_summary_path.exists():
            return
        llm_summary_payload: dict[str, Any] = read_yaml_file(path=llm_summary_path)
        if str(llm_summary_payload.get("summary_source", "")).strip() != "aggregated_components":
            errors.append(
                ValidationIssue(
                    code="LLM_SUMMARY_SOURCE_MISMATCH",
                    path=str(llm_summary_path.relative_to(workspace_path)),
                    message="Region llm_summary.yaml must prefer aggregated_components.",
                )
            )
        representation_priority: list[str] = [
            str(item) for item in llm_summary_payload.get("representation_priority", [])
        ]
        if len(representation_priority) == 0 or representation_priority[0] != "aggregated_components":
            errors.append(
                ValidationIssue(
                    code="LLM_SUMMARY_SOURCE_MISMATCH",
                    path=str(llm_summary_path.relative_to(workspace_path)),
                    message="Region llm_summary.yaml representation_priority must start with aggregated_components.",
                )
            )
        count_keys: list[str] = [
            "aggregated_component_count",
            "aggregated_span_count",
            "text_object_count",
            "merged_object_count",
        ]
        for count_key in count_keys:
            if int(llm_summary_payload.get(count_key, -1)) != int(aggregated_region.get(count_key, -1)):
                errors.append(
                    ValidationIssue(
                        code="LLM_SUMMARY_AGGREGATION_MISMATCH",
                        path=str(llm_summary_path.relative_to(workspace_path)),
                        message=f"Region llm_summary.yaml {count_key} does not match aggregated_values.yaml.",
                    )
                )
        aggregated_components: list[dict[str, Any]] = [
            dict(item) for item in aggregated_region.get("aggregated_components", [])
        ]
        merged_objects: list[dict[str, Any]] = [
            dict(item) for item in aggregated_region.get("merged_objects", [])
        ]
        if list(llm_summary_payload.get("aggregated_components", [])) != aggregated_components:
            errors.append(
                ValidationIssue(
                    code="LLM_SUMMARY_AGGREGATION_MISMATCH",
                    path=str(llm_summary_path.relative_to(workspace_path)),
                    message="Region llm_summary.yaml aggregated_components do not match aggregated_values.yaml.",
                )
            )
        if list(llm_summary_payload.get("merged_objects", [])) != merged_objects:
            errors.append(
                ValidationIssue(
                    code="LLM_SUMMARY_AGGREGATION_MISMATCH",
                    path=str(llm_summary_path.relative_to(workspace_path)),
                    message="Region llm_summary.yaml merged_objects do not match aggregated_values.yaml.",
                )
            )
        expected_text_preview: list[dict[str, Any]] = [
            dict(item) for item in list(aggregated_region.get("text_objects", []))[:20]
        ]
        if list(llm_summary_payload.get("text_objects_preview", [])) != expected_text_preview:
            errors.append(
                ValidationIssue(
                    code="LLM_SUMMARY_AGGREGATION_MISMATCH",
                    path=str(llm_summary_path.relative_to(workspace_path)),
                    message="Region llm_summary.yaml text_objects_preview does not match aggregated_values.yaml.",
                )
            )
        expected_truncated: bool = len(list(aggregated_region.get("text_objects", []))) > len(
            expected_text_preview
        )
        if bool(llm_summary_payload.get("text_objects_preview_truncated", False)) != expected_truncated:
            errors.append(
                ValidationIssue(
                    code="LLM_SUMMARY_AGGREGATION_MISMATCH",
                    path=str(llm_summary_path.relative_to(workspace_path)),
                    message="Region llm_summary.yaml text_objects_preview_truncated does not match aggregated_values.yaml.",
                )
            )

    def _check_name_entry(
        self,
        workspace_path: Path,
        sheet_order: list[str],
        name_entry: dict[str, Any],
        errors: list[ValidationIssue],
    ) -> None:
        name: str = str(name_entry.get("name", "")).strip()
        scope: str = str(name_entry.get("scope", "")).strip()
        formula: str = str(name_entry.get("formula", "")).strip()
        if name == "" or scope == "" or formula == "":
            errors.append(
                ValidationIssue(
                    code="INVALID_NAME_ENTRY",
                    path="wiki/names.yaml",
                    message="Each named range must contain name, scope, and formula.",
                )
            )
            return
        if scope != "workbook" and scope not in sheet_order:
            errors.append(
                ValidationIssue(
                    code="INVALID_NAME_ENTRY",
                    path="wiki/names.yaml",
                    message=f"Named range scope is unknown: {scope}.",
                )
            )

    def _load_static_cells(self, sheet_dir: Path, structure: dict[str, Any]) -> dict[str, Any]:
        return read_chunked_cell_mapping(
            directory=sheet_dir / "static_cells",
            payload_key="cells",
            inline_mapping=dict(structure.get("static_cells", {})),
            index_entries=list(structure.get("static_cells_index", [])),
        )

    def _load_formulas(self, sheet_dir: Path, formulas_payload: dict[str, Any]) -> list[dict[str, Any]]:
        return read_chunked_records(
            directory=sheet_dir / "formulas",
            payload_key="formulas",
            inline_records=list(formulas_payload.get("formulas", [])),
            index_entries=list(formulas_payload.get("formulas_index", [])),
        )

    def _load_styles(
        self,
        sheet_dir: Path,
        styles_payload: dict[str, Any],
        structure: dict[str, Any],
    ) -> dict[str, Any]:
        if str(styles_payload.get("style_mode", "")) == "default_row_runs":
            return self._expand_default_row_run_styles(
                sheet_dir=sheet_dir,
                styles_payload=styles_payload,
                structure=structure,
            )
        return read_chunked_cell_mapping(
            directory=sheet_dir / "styles",
            payload_key="cells",
            inline_mapping=dict(styles_payload.get("cells", {})),
            index_entries=list(styles_payload.get("cells_index", [])),
        )

    def _expand_default_row_run_styles(
        self,
        sheet_dir: Path,
        styles_payload: dict[str, Any],
        structure: dict[str, Any],
    ) -> dict[str, Any]:
        styles: dict[str, Any] = {}
        data_region: dict[str, Any] = dict(structure.get("data_region", {}))
        header_row_index: int = int(data_region.get("header_row_index", 0))
        end_row: int = int(data_region.get("end_row", 0))
        default_row_style_runs: list[dict[str, Any]] = [
            dict(item) for item in styles_payload.get("default_row_style_runs", [])
        ]
        if header_row_index > 0 and end_row >= header_row_index:
            for row_index in range(header_row_index, end_row + 1):
                self._apply_style_runs_to_map(
                    styles=styles,
                    row_index=row_index,
                    runs=default_row_style_runs,
                )
        override_rows: list[dict[str, Any]] = read_chunked_records(
            directory=sheet_dir / "style_runs",
            payload_key="rows",
            inline_records=list(styles_payload.get("row_run_overrides", [])),
            index_entries=list(styles_payload.get("row_run_overrides_index", [])),
        )
        for override_row in override_rows:
            row_index: int = int(override_row.get("row", 0))
            if row_index <= 0:
                continue
            self._clear_row_styles(
                styles=styles,
                row_index=row_index,
                start_col=int(data_region.get("start_col", 0)),
                end_col=int(data_region.get("end_col", 0)),
            )
            self._apply_style_runs_to_map(
                styles=styles,
                row_index=row_index,
                runs=[dict(item) for item in override_row.get("runs", [])],
            )
        return styles

    def _apply_style_runs_to_map(
        self,
        *,
        styles: dict[str, Any],
        row_index: int,
        runs: list[dict[str, Any]],
    ) -> None:
        for run in runs:
            if "style_id" not in run:
                continue
            start_col: int = int(run.get("c1", 0))
            end_col: int = int(run.get("c2", 0))
            style_id: int = int(run["style_id"])
            for column_index in range(start_col, end_col + 1):
                cell_reference: str = coordinates_to_cell_reference(
                    row_index=row_index,
                    column_index=column_index,
                )
                styles[cell_reference] = {"style_id": style_id}

    def _clear_row_styles(
        self,
        *,
        styles: dict[str, Any],
        row_index: int,
        start_col: int,
        end_col: int,
    ) -> None:
        if start_col <= 0 or end_col <= 0 or end_col < start_col:
            return
        for column_index in range(start_col, end_col + 1):
            cell_reference: str = coordinates_to_cell_reference(
                row_index=row_index,
                column_index=column_index,
            )
            styles.pop(cell_reference, None)

    def _has_primary_tabular_definition(
        self,
        *,
        structure: dict[str, Any],
        summary_payload: dict[str, Any],
        column_names: list[str],
    ) -> bool:
        data_region_source: str = str(
            summary_payload.get(
                "data_region_source",
                structure.get("data_region_source", "none"),
            )
        ).strip()
        if data_region_source != "none":
            return True
        if len(column_names) > 0:
            return True
        data_region: dict[str, Any] = dict(structure.get("data_region", {}))
        return (
            int(data_region.get("start_row", 0)) > 0
            and int(data_region.get("end_row", 0)) > 0
            and int(data_region.get("start_col", 0)) > 0
            and int(data_region.get("end_col", 0)) > 0
            and int(data_region.get("header_row_index", 0)) > 0
        )

    def _check_axis_mapping(
        self,
        *,
        workspace_path: Path,
        sheet_path: Path,
        axis_name: str,
        kept_indexes: list[int],
        mapping_entries: list[dict[str, Any]],
        errors: list[ValidationIssue],
    ) -> None:
        if len(mapping_entries) != len(kept_indexes):
            errors.append(
                ValidationIssue(
                    code="COMPRESSED_LAYOUT_COUNT_MISMATCH",
                    path=str(sheet_path.relative_to(workspace_path)),
                    message=f"compressed_layout.yaml {axis_name} mapping count does not match kept indexes.",
                )
            )
        expected_mapping: list[tuple[int, int]] = list(
            enumerate(kept_indexes, start=1)
        )
        for compressed_index, original_index in expected_mapping:
            if not any(
                int(entry.get("original", 0)) == original_index
                and int(entry.get("compressed", 0)) == compressed_index
                for entry in mapping_entries
            ):
                errors.append(
                    ValidationIssue(
                        code="COMPRESSED_LAYOUT_INVALID_INDEXES",
                        path=str(sheet_path.relative_to(workspace_path)),
                        message=f"compressed_layout.yaml {axis_name} mapping is missing {original_index}->{compressed_index}.",
                    )
                )

    def _check_optional_bbox_within_compressed_space(
        self,
        *,
        workspace_path: Path,
        sheet_path: Path,
        bbox: dict[str, Any],
        row_count: int,
        col_count: int,
        errors: list[ValidationIssue],
        issue_code: str,
        label: str,
    ) -> None:
        if len(bbox) == 0:
            return
        start_row: int = int(bbox.get("start_row", 0))
        end_row: int = int(bbox.get("end_row", 0))
        start_col: int = int(bbox.get("start_col", 0))
        end_col: int = int(bbox.get("end_col", 0))
        if (
            start_row <= 0
            or end_row <= 0
            or start_col <= 0
            or end_col <= 0
            or end_row < start_row
            or end_col < start_col
            or end_row > row_count
            or end_col > col_count
        ):
            errors.append(
                ValidationIssue(
                    code=issue_code,
                    path=str(sheet_path.relative_to(workspace_path)),
                    message=f"compressed_layout.yaml {label} is outside compressed dimensions.",
                )
            )