# Editing Rules

## 理解一个 sheet 的推荐读取顺序

1. 先读 `summary.yaml`
2. 再读 `regions.yaml`
3. 优先定位 `primary_region_id`
4. 先读主区域对应 region 在 `regions.yaml` 中的 `meta`
5. 需要精确数据时，再按该 region 的 `data_locator` 到 `data_bundle.txt` 里定位对应 section
6. 需要结构、样式或非表格信息时，再读 `structure.yaml`、`styles.yaml`、`static_cells/`

## 修改一个值的原则

1. 如果目标单元格是公式单元格，改 `formulas.yaml`
2. 如果目标值属于某个 region 的表格数据，按 `data_locator.section` 修改 `data_bundle.txt` 中对应 section
3. 如果目标值不属于任何表格 region，改 `structure.yaml` 或 `static_cells`
4. 如果修改的是样式、验证、冻结、筛选、命名区域、合并等，改对应元数据文件

## 操作规则

- 一次逻辑修改尽量只改一个主要来源文件
- 优先用 `summary.yaml`、`regions.yaml` 做导航，再打开大文件
- 不要把公式文本写入 `data_bundle.txt` 或 `static_cells`
- 不要通过编辑 `tables.yaml` 来修改表格行值
- 不要通过编辑 `styles.yaml` 来修改业务数据
- 不确定目标属于哪个区域时，先看 `regions.yaml` 和 `primary_region_id`
- 在执行写入、删除、重命名、移动等操作前，先确认目标是否位于 `workspace_path` 内
- 如果目标不在 `workspace_path` 内，优先判断是否可以改为操作 workspace 内的等价对象
- 不要将原始 `xlsx` 作为修改后的保存目标
- 不要把 `outputs/*.xlsx` 的修改结果视为 wiki 真值来源；当前实现不支持把派生 xlsx 覆盖导回现有 workspace

## 没有明显表格区域的 sheet

- 即使 `tables.yaml` 为空，sheet 也可能有有意义内容
- 这类 sheet 可能没有可编辑的主表 region
- 非公式值通常仍然保存在 `structure.yaml` 的 `static_cells` 或 `static_cells/`
- 公式仍然归 `formulas.yaml`

## Build 输出规则

- `build` 始终把重建的 `.xlsx` 写入当前 job 的 `outputs/`
- 如果 `output_filename` 不以 `.xlsx` 结尾，会自动规范化
- 如果目标文件存在且 `overwrite=False`，会生成版本化文件名，如 `rebuilt_2.xlsx`

## 执行前自检

在进行任何会改变文件内容或文件结构的操作前，先确认：

- 当前目标是否属于 `workspace_path` 目录？
- 当前操作是否会直接影响原始 `.xlsx`？
- 当前修改是否可以通过更新 workspace 产物并随后执行 `build` 来完成？
- 当前是否误把 `outputs/*.xlsx` 当作可重新 `import` 或可回写 wiki 的编辑入口？
- 如果在 `build` 步骤前，`check` 是否已通过？
- 当前操作是否跳过了必需的步骤？

如果答案表明该操作会直接修改原始 `xlsx` 或跳过了必需的前置步骤，则不要执行。