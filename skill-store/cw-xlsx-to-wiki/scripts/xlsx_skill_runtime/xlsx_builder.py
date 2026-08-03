"""Build minimal XLSX files from the wiki workspace."""

from __future__ import annotations

import html
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from xlsx_skill_runtime.common import cell_reference_to_coordinates, coordinates_to_cell_reference
from xlsx_skill_runtime.region_artifacts import load_primary_tabular_data
from xlsx_skill_runtime.wiki_files import read_chunked_cell_mapping, read_chunked_records, read_yaml_file

MAIN_NS: str = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS: str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS: str = "http://schemas.openxmlformats.org/package/2006/relationships"

ET.register_namespace("", MAIN_NS)
ET.register_namespace("r", REL_NS)


class XlsxBuilder:
    """Compile wiki sheet artifacts into a minimal workbook."""

    def build(self, workspace_path: Path, output_filename: str) -> Path:
        workbook_payload: dict[str, Any] = read_yaml_file(path=workspace_path / "wiki" / "workbook.yaml")
        output_path: Path = workspace_path / "outputs" / output_filename
        extracted_dir: Path = workspace_path / "extracted" / "ooxml"
        if not extracted_dir.exists():
            raise FileNotFoundError(f"Extracted OOXML template was not found: {extracted_dir}")
        with tempfile.TemporaryDirectory(prefix="xlsx_builder_") as temp_dir:
            template_root: Path = Path(temp_dir) / "ooxml"
            shutil.copytree(src=extracted_dir, dst=template_root)
            shared_strings_path: Path = template_root / "xl" / "sharedStrings.xml"
            shared_strings, shared_string_lookup = self._load_shared_strings_state(
                shared_strings_path=shared_strings_path,
            )
            shared_strings_modified: bool = False
            for sheet_slug in workbook_payload["sheet_order"]:
                sheet_metadata: dict[str, Any] = dict(workbook_payload.get("sheets", {}).get(str(sheet_slug), {}))
                ooxml_target: str = str(sheet_metadata.get("ooxml_target", "")).strip()
                if ooxml_target == "":
                    raise ValueError(f"Missing OOXML target for sheet '{sheet_slug}'; re-import the workbook.")
                original_sheet_path: Path = self._resolve_ooxml_target(
                    package_root=extracted_dir,
                    target=ooxml_target,
                )
                desired_sheet = self._load_sheet_patch_payload(
                    workspace_path=workspace_path,
                    sheet_slug=str(sheet_slug),
                    original_sheet_path=original_sheet_path,
                )
                shared_strings_modified = self._patch_worksheet_xml(
                    sheet_path=self._resolve_ooxml_target(
                        package_root=template_root,
                        target=ooxml_target,
                    ),
                    desired_sheet=desired_sheet,
                    shared_strings=shared_strings,
                    shared_string_lookup=shared_string_lookup,
                ) or shared_strings_modified
            if shared_strings_modified:
                self._write_shared_strings_state(
                    shared_strings_path=shared_strings_path,
                    shared_strings=shared_strings,
                )
            self._write_xlsx_from_directory(
                source_dir=template_root,
                output_path=output_path,
            )
        return output_path

    def _load_sheet_patch_payload(
        self,
        *,
        workspace_path: Path,
        sheet_slug: str,
        original_sheet_path: Path,
    ) -> dict[str, Any]:
        sheet_dir: Path = workspace_path / "wiki" / "sheets" / sheet_slug
        summary_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / "summary.yaml")
        compressed_layout_path: Path = sheet_dir / "compressed_layout.yaml"
        compressed_layout_payload: dict[str, Any] | None = (
            read_yaml_file(path=compressed_layout_path)
            if compressed_layout_path.exists()
            else None
        )
        aggregated_values_path: Path = sheet_dir / "aggregated_values.yaml"
        aggregated_values_payload: dict[str, Any] | None = (
            read_yaml_file(path=aggregated_values_path)
            if aggregated_values_path.exists()
            else None
        )
        structure: dict[str, Any] = read_yaml_file(path=sheet_dir / "structure.yaml")
        formulas_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / "formulas.yaml")
        styles_payload: dict[str, Any] = read_yaml_file(path=sheet_dir / "styles.yaml")
        header, data_rows = load_primary_tabular_data(
            sheet_dir=sheet_dir,
            summary_payload=summary_payload,
            structure_payload=structure,
        )
        tabular_layout: dict[str, Any] = self._resolve_tabular_layout(
            sheet_dir=sheet_dir,
            structure=structure,
            summary_payload=summary_payload,
            header=header,
            data_rows=data_rows,
            aggregated_values_payload=aggregated_values_payload,
        )
        static_cells: dict[str, Any] = self._load_static_cells(sheet_dir=sheet_dir, structure=structure)
        formulas: list[dict[str, Any]] = self._restore_formula_attributes_from_original_sheet(
            formulas=self._load_formulas(sheet_dir=sheet_dir, formulas_payload=formulas_payload),
            sheet_path=original_sheet_path,
        )
        styles: dict[str, Any] = self._load_styles(
            sheet_dir=sheet_dir,
            styles_payload=styles_payload,
            structure=structure,
        )
        return {
            "structure": structure,
            "tabular_layout": tabular_layout,
            "static_cells": static_cells,
            "formulas": formulas,
            "styles": styles,
            "compressed_layout_payload": compressed_layout_payload,
            "cells": self._build_desired_cells(
                structure=structure,
                static_cells=static_cells,
                formulas=formulas,
                styles=styles,
                tabular_layout=tabular_layout,
            ),
        }

    def _build_desired_cells(
        self,
        *,
        structure: dict[str, Any],
        static_cells: dict[str, Any],
        formulas: list[dict[str, Any]],
        styles: dict[str, dict[str, Any]],
        tabular_layout: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        desired_cells: dict[str, dict[str, Any]] = {}
        layout: dict[str, Any] = dict(tabular_layout or {})
        start_col: int = int(layout.get("start_col", 0))
        header_row_index: int = int(layout.get("header_row_index", 0))
        first_data_row_index: int = int(layout.get("first_data_row_index", header_row_index + 1))
        render_header: list[str] = [str(value) for value in list(layout.get("header", []))]
        render_data_rows: list[list[str]] = [
            [str(value) for value in list(row)]
            for row in list(layout.get("data_rows", []))
        ]
        include_header_row: bool = bool(layout.get("include_header_row", len(render_header) > 0))
        column_types: list[str] = [str(value) for value in list(layout.get("column_types", []))]

        if include_header_row and header_row_index > 0:
            for index, value in enumerate(render_header):
                cell_reference: str = coordinates_to_cell_reference(
                    row_index=header_row_index,
                    column_index=start_col + index,
                )
                desired_cells[cell_reference] = {
                    "value": value,
                    "data_type": self._resolve_cell_type(
                        style_entry=styles.get(cell_reference),
                        fallback_type="string",
                    ),
                    "style_entry": styles.get(cell_reference),
                }
        for row_offset, row_values in enumerate(render_data_rows, start=first_data_row_index):
            for index, value in enumerate(row_values):
                cell_reference = coordinates_to_cell_reference(
                    row_index=row_offset,
                    column_index=start_col + index,
                )
                fallback_type: str = (
                    column_types[index] if index < len(column_types) else "string"
                )
                desired_cells[cell_reference] = {
                    "value": value,
                    "data_type": self._resolve_cell_type(
                        style_entry=styles.get(cell_reference),
                        fallback_type=fallback_type,
                    ),
                    "style_entry": styles.get(cell_reference),
                }
        for formula_entry in formulas:
            cell_reference = str(formula_entry["cell"])
            desired_cells[cell_reference] = {
                "formula": str(formula_entry["formula"]),
                "formula_attributes": {
                    str(key): str(value)
                    for key, value in dict(formula_entry.get("formula_attributes", {})).items()
                },
                "cached_value": formula_entry.get("cached_value"),
                "style_entry": styles.get(cell_reference),
            }
        for cell_reference, value in static_cells.items():
            if cell_reference in desired_cells and "formula" in desired_cells[cell_reference]:
                continue
            desired_cells[cell_reference] = {
                "value": str(value),
                "data_type": self._resolve_cell_type(
                    style_entry=styles.get(cell_reference),
                    fallback_type="string",
                ),
                "style_entry": styles.get(cell_reference),
            }
        for cell_reference, style_entry in styles.items():
            desired_cells.setdefault(
                str(cell_reference),
                {
                    "style_entry": dict(style_entry),
                },
            )
        return desired_cells

    def _patch_worksheet_xml(
        self,
        *,
        sheet_path: Path,
        desired_sheet: dict[str, Any],
        shared_strings: list[str],
        shared_string_lookup: dict[str, int],
    ) -> bool:
        original_xml: bytes = sheet_path.read_bytes()
        worksheet: ET.Element = ET.fromstring(original_xml)
        sheet_data: ET.Element | None = worksheet.find(f"{{{MAIN_NS}}}sheetData")
        if sheet_data is None:
            raise ValueError(f"Worksheet is missing sheetData: {sheet_path}")
        original_rows: dict[int, ET.Element] = {
            int(str(row.attrib.get("r", "0") or "0")): row
            for row in sheet_data.findall(f"{{{MAIN_NS}}}row")
            if str(row.attrib.get("r", "")).strip() != ""
        }
        row_attributes: dict[str, dict[str, str]] = self._load_row_attributes(
            structure=desired_sheet["structure"]
        )
        changed: bool = False
        for cell_reference, desired_cell in desired_sheet["cells"].items():
            row_index, _column_index = cell_reference_to_coordinates(cell_reference=cell_reference)
            row_node: ET.Element = self._ensure_row_node(
                sheet_data=sheet_data,
                rows_by_index=original_rows,
                row_index=row_index,
                row_attributes=row_attributes,
            )
            existing_cell: ET.Element | None = self._find_cell_node(
                row_node=row_node,
                cell_reference=cell_reference,
            )
            original_payload: dict[str, Any] | None = None
            if existing_cell is not None:
                original_payload = self._read_cell_payload_from_xml(
                    cell_node=existing_cell,
                    shared_strings=shared_strings,
                )
            if self._desired_cell_matches_original(
                desired_cell=desired_cell,
                original_payload=original_payload,
            ):
                continue
            replacement_cell: ET.Element = self._build_cell_node_from_payload(
                cell_reference=cell_reference,
                desired_cell=desired_cell,
                original_payload=original_payload,
                shared_strings=shared_strings,
                shared_string_lookup=shared_string_lookup,
            )
            self._replace_or_insert_cell(
                row_node=row_node,
                existing_cell=existing_cell,
                replacement_cell=replacement_cell,
            )
            changed = True
        if not changed:
            return False
        self._update_dimension_ref(
            worksheet=worksheet,
            structure=desired_sheet["structure"],
            compressed_layout_payload=desired_sheet.get("compressed_layout_payload"),
            desired_cells=desired_sheet["cells"],
        )
        sheet_path.write_bytes(ET.tostring(worksheet, encoding="utf-8", xml_declaration=True))
        return True

    def _load_shared_strings_state(
        self,
        *,
        shared_strings_path: Path,
    ) -> tuple[list[str], dict[str, int]]:
        if not shared_strings_path.exists():
            return [], {}
        root: ET.Element = ET.fromstring(shared_strings_path.read_bytes())
        values: list[str] = []
        lookup: dict[str, int] = {}
        for index, string_item in enumerate(root.findall(f"{{{MAIN_NS}}}si")):
            value: str = self._read_shared_string_item(string_item=string_item)
            values.append(value)
            lookup.setdefault(value, index)
        return values, lookup

    def _write_shared_strings_state(
        self,
        *,
        shared_strings_path: Path,
        shared_strings: list[str],
    ) -> None:
        root: ET.Element = ET.Element(
            f"{{{MAIN_NS}}}sst",
            {
                "count": str(len(shared_strings)),
                "uniqueCount": str(len(shared_strings)),
            },
        )
        for value in shared_strings:
            string_item: ET.Element = ET.SubElement(root, f"{{{MAIN_NS}}}si")
            text_node: ET.Element = ET.SubElement(string_item, f"{{{MAIN_NS}}}t")
            text_node.text = str(value)
        shared_strings_path.parent.mkdir(parents=True, exist_ok=True)
        shared_strings_path.write_bytes(
            ET.tostring(root, encoding="utf-8", xml_declaration=True)
        )

    def _read_shared_string_item(self, *, string_item: ET.Element) -> str:
        text_nodes: list[ET.Element] = string_item.findall(f".//{{{MAIN_NS}}}t")
        if text_nodes:
            return "".join(node.text or "" for node in text_nodes)
        return "".join(string_item.itertext())

    def _find_cell_node(
        self,
        *,
        row_node: ET.Element,
        cell_reference: str,
    ) -> ET.Element | None:
        for cell_node in row_node.findall(f"{{{MAIN_NS}}}c"):
            if str(cell_node.attrib.get("r", "")) == cell_reference:
                return cell_node
        return None

    def _ensure_row_node(
        self,
        *,
        sheet_data: ET.Element,
        rows_by_index: dict[int, ET.Element],
        row_index: int,
        row_attributes: dict[str, dict[str, str]],
    ) -> ET.Element:
        existing_row: ET.Element | None = rows_by_index.get(row_index)
        if existing_row is not None:
            return existing_row
        row_node_attributes: dict[str, str] = {"r": str(row_index)}
        if str(row_index) in row_attributes:
            row_node_attributes.update(
                {
                    str(key): str(value)
                    for key, value in row_attributes[str(row_index)].items()
                    if key != "r"
                }
            )
        new_row: ET.Element = ET.Element(f"{{{MAIN_NS}}}row", row_node_attributes)
        inserted: bool = False
        row_children: list[ET.Element] = list(sheet_data)
        for child_index, child_row in enumerate(row_children):
            child_row_index: int = int(str(child_row.attrib.get("r", "0") or "0"))
            if child_row_index > row_index:
                sheet_data.insert(child_index, new_row)
                inserted = True
                break
        if not inserted:
            sheet_data.append(new_row)
        rows_by_index[row_index] = new_row
        return new_row

    def _replace_or_insert_cell(
        self,
        *,
        row_node: ET.Element,
        existing_cell: ET.Element | None,
        replacement_cell: ET.Element,
    ) -> None:
        if existing_cell is not None:
            child_nodes: list[ET.Element] = list(row_node)
            for index, child in enumerate(child_nodes):
                if child is existing_cell:
                    row_node.remove(existing_cell)
                    row_node.insert(index, replacement_cell)
                    return
        row_index, column_index = cell_reference_to_coordinates(
            cell_reference=str(replacement_cell.attrib["r"])
        )
        del row_index
        inserted: bool = False
        for child_index, child in enumerate(list(row_node)):
            _existing_row, existing_col = cell_reference_to_coordinates(
                cell_reference=str(child.attrib.get("r", ""))
            )
            if existing_col > column_index:
                row_node.insert(child_index, replacement_cell)
                inserted = True
                break
        if not inserted:
            row_node.append(replacement_cell)

    def _read_cell_payload_from_xml(
        self,
        *,
        cell_node: ET.Element,
        shared_strings: list[str],
    ) -> dict[str, Any]:
        cell_type: str = str(cell_node.attrib.get("t", ""))
        payload: dict[str, Any] = {
            "style_id": self._read_optional_style_id(cell_node=cell_node),
            "cell_type": cell_type,
            "value": self._read_cell_value_from_xml(
                cell_node=cell_node,
                shared_strings=shared_strings,
            ),
            "formula": None,
            "formula_attributes": {},
        }
        formula_node: ET.Element | None = cell_node.find(f"{{{MAIN_NS}}}f")
        if formula_node is not None:
            payload["formula"] = f"={formula_node.text or ''}"
            payload["formula_attributes"] = {
                str(key): str(value)
                for key, value in formula_node.attrib.items()
            }
        return payload

    def _read_optional_style_id(self, *, cell_node: ET.Element) -> int | None:
        style_id: str = str(cell_node.attrib.get("s", "")).strip()
        if style_id == "":
            return None
        return int(style_id)

    def _read_cell_value_from_xml(
        self,
        *,
        cell_node: ET.Element,
        shared_strings: list[str],
    ) -> str:
        cell_type: str = str(cell_node.attrib.get("t", ""))
        if cell_type == "inlineStr":
            inline_node: ET.Element | None = cell_node.find(f"{{{MAIN_NS}}}is")
            if inline_node is None:
                return ""
            return "".join(inline_node.itertext())
        value_node: ET.Element | None = cell_node.find(f"{{{MAIN_NS}}}v")
        raw_value: str = value_node.text if value_node is not None and value_node.text is not None else ""
        if cell_type == "s":
            if raw_value == "":
                return ""
            index: int = int(raw_value)
            if 0 <= index < len(shared_strings):
                return str(shared_strings[index])
            return ""
        return raw_value

    def _desired_cell_matches_original(
        self,
        *,
        desired_cell: dict[str, Any],
        original_payload: dict[str, Any] | None,
    ) -> bool:
        if original_payload is None:
            return False
        desired_style_id: int | None = self._style_id_from_entry(
            style_entry=desired_cell.get("style_entry")
        )
        if desired_style_id != original_payload.get("style_id"):
            return False
        if "formula" in desired_cell:
            if str(desired_cell.get("formula", "")) != str(original_payload.get("formula", "")):
                return False
            if {
                str(key): str(value)
                for key, value in dict(desired_cell.get("formula_attributes", {})).items()
            } != {
                str(key): str(value)
                for key, value in dict(original_payload.get("formula_attributes", {})).items()
            }:
                return False
            desired_cached_value: str = (
                "" if desired_cell.get("cached_value") is None else str(desired_cell.get("cached_value"))
            )
            return desired_cached_value == str(original_payload.get("value", ""))
        if "value" not in desired_cell:
            return True
        desired_value: str = str(desired_cell.get("value", ""))
        if desired_value != str(original_payload.get("value", "")):
            return False
        desired_data_type: str = str(desired_cell.get("data_type", ""))
        original_cell_type: str = str(original_payload.get("cell_type", ""))
        if desired_data_type == "boolean":
            return original_cell_type == "b"
        if desired_data_type in {"number", "integer"}:
            return original_cell_type in {"", "n", None}
        if desired_data_type == "shared_string":
            return original_cell_type == "s"
        return original_cell_type in {"inlineStr", "s", ""}

    def _build_cell_node_from_payload(
        self,
        *,
        cell_reference: str,
        desired_cell: dict[str, Any],
        original_payload: dict[str, Any] | None,
        shared_strings: list[str],
        shared_string_lookup: dict[str, int],
    ) -> ET.Element:
        style_entry: dict[str, Any] | None = (
            dict(desired_cell["style_entry"])
            if desired_cell.get("style_entry") is not None
            else None
        )
        if "formula" in desired_cell:
            return self._make_formula_cell_node(
                cell_reference=cell_reference,
                formula=str(desired_cell.get("formula", "")),
                formula_attributes={
                    str(key): str(value)
                    for key, value in dict(desired_cell.get("formula_attributes", {})).items()
                },
                cached_value=desired_cell.get("cached_value"),
                style_entry=style_entry,
            )
        data_type: str = str(desired_cell.get("data_type", "string"))
        value: str = str(desired_cell.get("value", ""))
        string_storage: str = self._resolve_string_storage_mode(
            original_payload=original_payload,
            shared_strings=shared_strings,
        )
        return self._make_value_cell_node(
            cell_reference=cell_reference,
            value=value,
            data_type=data_type,
            style_entry=style_entry,
            string_storage=string_storage,
            shared_string_lookup=shared_string_lookup,
            shared_strings=shared_strings,
        )

    def _make_formula_cell_node(
        self,
        *,
        cell_reference: str,
        formula: str,
        formula_attributes: dict[str, str],
        cached_value: Any,
        style_entry: dict[str, Any] | None,
    ) -> ET.Element:
        attributes: dict[str, str] = {"r": cell_reference}
        style_id: int | None = self._style_id_from_entry(style_entry=style_entry)
        if style_id is not None:
            attributes["s"] = str(style_id)
        cell_node: ET.Element = ET.Element(f"{{{MAIN_NS}}}c", attributes)
        formula_node: ET.Element = ET.SubElement(
            cell_node,
            f"{{{MAIN_NS}}}f",
            formula_attributes,
        )
        formula_text: str = formula.removeprefix("=")
        if formula_text != "":
            formula_node.text = formula_text
        if cached_value is not None and str(cached_value) != "":
            value_node: ET.Element = ET.SubElement(cell_node, f"{{{MAIN_NS}}}v")
            value_node.text = str(cached_value)
        return cell_node

    def _make_value_cell_node(
        self,
        *,
        cell_reference: str,
        value: str,
        data_type: str,
        style_entry: dict[str, Any] | None,
        string_storage: str,
        shared_string_lookup: dict[str, int],
        shared_strings: list[str],
    ) -> ET.Element:
        attributes: dict[str, str] = {"r": cell_reference}
        style_id: int | None = self._style_id_from_entry(style_entry=style_entry)
        if style_id is not None:
            attributes["s"] = str(style_id)
        if value == "":
            return ET.Element(f"{{{MAIN_NS}}}c", attributes)
        if data_type in {"number", "integer"}:
            cell_node = ET.Element(f"{{{MAIN_NS}}}c", attributes)
            if value != "":
                ET.SubElement(cell_node, f"{{{MAIN_NS}}}v").text = value
            return cell_node
        if data_type == "boolean":
            attributes["t"] = "b"
            cell_node = ET.Element(f"{{{MAIN_NS}}}c", attributes)
            ET.SubElement(cell_node, f"{{{MAIN_NS}}}v").text = (
                "1" if value.upper() in {"TRUE", "1"} else "0"
            )
            return cell_node
        if string_storage == "shared":
            attributes["t"] = "s"
            cell_node = ET.Element(f"{{{MAIN_NS}}}c", attributes)
            string_index: int = self._ensure_shared_string_index(
                value=value,
                shared_strings=shared_strings,
                shared_string_lookup=shared_string_lookup,
            )
            ET.SubElement(cell_node, f"{{{MAIN_NS}}}v").text = str(string_index)
            return cell_node
        attributes["t"] = "inlineStr"
        cell_node = ET.Element(f"{{{MAIN_NS}}}c", attributes)
        inline_string: ET.Element = ET.SubElement(cell_node, f"{{{MAIN_NS}}}is")
        ET.SubElement(inline_string, f"{{{MAIN_NS}}}t").text = value
        return cell_node

    def _style_id_from_entry(self, *, style_entry: dict[str, Any] | None) -> int | None:
        if style_entry is None or "style_id" not in style_entry:
            return None
        return int(style_entry["style_id"])

    def _resolve_string_storage_mode(
        self,
        *,
        original_payload: dict[str, Any] | None,
        shared_strings: list[str],
    ) -> str:
        if original_payload is not None and str(original_payload.get("cell_type", "")) == "s":
            return "shared"
        if original_payload is not None and str(original_payload.get("cell_type", "")) == "inlineStr":
            return "inline"
        return "shared" if len(shared_strings) > 0 else "inline"

    def _ensure_shared_string_index(
        self,
        *,
        value: str,
        shared_strings: list[str],
        shared_string_lookup: dict[str, int],
    ) -> int:
        if value in shared_string_lookup:
            return int(shared_string_lookup[value])
        shared_strings.append(value)
        new_index: int = len(shared_strings) - 1
        shared_string_lookup[value] = new_index
        return new_index

    def _update_dimension_ref(
        self,
        *,
        worksheet: ET.Element,
        structure: dict[str, Any],
        compressed_layout_payload: dict[str, Any] | None,
        desired_cells: dict[str, dict[str, Any]],
    ) -> None:
        max_row: int = int(dict(structure.get("dimensions", {})).get("max_row", 1))
        max_col: int = int(dict(structure.get("dimensions", {})).get("max_col", 1))
        original_dimensions: dict[str, Any] = dict(
            (compressed_layout_payload or {}).get("original_dimensions", {})
        )
        max_row = max(max_row, int(original_dimensions.get("max_row", 0)))
        max_col = max(max_col, int(original_dimensions.get("max_col", 0)))
        for cell_reference in desired_cells:
            row_index, column_index = cell_reference_to_coordinates(
                cell_reference=str(cell_reference)
            )
            max_row = max(max_row, row_index)
            max_col = max(max_col, column_index)
        dimension_node: ET.Element | None = worksheet.find(f"{{{MAIN_NS}}}dimension")
        if dimension_node is None:
            dimension_node = ET.Element(f"{{{MAIN_NS}}}dimension")
            worksheet.insert(0, dimension_node)
        dimension_node.attrib["ref"] = f"A1:{coordinates_to_cell_reference(row_index=max_row, column_index=max_col)}"

    def _write_xlsx_from_directory(
        self,
        *,
        source_dir: Path,
        output_path: Path,
    ) -> None:
        with zipfile.ZipFile(file=output_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in sorted(source_dir.rglob("*")):
                if not file_path.is_file():
                    continue
                archive.write(
                    filename=file_path,
                    arcname=file_path.relative_to(source_dir).as_posix(),
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
    ) -> dict[str, dict[str, Any]]:
        styles: dict[str, dict[str, Any]] = {}
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
        styles: dict[str, dict[str, Any]],
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
        styles: dict[str, dict[str, Any]],
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

    def _resolve_tabular_layout(
        self,
        *,
        sheet_dir: Path,
        structure: dict[str, Any],
        summary_payload: dict[str, Any],
        header: list[str],
        data_rows: list[list[str]],
        aggregated_values_payload: dict[str, Any] | None,
    ) -> dict[str, Any]:
        data_region: dict[str, Any] = dict(structure.get("data_region", {}))
        start_col: int = int(data_region.get("start_col", 0))
        header_row_index: int = int(data_region.get("header_row_index", 0))
        if start_col > 0 and header_row_index > 0 and len(header) > 0:
            return {
                "start_col": start_col,
                "header_row_index": header_row_index,
                "first_data_row_index": header_row_index + 1,
                "header": list(header),
                "data_rows": [list(row) for row in data_rows],
                "include_header_row": True,
                "column_types": [str(column.get("data_type", "string")) for column in structure.get("columns", [])],
            }
        region_meta: dict[str, Any] | None = self._read_primary_region_meta(
            sheet_dir=sheet_dir,
            structure=structure,
        )
        if region_meta is None:
            region_meta = self._build_fallback_region_meta_from_aggregation(
                structure=structure,
                summary_payload=summary_payload,
                aggregated_values_payload=aggregated_values_payload or {},
                header=header,
            )
        if region_meta is None:
            return {
                "start_col": max(start_col, 1),
                "header_row_index": max(header_row_index, 1),
                "first_data_row_index": max(header_row_index + 1, 2),
                "header": list(header),
                "data_rows": [list(row) for row in data_rows],
                "include_header_row": len(header) > 0,
                "column_types": [str(column.get("data_type", "string")) for column in structure.get("columns", [])],
            }
        bbox: dict[str, Any] = dict(region_meta.get("bbox", {}))
        start_row: int = int(bbox.get("start_row", 1))
        start_col = int(bbox.get("start_col", max(start_col, 1)))
        storage_format: str = str(region_meta.get("storage_format", "table_tsv"))
        if storage_format == "grid_tsv":
            return {
                "start_col": start_col,
                "header_row_index": start_row,
                "first_data_row_index": start_row,
                "header": [],
                "data_rows": [list(row) for row in data_rows],
                "include_header_row": False,
                "column_types": [],
            }
        header_bbox: dict[str, Any] = dict(region_meta.get("header_bbox") or {})
        data_bbox: dict[str, Any] = dict(region_meta.get("data_bbox") or {})
        resolved_header_row_index: int = int(header_bbox.get("start_row", start_row))
        resolved_first_data_row_index: int = int(
            data_bbox.get("start_row", resolved_header_row_index + 1)
        )
        return {
            "start_col": start_col,
            "header_row_index": resolved_header_row_index,
            "first_data_row_index": resolved_first_data_row_index,
            "header": list(header),
            "data_rows": [list(row) for row in data_rows],
            "include_header_row": len(header) > 0,
            "column_types": [str(column.get("data_type", "string")) for column in structure.get("columns", [])],
        }

    def _read_primary_region_meta(
        self,
        *,
        sheet_dir: Path,
        structure: dict[str, Any],
    ) -> dict[str, Any] | None:
        regions_path: Path = sheet_dir / "regions.yaml"
        if not regions_path.exists():
            return None
        regions_payload: dict[str, Any] = read_yaml_file(path=regions_path)
        primary_region_id: str = str(
            structure.get("primary_region_id", regions_payload.get("primary_region_id", ""))
        ).strip()
        if primary_region_id == "":
            primary_region_id = str(regions_payload.get("primary_region_id", "")).strip()
        if primary_region_id == "":
            return None
        for region in list(regions_payload.get("regions", [])):
            region_payload: dict[str, Any] = dict(region)
            if str(region_payload.get("region_id", "")).strip() != primary_region_id:
                continue
            embedded_meta: dict[str, Any] = dict(region_payload.get("meta", {}))
            if len(embedded_meta) > 0:
                return embedded_meta
            return None
        return None

    def _build_fallback_region_meta_from_aggregation(
        self,
        *,
        structure: dict[str, Any],
        summary_payload: dict[str, Any],
        aggregated_values_payload: dict[str, Any],
        header: list[str],
    ) -> dict[str, Any] | None:
        aggregated_regions: list[dict[str, Any]] = [
            dict(item) for item in aggregated_values_payload.get("regions", [])
        ]
        if len(aggregated_regions) == 0:
            return None
        primary_region_id: str = str(
            summary_payload.get(
                "primary_region_id",
                structure.get("primary_region_id", ""),
            )
        ).strip()
        selected_region: dict[str, Any] | None = None
        if primary_region_id != "":
            for region in aggregated_regions:
                if str(region.get("region_id", "")).strip() == primary_region_id:
                    selected_region = region
                    break
        if selected_region is None:
            selected_region = aggregated_regions[0]
        bbox: dict[str, Any] = dict(selected_region.get("bbox", {}))
        if len(bbox) == 0:
            return None
        start_row: int = int(bbox.get("start_row", 1))
        start_col: int = int(bbox.get("start_col", 1))
        include_header_row: bool = len(header) > 0
        storage_format: str = "table_tsv" if include_header_row else "grid_tsv"
        return {
            "bbox": bbox,
            "storage_format": storage_format,
            "header_bbox": (
                {
                    "start_row": start_row,
                    "end_row": start_row,
                    "start_col": start_col,
                    "end_col": start_col + max(len(header), 1) - 1,
                }
                if include_header_row
                else None
            ),
            "data_bbox": {
                "start_row": start_row + (1 if include_header_row else 0),
                "end_row": int(bbox.get("end_row", start_row)),
                "start_col": start_col,
                "end_col": int(bbox.get("end_col", start_col)),
            },
        }

    def _build_sheet_xml(
        self,
        structure: dict[str, Any],
        formulas: list[dict[str, Any]],
        validations: list[dict[str, Any]],
        tables: list[dict[str, Any]],
        styles: dict[str, dict[str, Any]],
        header: list[str],
        data_rows: list[list[str]],
        tabular_layout: dict[str, Any] | None = None,
        compressed_layout_payload: dict[str, Any] | None = None,
    ) -> bytes:
        formulas_by_cell: dict[str, dict[str, Any]] = {str(item["cell"]): item for item in formulas}
        worksheet: ET.Element = ET.Element(f"{{{MAIN_NS}}}worksheet")
        self._append_raw_node(worksheet=worksheet, node_xml=structure.get("sheet_pr_xml"))
        layout: dict[str, Any] = dict(tabular_layout or {})
        render_header: list[str] = [str(value) for value in list(layout.get("header", header))]
        render_data_rows: list[list[str]] = [
            [str(value) for value in list(row)]
            for row in list(layout.get("data_rows", data_rows))
        ]
        start_col: int = int(
            layout.get("start_col", dict(structure.get("data_region", {})).get("start_col", 1))
        )
        header_row_index: int = int(
            layout.get(
                "header_row_index",
                dict(structure.get("data_region", {})).get("header_row_index", 1),
            )
        )
        first_data_row_index: int = int(
            layout.get("first_data_row_index", header_row_index + 1)
        )
        include_header_row: bool = bool(
            layout.get("include_header_row", len(render_header) > 0)
        )
        rendered_row_indexes: list[int] = []
        if include_header_row and len(render_header) > 0 and header_row_index > 0:
            rendered_row_indexes.append(header_row_index)
        if len(render_data_rows) > 0:
            rendered_row_indexes.extend(
                range(first_data_row_index, first_data_row_index + len(render_data_rows))
            )
        compressed_original_dimensions: dict[str, Any] = dict(
            (compressed_layout_payload or {}).get("original_dimensions", {})
        )
        max_row: int = max(
            [
                int(structure["dimensions"]["max_row"]),
                int(compressed_original_dimensions.get("max_row", 0)),
                *rendered_row_indexes,
            ]
        )
        max_col: int = max(
            int(structure["dimensions"]["max_col"]),
            int(compressed_original_dimensions.get("max_col", 0)),
            start_col
            + max(
                len(render_header),
                max((len(row) for row in render_data_rows), default=0),
            )
            - 1,
        )
        ET.SubElement(worksheet, f"{{{MAIN_NS}}}dimension", {"ref": f"A1:{coordinates_to_cell_reference(row_index=max_row, column_index=max_col)}"})
        self._append_sheet_views(
            worksheet=worksheet,
            frozen_panes=structure.get("frozen_panes"),
            sheet_views_xml=structure.get("sheet_views_xml"),
        )
        self._append_sheet_format(worksheet=worksheet, sheet_format=structure.get("sheet_format"))
        self._append_column_definitions(worksheet=worksheet, column_definitions=list(structure.get("column_definitions", [])))
        sheet_data: ET.Element = ET.SubElement(worksheet, f"{{{MAIN_NS}}}sheetData")
        row_nodes_by_index: dict[int, ET.Element] = {}
        rendered_formula_cells: set[str] = set()
        row_attributes: dict[str, dict[str, str]] = self._load_row_attributes(
            structure=structure
        )
        static_cells_by_row: dict[int, dict[int, str]] = self._build_static_cells_by_row(static_cells=dict(structure.get("static_cells", {})))
        styles_by_row: dict[int, dict[int, dict[str, Any]]] = self._build_styles_by_row(styles=styles)
        has_tabular_region: bool = start_col > 0 and (
            (include_header_row and header_row_index > 0 and len(render_header) > 0)
            or len(render_data_rows) > 0
        )
        if has_tabular_region:
            pending_rows: dict[int, dict[str, Any]] = {}
            if include_header_row and len(render_header) > 0:
                pending_rows[header_row_index] = {
                    "values_by_column": self._merge_row_values(
                        primary_values={
                            start_col + index: value
                            for index, value in enumerate(render_header)
                            if value != ""
                        },
                        secondary_values=static_cells_by_row.get(header_row_index),
                    ),
                    "style_entries_by_column": styles_by_row.get(header_row_index),
                    "row_attributes": row_attributes.get(str(header_row_index)),
                    "column_types_by_column": None,
                }
            column_types: list[str] = [str(value) for value in list(layout.get("column_types", []))]
            for row_offset, row_values in enumerate(render_data_rows, start=first_data_row_index):
                row_values_by_column: dict[int, str] = {}
                for index, value in enumerate(row_values):
                    if value == "":
                        continue
                    row_values_by_column[start_col + index] = value
                pending_rows[row_offset] = {
                    "values_by_column": self._merge_row_values(
                        primary_values=row_values_by_column,
                        secondary_values=static_cells_by_row.get(row_offset),
                    ),
                    "style_entries_by_column": styles_by_row.get(row_offset),
                    "row_attributes": row_attributes.get(str(row_offset)),
                    "column_types_by_column": (
                        {
                            start_col + index: column_type
                            for index, column_type in enumerate(column_types)
                        }
                        if len(column_types) > 0
                        else None
                    ),
                }
        populated_rows: set[int] = set()
        if has_tabular_region:
            populated_rows = set(rendered_row_indexes)
        supplemental_row_indexes: list[int] = sorted(set(static_cells_by_row.keys()) | set(styles_by_row.keys()))
        if not has_tabular_region:
            pending_rows = {}
        for row_index in supplemental_row_indexes:
            if row_index in populated_rows:
                continue
            pending_rows[row_index] = {
                "values_by_column": static_cells_by_row.get(row_index, {}),
                "style_entries_by_column": styles_by_row.get(row_index),
                "row_attributes": row_attributes.get(str(row_index)),
                "column_types_by_column": None,
            }
        remaining_formula_rows: dict[int, list[dict[str, Any]]] = {}
        tabular_min_row: int = min(rendered_row_indexes) if len(rendered_row_indexes) > 0 else 0
        tabular_max_row: int = max(rendered_row_indexes) if len(rendered_row_indexes) > 0 else 0
        for formula_entry in formulas:
            cell_reference: str = str(formula_entry["cell"])
            row_index: int = int("".join(character for character in cell_reference if character.isdigit()))
            if not has_tabular_region or row_index > tabular_max_row or row_index < tabular_min_row:
                remaining_formula_rows.setdefault(row_index, []).append(formula_entry)
        all_row_indexes: list[int] = sorted(
            set(pending_rows.keys()) | set(remaining_formula_rows.keys())
        )
        for row_index in all_row_indexes:
            row_spec: dict[str, Any] | None = pending_rows.get(row_index)
            row: ET.Element | None = None
            if row_spec is not None:
                row = self._append_static_row(
                    parent=sheet_data,
                    row_index=row_index,
                    values_by_column=dict(row_spec.get("values_by_column", {})),
                    formulas_by_cell=formulas_by_cell,
                    styles=styles,
                    style_entries_by_column=row_spec.get("style_entries_by_column"),
                    row_attributes=row_spec.get("row_attributes"),
                    column_types_by_column=row_spec.get("column_types_by_column"),
                    rendered_formula_cells=rendered_formula_cells,
                )
            if row is None and row_index in remaining_formula_rows:
                row_attributes_for_formula: dict[str, str] | None = row_attributes.get(
                    str(row_index)
                )
                row_node_attributes: dict[str, str] = {"r": str(row_index)}
                if row_attributes_for_formula is not None:
                    row_node_attributes.update(
                        {
                            str(key): str(value)
                            for key, value in row_attributes_for_formula.items()
                            if key != "r"
                        }
                    )
                row = ET.SubElement(
                    sheet_data,
                    f"{{{MAIN_NS}}}row",
                    row_node_attributes,
                )
            if row is None:
                continue
            row_nodes_by_index[row_index] = row
            for formula_entry in remaining_formula_rows.get(row_index, []):
                cell_reference = str(formula_entry["cell"])
                if cell_reference in rendered_formula_cells:
                    continue
                self._append_formula_cell(
                    parent=row,
                    cell_reference=cell_reference,
                    formula=str(formula_entry["formula"]),
                    formula_attributes={str(key): str(value) for key, value in dict(formula_entry.get("formula_attributes", {})).items()},
                    cached_value=formula_entry["cached_value"],
                    style_entry=styles.get(cell_reference),
                )
                rendered_formula_cells.add(cell_reference)
        filters: dict[str, Any] = dict(structure.get("filters", {}))
        if filters.get("enabled") and filters.get("ref"):
            ET.SubElement(worksheet, f"{{{MAIN_NS}}}autoFilter", {"ref": str(filters["ref"])})
        if structure["merged_ranges"]:
            merge_cells: ET.Element = ET.SubElement(worksheet, f"{{{MAIN_NS}}}mergeCells", {"count": str(len(structure["merged_ranges"]))})
            for merge_range in structure["merged_ranges"]:
                ET.SubElement(merge_cells, f"{{{MAIN_NS}}}mergeCell", {"ref": str(merge_range)})
        if validations:
            validations_parent: ET.Element = ET.SubElement(worksheet, f"{{{MAIN_NS}}}dataValidations", {"count": str(len(validations))})
            for validation in validations:
                self._append_validation(parent=validations_parent, validation=validation)
        self._append_raw_node(worksheet=worksheet, node_xml=structure.get("page_margins_xml"))
        self._append_raw_node(worksheet=worksheet, node_xml=structure.get("page_setup_xml"))
        self._append_raw_node(worksheet=worksheet, node_xml=structure.get("drawing_xml"))
        if tables:
            table_parts: ET.Element = ET.SubElement(worksheet, f"{{{MAIN_NS}}}tableParts", {"count": str(len(tables))})
            for table_index, _table in enumerate(tables, start=1):
                ET.SubElement(table_parts, f"{{{MAIN_NS}}}tablePart", {f"{{{REL_NS}}}id": f"rId{table_index}"})
        return ET.tostring(worksheet, encoding="utf-8", xml_declaration=True)

    def _restore_formula_attributes_from_original_sheet(
        self,
        formulas: list[dict[str, Any]],
        sheet_path: Path,
    ) -> list[dict[str, Any]]:
        original_formula_attributes: dict[str, dict[str, str]] = self._read_original_formula_attributes(
            sheet_path=sheet_path,
        )
        restored_formulas: list[dict[str, Any]] = []
        for formula_entry in formulas:
            restored_entry: dict[str, Any] = dict(formula_entry)
            if len(dict(restored_entry.get("formula_attributes", {}))) == 0:
                restored_entry["formula_attributes"] = dict(original_formula_attributes.get(str(restored_entry["cell"]), {}))
            restored_formulas.append(restored_entry)
        return restored_formulas

    def _read_original_formula_attributes(self, sheet_path: Path) -> dict[str, dict[str, str]]:
        if not sheet_path.exists():
            return {}
        root: ET.Element = ET.parse(sheet_path).getroot()
        formula_attributes_by_cell: dict[str, dict[str, str]] = {}
        sheet_data: ET.Element | None = root.find(f"{{{MAIN_NS}}}sheetData")
        if sheet_data is None:
            return formula_attributes_by_cell
        for row_node in sheet_data.findall(f"{{{MAIN_NS}}}row"):
            for cell_node in row_node.findall(f"{{{MAIN_NS}}}c"):
                formula_node: ET.Element | None = cell_node.find(f"{{{MAIN_NS}}}f")
                if formula_node is None:
                    continue
                formula_attributes_by_cell[str(cell_node.attrib["r"])] = {
                    str(key): str(value) for key, value in formula_node.attrib.items()
                }
        return formula_attributes_by_cell

    @staticmethod
    def _resolve_ooxml_target(*, package_root: Path, target: str) -> Path:
        root: Path = package_root.resolve()
        sheet_path: Path = (root / target).resolve()
        try:
            sheet_path.relative_to(root)
        except ValueError as error:
            raise ValueError(f"Worksheet target escapes OOXML package: {target}") from error
        if not sheet_path.is_file():
            raise FileNotFoundError(f"Worksheet target was not found: {target}")
        return sheet_path

    def _append_static_row(
        self,
        parent: ET.Element,
        row_index: int,
        values_by_column: dict[int, str],
        formulas_by_cell: dict[str, dict[str, Any]],
        styles: dict[str, dict[str, Any]],
        style_entries_by_column: dict[int, dict[str, Any]] | None,
        row_attributes: dict[str, str] | None,
        column_types_by_column: dict[int, str] | None = None,
        rendered_formula_cells: set[str] | None = None,
    ) -> ET.Element | None:
        renderable_style_entries: dict[int, dict[str, Any]] = self._filter_renderable_style_columns(
            style_entries_by_column=style_entries_by_column
        )
        if len(values_by_column) == 0 and len(renderable_style_entries) == 0 and row_attributes is None:
            return None
        row_node_attributes: dict[str, str] = {"r": str(row_index)}
        if row_attributes is not None:
            row_node_attributes.update({str(key): str(value) for key, value in row_attributes.items() if key != "r"})
        row: ET.Element = ET.SubElement(parent, f"{{{MAIN_NS}}}row", row_node_attributes)
        for column_index in sorted(set(values_by_column.keys()) | set(renderable_style_entries.keys())):
            cell_reference: str = coordinates_to_cell_reference(row_index=row_index, column_index=column_index)
            formula_entry: dict[str, Any] | None = formulas_by_cell.get(cell_reference)
            if formula_entry is not None:
                self._append_formula_cell(
                    parent=row,
                    cell_reference=cell_reference,
                    formula=str(formula_entry["formula"]),
                    formula_attributes={str(key): str(value) for key, value in dict(formula_entry.get("formula_attributes", {})).items()},
                    cached_value=formula_entry["cached_value"],
                    style_entry=styles.get(cell_reference),
                )
                if rendered_formula_cells is not None:
                    rendered_formula_cells.add(cell_reference)
                continue
            if column_index not in values_by_column:
                self._append_empty_styled_cell(
                    parent=row,
                    cell_reference=cell_reference,
                    style_entry=renderable_style_entries[column_index],
                )
                continue
            value: str = str(values_by_column[column_index])
            self._append_value_cell(
                parent=row,
                cell_reference=cell_reference,
                value=value,
                data_type=self._resolve_cell_type(
                    style_entry=styles.get(cell_reference),
                    fallback_type=self._resolve_fallback_type(
                        column_types_by_column=column_types_by_column,
                        column_index=column_index,
                    ),
                ),
                style_entry=styles.get(cell_reference),
            )
        return row

    def _load_row_attributes(
        self, structure: dict[str, Any]
    ) -> dict[str, dict[str, str]]:
        row_attributes: dict[str, dict[str, str]] = {
            str(key): {
                str(attribute_name): str(attribute_value)
                for attribute_name, attribute_value in dict(value).items()
            }
            for key, value in dict(structure.get("row_attributes", {})).items()
        }
        for run_entry in list(structure.get("row_attribute_runs", [])):
            attrs: dict[str, str] = {
                str(attribute_name): str(attribute_value)
                for attribute_name, attribute_value in dict(
                    run_entry.get("attrs", {})
                ).items()
            }
            if len(attrs) == 0:
                continue
            row_start: int = int(run_entry.get("r1", 0))
            row_end: int = int(run_entry.get("r2", row_start))
            if row_start <= 0 or row_end < row_start:
                continue
            for row_index in range(row_start, row_end + 1):
                row_attributes.setdefault(str(row_index), dict(attrs))
        return row_attributes

    def _resolve_fallback_type(self, column_types_by_column: dict[int, str] | None, column_index: int) -> str:
        if column_types_by_column is None:
            return "string"
        return str(column_types_by_column.get(column_index, "string"))

    def _build_static_cells_by_row(self, static_cells: dict[str, Any]) -> dict[int, dict[int, str]]:
        static_cells_by_row: dict[int, dict[int, str]] = {}
        for cell_reference, value in static_cells.items():
            row_index: int
            column_index: int
            row_index, column_index = cell_reference_to_coordinates(cell_reference=str(cell_reference))
            static_cells_by_row.setdefault(row_index, {})[column_index] = str(value)
        return static_cells_by_row

    def _build_styles_by_row(self, styles: dict[str, dict[str, Any]]) -> dict[int, dict[int, dict[str, Any]]]:
        styles_by_row: dict[int, dict[int, dict[str, Any]]] = {}
        for cell_reference, style_entry in styles.items():
            row_index, column_index = cell_reference_to_coordinates(cell_reference=str(cell_reference))
            styles_by_row.setdefault(row_index, {})[column_index] = dict(style_entry)
        return styles_by_row

    def _filter_renderable_style_columns(self, style_entries_by_column: dict[int, dict[str, Any]] | None) -> dict[int, dict[str, Any]]:
        if style_entries_by_column is None:
            return {}
        renderable_style_entries: dict[int, dict[str, Any]] = {}
        for column_index, style_entry in style_entries_by_column.items():
            if "style_id" in style_entry:
                renderable_style_entries[column_index] = dict(style_entry)
        return renderable_style_entries

    def _merge_row_values(self, primary_values: dict[int, str], secondary_values: dict[int, str] | None) -> dict[int, str]:
        merged_values: dict[int, str] = dict(primary_values)
        if secondary_values is None:
            return merged_values
        for column_index, value in secondary_values.items():
            if column_index not in merged_values:
                merged_values[column_index] = str(value)
        return merged_values

    def _append_formula_cell(
        self,
        parent: ET.Element,
        cell_reference: str,
        formula: str,
        formula_attributes: dict[str, str],
        cached_value: Any,
        style_entry: dict[str, Any] | None,
    ) -> None:
        attributes: dict[str, str] = {"r": cell_reference}
        if style_entry is not None and "style_id" in style_entry:
            attributes["s"] = str(style_entry["style_id"])
        cell: ET.Element = ET.SubElement(parent, f"{{{MAIN_NS}}}c", attributes)
        formula_node: ET.Element = ET.SubElement(
            cell,
            f"{{{MAIN_NS}}}f",
            {str(key): str(value) for key, value in formula_attributes.items()},
        )
        formula_text: str = formula.removeprefix("=")
        if formula_text != "":
            formula_node.text = formula_text
        if cached_value is not None and str(cached_value) != "":
            ET.SubElement(cell, f"{{{MAIN_NS}}}v").text = str(cached_value)

    def _append_value_cell(self, parent: ET.Element, cell_reference: str, value: str, data_type: str, style_entry: dict[str, Any] | None) -> None:
        attributes: dict[str, str] = {"r": cell_reference}
        if style_entry is not None and "style_id" in style_entry:
            attributes["s"] = str(style_entry["style_id"])
        if data_type == "number":
            #[ACCEPTANCE]: Successful rebuild preserves imported style IDs and workbook stylesheet data.
            #[PLANS]: Expand the builder to rebuild tables and stylesheet relationships.
            cell: ET.Element = ET.SubElement(parent, f"{{{MAIN_NS}}}c", attributes)
            if value != "":
                ET.SubElement(cell, f"{{{MAIN_NS}}}v").text = value
            return
        if data_type == "boolean":
            normalized: str = "1" if value.upper() in {"TRUE", "1"} else "0"
            boolean_attributes: dict[str, str] = dict(attributes)
            boolean_attributes["t"] = "b"
            cell = ET.SubElement(parent, f"{{{MAIN_NS}}}c", boolean_attributes)
            ET.SubElement(cell, f"{{{MAIN_NS}}}v").text = normalized
            return
        if data_type == "shared_string":
            shared_attributes: dict[str, str] = dict(attributes)
            shared_attributes["t"] = "inlineStr"
            cell = ET.SubElement(parent, f"{{{MAIN_NS}}}c", shared_attributes)
            inline_string: ET.Element = ET.SubElement(cell, f"{{{MAIN_NS}}}is")
            ET.SubElement(inline_string, f"{{{MAIN_NS}}}t").text = value
            return
        inline_attributes: dict[str, str] = dict(attributes)
        inline_attributes["t"] = "inlineStr"
        cell = ET.SubElement(parent, f"{{{MAIN_NS}}}c", inline_attributes)
        inline_string: ET.Element = ET.SubElement(cell, f"{{{MAIN_NS}}}is")
        ET.SubElement(inline_string, f"{{{MAIN_NS}}}t").text = value

    def _append_empty_styled_cell(self, parent: ET.Element, cell_reference: str, style_entry: dict[str, Any]) -> None:
        attributes: dict[str, str] = {"r": cell_reference}
        if "style_id" in style_entry:
            attributes["s"] = str(style_entry["style_id"])
        ET.SubElement(parent, f"{{{MAIN_NS}}}c", attributes)

    def _resolve_cell_type(self, style_entry: dict[str, Any] | None, fallback_type: str) -> str:
        #[ACCEPTANCE]: Successful rebuild preserves imported style IDs and workbook stylesheet data.
        #[PLANS]: Expand the builder to rebuild tables and stylesheet relationships.
        if style_entry is None:
            if fallback_type in {"integer", "number"}:
                return "number"
            return fallback_type
        cell_type: str = str(style_entry.get("cell_type", ""))
        if cell_type != "":
            return cell_type
        if fallback_type in {"integer", "number"}:
            return "number"
        return fallback_type

    def _append_validation(self, parent: ET.Element, validation: dict[str, Any]) -> None:
        attributes: dict[str, str] = {}
        for attribute_name in [
            "sqref",
            "type",
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
            value: Any = validation.get(attribute_name)
            if value is not None and str(value) != "":
                attributes[attribute_name] = str(value)
        node: ET.Element = ET.SubElement(parent, f"{{{MAIN_NS}}}dataValidation", attributes)
        if validation.get("formula1") is not None:
            ET.SubElement(node, f"{{{MAIN_NS}}}formula1").text = str(validation["formula1"])
        if validation.get("formula2") is not None:
            ET.SubElement(node, f"{{{MAIN_NS}}}formula2").text = str(validation["formula2"])

    def _append_sheet_views(
        self,
        worksheet: ET.Element,
        frozen_panes: dict[str, Any] | None,
        sheet_views_xml: str | None,
    ) -> None:
        if sheet_views_xml is not None:
            self._append_raw_node(worksheet=worksheet, node_xml=sheet_views_xml)
            return
        if frozen_panes is None:
            return
        sheet_views: ET.Element = ET.SubElement(worksheet, f"{{{MAIN_NS}}}sheetViews")
        sheet_view: ET.Element = ET.SubElement(sheet_views, f"{{{MAIN_NS}}}sheetView", {"workbookViewId": "0"})
        pane_attributes: dict[str, str] = {}
        if frozen_panes.get("x_split") is not None:
            pane_attributes["xSplit"] = self._format_split_value(value=frozen_panes["x_split"])
        if frozen_panes.get("y_split") is not None:
            pane_attributes["ySplit"] = self._format_split_value(value=frozen_panes["y_split"])
        if frozen_panes.get("top_left_cell") is not None:
            pane_attributes["topLeftCell"] = str(frozen_panes["top_left_cell"])
        if frozen_panes.get("active_pane") is not None:
            pane_attributes["activePane"] = str(frozen_panes["active_pane"])
        if frozen_panes.get("state") is not None:
            pane_attributes["state"] = str(frozen_panes["state"])
        ET.SubElement(sheet_view, f"{{{MAIN_NS}}}pane", pane_attributes)

    def _append_sheet_format(self, worksheet: ET.Element, sheet_format: dict[str, Any] | None) -> None:
        if sheet_format is None:
            return
        ET.SubElement(
            worksheet,
            f"{{{MAIN_NS}}}sheetFormatPr",
            {str(key): str(value) for key, value in dict(sheet_format).items()},
        )

    def _append_column_definitions(self, worksheet: ET.Element, column_definitions: list[dict[str, Any]]) -> None:
        if len(column_definitions) == 0:
            return
        columns_parent: ET.Element = ET.SubElement(worksheet, f"{{{MAIN_NS}}}cols")
        for column_definition in column_definitions:
            ET.SubElement(
                columns_parent,
                f"{{{MAIN_NS}}}col",
                {str(key): str(value) for key, value in dict(column_definition).items()},
            )

    def _format_split_value(self, value: Any) -> str:
        numeric_value: float = float(value)
        if numeric_value.is_integer():
            return str(int(numeric_value))
        return str(numeric_value)

    def _append_raw_node(self, worksheet: ET.Element, node_xml: Any) -> None:
        if node_xml is None or str(node_xml) == "":
            return
        worksheet.append(ET.fromstring(str(node_xml)))

    def _write_static_files(
        self,
        archive: zipfile.ZipFile,
        sheet_entries: list[dict[str, Any]],
        sheet_order: list[str],
        names: list[dict[str, Any]],
        style_sheet_xml: str | None,
        theme_xml: str | None,
    ) -> None:
        written_extra_part_paths: set[str] = set()
        archive.writestr(
            "[Content_Types].xml",
            self._content_types_xml(
                sheet_entries=sheet_entries,
                has_styles=style_sheet_xml is not None,
                has_theme=theme_xml is not None,
            ),
        )
        archive.writestr("_rels/.rels", self._root_relationships_xml())
        archive.writestr("xl/workbook.xml", self._workbook_xml(sheet_entries=sheet_entries, sheet_order=sheet_order, names=names))
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            self._workbook_relationships_xml(
                sheet_entries=sheet_entries,
                has_styles=style_sheet_xml is not None,
                has_theme=theme_xml is not None,
            ),
        )
        archive.writestr("docProps/core.xml", self._core_xml())
        archive.writestr("docProps/app.xml", self._app_xml(sheet_entries=sheet_entries))
        #[ACCEPTANCE]: Successful rebuild preserves imported style IDs and workbook stylesheet data.
        #[PLANS]: Expand the builder to rebuild tables and stylesheet relationships.
        if style_sheet_xml is not None:
            archive.writestr("xl/styles.xml", style_sheet_xml)
        if theme_xml is not None:
            archive.writestr("xl/theme/theme1.xml", theme_xml)
        for entry in sheet_entries:
            archive.writestr(entry["xml_path"], entry["xml_bytes"])
            worksheet_relationships: list[dict[str, Any]] = list(entry["worksheet_relationships"])
            if entry["tables"] or worksheet_relationships:
                archive.writestr(
                    f"xl/worksheets/_rels/sheet{entry['index']}.xml.rels",
                    self._sheet_relationships_xml(
                        tables=entry["tables"],
                        worksheet_relationships=worksheet_relationships,
                    ),
                )
            for table in entry["tables"]:
                archive.writestr(f"xl/tables/{table['table_file']}", self._table_xml(table=table))
            for extra_part in entry["extra_parts"]:
                if str(extra_part["package_path"]) in written_extra_part_paths:
                    continue
                archive.writestr(str(extra_part["package_path"]), extra_part["bytes"])
                written_extra_part_paths.add(str(extra_part["package_path"]))

    def _content_types_xml(self, sheet_entries: list[dict[str, Any]], has_styles: bool, has_theme: bool) -> str:
        overrides: list[str] = [
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
            '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
            '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
        ]
        override_part_names: set[str] = {
            "/xl/workbook.xml",
            "/docProps/core.xml",
            "/docProps/app.xml",
        }
        if has_styles:
            self._append_content_type_override(
                overrides=overrides,
                override_part_names=override_part_names,
                package_path="xl/styles.xml",
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
            )
        if has_theme:
            self._append_content_type_override(
                overrides=overrides,
                override_part_names=override_part_names,
                package_path="xl/theme/theme1.xml",
                content_type="application/vnd.openxmlformats-officedocument.theme+xml",
            )
        for entry in sheet_entries:
            self._append_content_type_override(
                overrides=overrides,
                override_part_names=override_part_names,
                package_path=f'xl/worksheets/sheet{entry["index"]}.xml',
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
            )
            for table in entry["tables"]:
                self._append_content_type_override(
                    overrides=overrides,
                    override_part_names=override_part_names,
                    package_path=f'xl/tables/{table["table_file"]}',
                    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml",
                )
            for extra_part in entry["extra_parts"]:
                content_type: str = str(extra_part["content_type"])
                package_path: str = str(extra_part["package_path"])
                if content_type not in {"application/xml", "application/vnd.openxmlformats-package.relationships+xml"}:
                    #[ACCEPTANCE]: Successful build writes outputs/rebuilt.xlsx.
                    #[PLANS]: Expand the builder to rebuild tables and stylesheet relationships.
                    self._append_content_type_override(
                        overrides=overrides,
                        override_part_names=override_part_names,
                        package_path=package_path,
                        content_type=content_type,
                    )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            + "".join(overrides)
            + "</Types>"
        )

    def _append_content_type_override(
        self,
        overrides: list[str],
        override_part_names: set[str],
        package_path: str,
        content_type: str,
    ) -> None:
        override_part_name: str = f"/{package_path}"
        if override_part_name in override_part_names:
            return
        overrides.append(
            f'<Override PartName="{override_part_name}" '
            f'ContentType="{content_type}"/>'
        )
        override_part_names.add(override_part_name)

    def _root_relationships_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
            "</Relationships>"
        )

    def _workbook_xml(self, sheet_entries: list[dict[str, Any]], sheet_order: list[str], names: list[dict[str, Any]]) -> str:
        sheet_nodes: list[str] = []
        for entry in sheet_entries:
            attributes: list[str] = [
                f'name="{html.escape(str(entry["sheet_name"]))}"',
                f'sheetId="{entry["index"]}"',
            ]
            visibility: str = str(entry.get("visibility", "visible"))
            if visibility != "visible":
                attributes.append(f'state="{html.escape(visibility)}"')
            attributes.append(f'r:id="rId{entry["index"]}"')
            sheet_nodes.append(f"<sheet {' '.join(attributes)}/>")
        sheets_xml: str = "".join(sheet_nodes)
        sheet_index_by_slug: dict[str, int] = {sheet_slug: position for position, sheet_slug in enumerate(sheet_order)}
        defined_names_xml: str = ""
        if names:
            defined_name_nodes: list[str] = []
            for name_entry in names:
                attributes: list[str] = [f'name="{name_entry["name"]}"']
                scope: str = str(name_entry["scope"])
                if scope != "workbook":
                    attributes.append(f'localSheetId="{sheet_index_by_slug[scope]}"')
                if bool(name_entry.get("hidden")):
                    attributes.append('hidden="1"')
                escaped_name: str = html.escape(str(name_entry["name"]))
                attributes[0] = f'name="{escaped_name}"'
                defined_name_nodes.append(f"<definedName {' '.join(attributes)}>{html.escape(str(name_entry['formula']))}</definedName>")
            defined_names_xml = f"<definedNames>{''.join(defined_name_nodes)}</definedNames>"
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<sheets>{sheets_xml}</sheets>"
            f"{defined_names_xml}"
            "</workbook>"
        )

    def _workbook_relationships_xml(self, sheet_entries: list[dict[str, Any]], has_styles: bool, has_theme: bool) -> str:
        relationships: str = "".join(
            f'<Relationship Id="rId{entry["index"]}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{entry["index"]}.xml"/>'
            for entry in sheet_entries
        )
        if has_styles:
            next_id: int = len(sheet_entries) + 1
            relationships += (
                f'<Relationship Id="rId{next_id}" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
                'Target="styles.xml"/>'
            )
        if has_theme:
            next_id = len(sheet_entries) + 1 + (1 if has_styles else 0)
            relationships += (
                f'<Relationship Id="rId{next_id}" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" '
                'Target="theme/theme1.xml"/>'
            )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<Relationships xmlns="{PKG_REL_NS}">{relationships}</Relationships>'
        )

    def _core_xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            "<dc:title>XLSX Wiki Build</dc:title>"
            "</cp:coreProperties>"
        )

    def _app_xml(self, sheet_entries: list[dict[str, Any]]) -> str:
        titles: str = "".join(f"<vt:lpstr>{entry['sheet_name']}</vt:lpstr>" for entry in sheet_entries)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
            'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
            "<Application>XLSX Wiki</Application>"
            f"<TitlesOfParts><vt:vector size=\"{len(sheet_entries)}\" baseType=\"lpstr\">{titles}</vt:vector></TitlesOfParts>"
            "</Properties>"
        )

    def _sheet_relationships_xml(self, tables: list[dict[str, Any]], worksheet_relationships: list[dict[str, Any]]) -> str:
        relationships: list[str] = []
        for index, table in enumerate(tables, start=1):
            relationships.append(
                f'<Relationship Id="rId{index}" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" '
                f'Target="../tables/{table["table_file"]}"/>'
            )
        for relationship in worksheet_relationships:
            relationships.append(
                f'<Relationship Id="{html.escape(str(relationship["relationship_id"]))}" '
                f'Type="{html.escape(str(relationship["relationship_type"]))}" '
                f'Target="{html.escape(str(relationship["target"]))}"/>'
            )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<Relationships xmlns="{PKG_REL_NS}">{"".join(relationships)}</Relationships>'
        )

    def _read_extra_parts(
        self,
        extracted_dir: Path,
        worksheet_relationships: list[dict[str, Any]],
        content_types_map: dict[str, str],
    ) -> list[dict[str, Any]]:
        extra_parts_by_path: dict[str, dict[str, Any]] = {}
        for relationship in worksheet_relationships:
            package_path: str = str(relationship["package_path"])
            self._collect_extra_part(
                extracted_dir=extracted_dir,
                package_path=package_path,
                content_type=str(relationship["content_type"]),
                content_types_map=content_types_map,
                extra_parts_by_path=extra_parts_by_path,
            )
        return [extra_parts_by_path[path] for path in sorted(extra_parts_by_path.keys())]

    def _collect_extra_part(
        self,
        extracted_dir: Path,
        package_path: str,
        content_type: str,
        content_types_map: dict[str, str],
        extra_parts_by_path: dict[str, dict[str, Any]],
    ) -> None:
        if package_path in extra_parts_by_path:
            return
        part_path: Path = extracted_dir / package_path
        if not part_path.exists():
            return
        extra_parts_by_path[package_path] = {
            "package_path": package_path,
            "bytes": part_path.read_bytes(),
            "content_type": content_type,
        }
        rels_path: Path = part_path.parent / "_rels" / f"{part_path.name}.rels"
        if not rels_path.exists():
            return
        rels_package_path: str = rels_path.relative_to(extracted_dir).as_posix()
        extra_parts_by_path[rels_package_path] = {
            "package_path": rels_package_path,
            "bytes": rels_path.read_bytes(),
            "content_type": "application/vnd.openxmlformats-package.relationships+xml",
        }
        rel_root: ET.Element = ET.parse(rels_path).getroot()
        for node in rel_root.findall(f"{{{PKG_REL_NS}}}Relationship"):
            target: str = str(node.attrib["Target"])
            target_path: Path = self._resolve_relationship_target(
                package_root=extracted_dir,
                source_dir=part_path.parent,
                target=target,
            )
            target_package_path: str = target_path.resolve().relative_to(extracted_dir.resolve()).as_posix()
            self._collect_extra_part(
                extracted_dir=extracted_dir,
                package_path=target_package_path,
                content_type=content_types_map.get(target_package_path, "application/octet-stream"),
                content_types_map=content_types_map,
                extra_parts_by_path=extra_parts_by_path,
            )

    def _read_content_type_overrides(self, extracted_dir: Path) -> dict[str, str]:
        content_types_path: Path = extracted_dir / "[Content_Types].xml"
        root: ET.Element = ET.parse(content_types_path).getroot()
        namespace: str = "http://schemas.openxmlformats.org/package/2006/content-types"
        defaults: dict[str, str] = {}
        overrides: dict[str, str] = {}
        for default_node in root.findall(f"{{{namespace}}}Default"):
            defaults[str(default_node.attrib["Extension"])] = str(default_node.attrib["ContentType"])
        for override_node in root.findall(f"{{{namespace}}}Override"):
            overrides[str(override_node.attrib["PartName"]).removeprefix("/")] = str(override_node.attrib["ContentType"])
        content_types_map: dict[str, str] = {}
        for package_path, content_type in overrides.items():
            content_types_map[package_path] = content_type
        for package_path in [path.relative_to(extracted_dir).as_posix() for path in extracted_dir.rglob("*") if path.is_file()]:
            if package_path in content_types_map:
                continue
            extension: str = Path(package_path).suffix.removeprefix(".")
            if extension in defaults:
                content_types_map[package_path] = defaults[extension]
        return content_types_map

    def _resolve_relationship_target(self, package_root: Path, source_dir: Path, target: str) -> Path:
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

    def _table_xml(self, table: dict[str, Any]) -> str:
        auto_filter_xml: str = ""
        if table.get("auto_filter_ref") is not None:
            auto_filter_xml = f'<autoFilter ref="{html.escape(str(table["auto_filter_ref"]))}"/>'
        columns_xml: str = "".join(
            f'<tableColumn id="{column["id"]}" name="{html.escape(str(column["name"]))}"/>'
            for column in table["columns"]
        )
        style = table.get("style")
        style_xml: str = ""
        if style is not None:
            style_xml = (
                f'<tableStyleInfo name="{html.escape(str(style.get("name", "")))}" '
                f'showFirstColumn="{1 if style.get("show_first_column") else 0}" '
                f'showLastColumn="{1 if style.get("show_last_column") else 0}" '
                f'showRowStripes="{1 if style.get("show_row_stripes") else 0}" '
                f'showColumnStripes="{1 if style.get("show_column_stripes") else 0}"/>'
            )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            f'id="{table["id"]}" name="{html.escape(str(table["name"]))}" '
            f'displayName="{html.escape(str(table["display_name"]))}" '
            f'ref="{html.escape(str(table["ref"]))}" '
            f'headerRowCount="{table["header_row_count"]}" '
            f'totalsRowCount="{table["totals_row_count"]}">'
            f"{auto_filter_xml}"
            f'<tableColumns count="{len(table["columns"])}">{columns_xml}</tableColumns>'
            f"{style_xml}"
            "</table>"
        )
