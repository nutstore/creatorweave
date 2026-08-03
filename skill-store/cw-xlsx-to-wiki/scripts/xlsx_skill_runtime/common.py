"""Common helpers shared across services."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def current_timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def slugify_sheet_name(sheet_name: str, position: int) -> str:
    normalized: str = re.sub(pattern=r"[^a-zA-Z0-9]+", repl="_", string=sheet_name.strip().lower())
    trimmed: str = normalized.strip("_")
    if trimmed:
        return trimmed
    return f"sheet_{position + 1}"


def column_index_to_letter(column_index: int) -> str:
    current_index: int = column_index
    letters: list[str] = []
    while current_index > 0:
        current_index, remainder = divmod(current_index - 1, 26)
        letters.append(chr(ord("A") + remainder))
    return "".join(reversed(letters))


def column_letter_to_index(column_letter: str) -> int:
    value: int = 0
    for character in column_letter:
        value = (value * 26) + (ord(character.upper()) - ord("A") + 1)
    return value


def cell_reference_to_coordinates(cell_reference: str) -> tuple[int, int]:
    match = re.fullmatch(pattern=r"([A-Z]+)([0-9]+)", string=cell_reference.upper())
    if match is None:
        raise ValueError(f"Invalid cell reference: {cell_reference}")
    column_index: int = column_letter_to_index(column_letter=match.group(1))
    row_index: int = int(match.group(2))
    return row_index, column_index


def coordinates_to_cell_reference(row_index: int, column_index: int) -> str:
    return f"{column_index_to_letter(column_index=column_index)}{row_index}"