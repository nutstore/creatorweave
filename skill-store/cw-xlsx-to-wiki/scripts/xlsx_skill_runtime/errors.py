"""Structured runtime errors for workbook import workflows."""

from __future__ import annotations


class WorkbookImportError(Exception):
    """Raised when workbook import fails with a user-facing error code."""

    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code: str = error_code
        self.message: str = message
