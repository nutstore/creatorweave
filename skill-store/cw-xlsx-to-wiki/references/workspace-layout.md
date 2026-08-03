# Workspace Layout

## 关键产物目录

导入后，产物写入：

`<workspace_root>/<job-id>/`

典型结构：

```text
xlsx2wiki_workspace/<job-id>/
├── raw/original.xlsx
├── extracted/ooxml/
├── wiki/
│   ├── workbook.yaml
│   ├── names.yaml
│   ├── index.md
│   ├── log.md
│   ├── style_sheet.xml
│   ├── theme1.xml
│   ├── checks/latest_check.json
│   └── sheets/<sheet-slug>/
│       ├── overview.md
│       ├── structure.yaml
│       ├── summary.yaml
│       ├── data-preview.md
│       ├── formulas.yaml
│       ├── data-validations.yaml
│       ├── tables.yaml
│       ├── styles.yaml
│       ├── regions.yaml
│       ├── static_cells/
│       ├── formulas/
│       ├── styles/
│       └── data_bundle.txt
├── outputs/
├── logs/
└── state/session.json
```

## Region-first 约定

- `data_bundle.txt` 是 region 数据的聚合文本载荷
- `regions.yaml` 是 sheet 级 region 索引，包含 `primary_region_id`、region 列表以及每个 region 的 `meta`
- `summary.yaml.primary_region_id` 指向主区域
- `structure.yaml.primary_region_id` 也会同步记录主区域
- `build`、`check`、`inspect`、preview 生成优先依赖主区域

## 关键文件职责

| 文件 | 作用 |
|---|---|
| `summary.yaml` | sheet 级轻量摘要，优先读取 |
| `regions.yaml` | sheet 级 region 索引，包含 `primary_region_id`、region 列表及其 `meta` |
| `data_bundle.txt` | 按 section 聚合多个 region 的 TSV 文本数据 |
| `overview.md` | sheet 概览，仅用于浏览 |
| `structure.yaml` | sheet 结构、尺寸、合并、冻结、筛选、关系、`static_cells`、主区域 id |
| `static_cells/` | 非表格区域的静态单元格分块 |
| `formulas.yaml` | 公式索引与元数据 |
| `formulas/` | 公式分块载荷 |
| `data-validations.yaml` | 数据验证规则 |
| `tables.yaml` | Excel table 元数据，不是行数据 |
| `styles.yaml` | 样式索引与模式信息 |
| `styles/` | 样式分块载荷 |
| `workbook.yaml` | 工作簿级注册表 |
| `names.yaml` | 命名区域 |
| `data-preview.md` | 只用于预览，不作为编辑依据 |