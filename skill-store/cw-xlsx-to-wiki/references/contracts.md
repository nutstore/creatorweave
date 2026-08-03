# Contracts

## 命令与参数

| 命令 | 作用 | 必填参数 |
|---|---|---|
| `import` | 导入 `.xlsx` 到 wiki workspace | `source_path`, `job_id`, `workspace_root`, `preview_rows`, `display_name` |
| `parse` / `parse-xlsx` | `import` 的兼容别名；新说明统一使用 `import` | `source_path`, `job_id`, `workspace_root`, `preview_rows`, `display_name` |
| `check` | 校验 workspace | `workspace_path`, `fail_on_warning` |
| `inspect` | 查看指定 sheet 的摘要与产物路径 | `workspace_path`, `sheet_slug` |
| `build` | 从 workspace 重建 `.xlsx` | `workspace_path`, `output_filename`, `overwrite` |
| `reimport` | 使用记录的原始 source xlsx 重建 workspace | `workspace_path` |

## 返回结果总约定

- 所有工具函数都返回可 JSON 序列化的 Python `dict`
- 所有工具函数都使用统一顶层 schema：`{"ok": bool, ...payload}`
- 当 `ok=False` 时，通常至少包含：`job_id` 或 `workspace_path`、`error_code`、`message`、`warnings`
- `import` 返回 workspace 路径、sheet 列表、warnings、产物路径
- `check` 返回校验摘要、错误、警告、报告路径
- `inspect` 返回 sheet 摘要和关键产物路径
- `build` 返回重建后的 `.xlsx` 输出路径
- `reimport` 返回新的 workspace 状态；成功时其 payload 结构与 `import` 基本一致

## `xlsx_to_wiki()` 返回 schema

成功时的典型返回：

```python
{
    "ok": True,
    "job_id": str,
    "workspace_path": str,
    "workbook_path": str,
    "sheet_slugs": list[str],
    "import_mode": "full" | "debug",
    "warnings": list[str],
    "artifacts": list[str],
    "annotated_workbook_path": str,
    "annotated_workbook_filename": str,
}
```

失败时的典型返回：

```python
{
    "ok": False,
    "job_id": str,
    "error_code": str,
    "message": str,
    "warnings": list[str],
}
```

## 状态文件与一致性 guard

每次 `import` 后，runtime 会在 `state/workspace_state.json` 中记录最小状态：

- 原始 `source_xlsx` 路径
- 原始 `source_xlsx` 的 SHA-256 指纹
- 当前 `truth_source`
- 当前 `status`
- 最近一次 `build` 产物信息

运行时 guard 规则：

1. `check` 前会重新计算原始 `source_xlsx` 指纹
2. `build` 前会重新计算原始 `source_xlsx` 指纹
3. 如果指纹变化，workspace 进入 `xlsx_modified_unreconciled`，并拒绝继续正式 `check/build`
4. `inspect` 仍可查看旧 workspace，但会返回 stale warning
5. 唯一修复路径是 `reimport_source_xlsx()`

## 常见错误码

- `SOURCE_NOT_FOUND`
- `UNSUPPORTED_EXTENSION`
- `INVALID_ZIP_ARCHIVE`
- `MISSING_WORKBOOK_XML`
- `MISSING_WORKBOOK_RELS`
- `MISSING_CONTENT_TYPES`
- `INVALID_XML`
- `BROKEN_RELATIONSHIP`
- `WORKSPACE_ALREADY_EXISTS`
- `IMPORT_INTERNAL_ERROR`
- `CHECK_FAILED`
- `MISSING_SHEET`