---
name: cw-xlsx-to-wiki
description: 当用户提供或提及 `.xlsx` 工作簿，并需要将其导入可编辑的 wiki workspace、按 sheet 或 region 检查结构与数据、基于 workspace 进行分析或修改后校验一致性，或从已校验的 workspace 重建新的 `.xlsx` 文件时使用。通过 import、inspect、check、reimport 和 build 工作流处理；不用于非 `.xlsx` 文件、直接编辑 OOXML，或把派生输出作为新的编辑源。
version: "1.0.1"
---

# XLSX To Wiki

这个 skill 按 `SKILL.md + scripts/ + references/` 结构组织，适合接入 EO2Weave 的按需加载模型。

不要从当前工作目录、项目目录结构或文档路径推导 skill 根路径。脚本路径与资源路径应以运行时提供的信息、`read_skill` 返回内容或 skill loader 注入结果为准。

## 适用范围

适用场景：

- 将一个 `.xlsx` 文件导入为 wiki workspace 结构
- 校验导入后 workspace 是否完整、可重建
- 基于导入后 workspace 继续做分析探索、问题发现和洞察整理
- 基于导入后 workspace 生成新的 `.xlsx` 输出文件
- 以 sheet / region 视角检查工作簿内容

不适用场景：

- 输入不是 `.xlsx` 工作簿
- 用户只想讨论概念，不需要实际导入、检查、重建
- 用户要求直接编辑 `.xlsx` 内的 OOXML

## 核心规则

- 使用这个 skill 时，优先通过 `read_skill` 读取入口说明，再按需读取 `references/` 或 `scripts/` 资源
- 始终通过 `scripts/run_workbook_tool.py` 或其导出函数处理正式导入、检查、查看和构建任务
- 不要跳过 `check` 直接 `build`
- 不要在 `check` 失败后执行 `build`
- 每次工具调用都先检查返回值中的 `ok`；失败后停止当前流程并处理 `error_code`
- 原始 `xlsx` 文件默认只作为 `import` 输入，不直接作为编辑对象
- 执行 `import` 后，后续修改默认聚焦于 `workspace_path` 及其中产物
- 如果检测到原始 `xlsx` 在 `import` 后发生变化，必须先执行 `reimport`
- `outputs/` 下的重建产物是派生文件，不能作为新的真值来源
- 如果用户目标是分析、提问或写报告，优先基于已同步的 wiki workspace 继续探索，而不是反复回到原始 `xlsx`
- 转成 wiki 产物时，写文件逻辑必须保持流式写入
- wiki workspace 中生成的文件和目录必须使用小写英文命名；源工作簿和 sheet 的原始语言仅保留在展示标题与元数据中
- 新增 `import` 或依赖前，先评估会引入多少额外文件，避免 Pyodide 中的文件数和内存暴涨

## 标准流程

1. 识别输入 `.xlsx`
2. 执行 `import`
3. 按需执行 `inspect`
4. 按需修改 workspace 产物
5. 执行 `check`
6. 如果源文件已变化，停止后续流程并执行 `reimport`
7. `reimport` 成功后，重新执行必要的 `inspect`、修改和 `check`
8. 仅在 `check` 成功后执行 `build`

如果用户目标是“分析这个 workbook / 给我一份洞察报告”，默认在 `import` 或 `check` 之后切到分析与报告模式，而不是额外切换到第二个独立 skill。

## 分析与报告模式

当用户目标是下面这些任务时，继续在当前 skill 内完成：

- 发现值得负责人关注的问题
- 基于 wiki workspace 做证据探索
- 组织管理导向的洞察报告
- 输出 HTML 或文本形式的分析结果

这部分工作的核心不是重新解析 `.xlsx`，而是复用前面已经导入好的 wiki workspace，并围绕证据做：

1. 扩大证据覆盖
2. 识别客观信号
3. 选择高价值问题
4. 区分事实、假设和待验证事项
5. 组织最终报告

默认不要求额外依赖分析脚本；优先基于 workspace 内容和按需加载的 references 完成分析。

## 先读哪些参考

- 工作流与前置条件：`references/workflow.md`
- workspace 目录与产物职责：`references/workspace-layout.md`
- 修改规则与定位方法：`references/editing-rules.md`
- 返回 schema、错误码与 guard：`references/contracts.md`
- Pyodide 约束与运行方式：`references/runtime-constraints.md`
- 内置 skill 接入注意事项：`references/platform-builtin.md`

如果用户目标是分析 / 洞察 / 报告，再继续读取：

- 问题选择标准：`references/question-framework.md`
- 洞察推理边界：`references/insight-reasoning.md`
- 报告受众导向：`references/report-audience.md`
- 报告结构模板：`references/report-template.md`
- 常见信号类型：`references/signal-types.md`

## 环境准备

Pyodide 默认可能不带 `pyyaml`。优先复用运行时已安装的依赖；确认缺失并且确实需要时再安装一次。脚本目录不要自行猜测，优先使用运行时提供的 Python execution path；在 EO2Weave 内置 skill 场景下，通常会挂载到 `/mnt_skills/builtin/<skill-name>/scripts/`。

对 builtin skill，推荐直接使用：

- script import path: `/mnt_skills/builtin/cw-xlsx-to-wiki/scripts`
- source xlsx path: 优先使用 `/mnt/...` 或 `/mnt_assets/...` 下实际存在的文件
- 不要把浏览器静态资源 URL（如 `/assets/foo.xlsx`）当作 Pyodide 文件路径传给 `source_path`

```python
import sys
from pathlib import Path

skill_scripts = Path("<runtime-provided-scripts-path>").resolve()
if not skill_scripts.exists():
    raise FileNotFoundError(f"Skill scripts directory does not exist: {skill_scripts}")
if str(skill_scripts) not in sys.path:
    sys.path.insert(0, str(skill_scripts))

from run_workbook_tool import check_wiki, inspect_sheet, reimport_source_xlsx, wiki_to_xlsx, xlsx_to_wiki
```

## 最短示例

```python
import_payload = xlsx_to_wiki(
    source_path="/mnt/path/to/input.xlsx",
    job_id="job_001",
    workspace_root="/mnt_assets/xlsx2wiki_workspace",
    preview_rows=10,
    display_name="Workbook Import",
    import_mode="full",
)
if not import_payload["ok"]:
    raise RuntimeError(import_payload["error_code"])

check_payload = check_wiki(
    workspace_path=import_payload["workspace_path"],
    fail_on_warning=False,
)
if not check_payload["ok"]:
    raise RuntimeError(check_payload["error_code"])

build_payload = wiki_to_xlsx(
    workspace_path=import_payload["workspace_path"],
    output_filename="rebuilt.xlsx",
    overwrite=True,
)
if not build_payload["ok"]:
    raise RuntimeError(build_payload["error_code"])
```

如果 `check` 或 `build` 返回 `SOURCE_XLSX_MODIFIED`，必须改走：

```python
reimport_payload = reimport_source_xlsx(
    workspace_path=import_payload["workspace_path"],
)
if not reimport_payload["ok"]:
    raise RuntimeError(reimport_payload["error_code"])
```

`reimport` 成功后，必须重新执行 `check`；只有新的 `check_payload["ok"]` 为 `True` 时才允许 `build`。

Use `import_mode="full"` unless you explicitly need debug-only artifacts.