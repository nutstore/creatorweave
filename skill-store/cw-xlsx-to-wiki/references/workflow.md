# Workflow

## 路径术语

- `workspace_root`: 导入任务的容器目录，例如 `/path/to/xlsx2wiki_workspace`
- `workspace_path`: 某次 `import` 任务的实际目录，等于 `<workspace_root>/<job_id>`

## 标准工作流

| 步骤 | 操作 | 输出 |
|------|------|------|
| 1. 输入识别 | 确认输入是 `.xlsx` 文件 | 输入路径 |
| 2. Import | 导入 xlsx -> wiki workspace | workspace 目录 + 产物 |
| 3. 修改（可选） | 修改 workspace 内的产物文件 | 更新后的产物 |
| 4. Check | 校验 workspace 完整性与源文件一致性 | 校验报告 |
| 5. Inspect（可选） | 查看 sheet 摘要 | 摘要信息 |
| 6. Build | 从 workspace 重建 `.xlsx` | 输出 xlsx 文件 |
| 7. Reimport（异常修复） | 当原始 xlsx 已变化时重新导入 | 新的 workspace 状态 |

## 各步骤前置条件

### 1. 输入识别

- 确认用户提到的 `.xlsx` 文件真实存在
- 文件不在工作区时，让用户提供路径或上传
- 确认后缀是 `.xlsx`

### 2. Import

前置条件：

- 步骤 1 已完成

结果检查点：

- `import_payload["ok"]` 为 `True`
- `import_payload["workspace_path"]` 存在
- `import_payload["sheet_slugs"]` 非空，除非整个 xlsx 为空

### 3. 修改（可选）

前置条件：

- 步骤 2 已完成

结果检查点：

- 所有修改都落在 `workspace_path` 内
- 原始 xlsx 未被触碰
- 如果原始 xlsx 已变化，旧 workspace 视为过期，必须先执行 `reimport`
- 不要把 `outputs/*.xlsx` 当作回写 wiki 的编辑入口

### 4. Check

前置条件：

- 步骤 2 已完成
- 若执行过修改，则修改已完成

结果检查点：

- `check_payload["ok"]` 为 `True`
- 错误列表为空
- 警告列表已确认
- 若返回 `SOURCE_XLSX_MODIFIED`，必须先 `reimport`

### 5. Inspect（可选）

前置条件：

- 步骤 2 已完成

结果检查点：

- `inspect_payload["ok"]` 为 `True`
- 返回的摘要信息与用户需求相符

### 6. Build

前置条件：

- `import` 已完成
- `check` 已执行且 `ok=True`
- 若有修改，修改已在 workspace 中生效
- 原始 `.xlsx` 未被修改

结果检查点：

- `build_payload["ok"]` 为 `True`
- `build_payload["output_path"]` 存在并指向新文件
- 若原始 `xlsx` 已变化，`build` 会被 guard 拒绝

### 7. Reimport（异常修复）

前置条件：

- 已存在历史 `workspace_path`
- 检测到原始 `xlsx` 在 `import` 后发生变化，或源文件已失效

结果检查点：

- `reimport_payload["ok"]` 为 `True`
- 原 workspace 被新导入结果替换
- `state/workspace_state.json` 恢复为 `wiki_clean`

## Inspect 与 Check

- `Inspect` 用于查看内容、结构和关键产物路径，帮助理解 sheet 或定位问题
- `Check` 用于校验 workspace 是否完整、可重建，判断是否允许继续 `build`
- `Inspect` 不阻断 `build`
- `Check` 会阻断 `build`
- `Inspect` 不能替代 `Check`