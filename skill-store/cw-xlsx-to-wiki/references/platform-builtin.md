# EO2Weave Builtin Integration

## 目标

本文件描述把这个 skill 接入 EO2Weave 内置 skill 系统时，哪些假设是安全的，哪些假设不应写死在 `SKILL.md` 里。

## 可以依赖的事实

- EO2Weave 内置 skill 采用 `SKILL.md + scripts/ + references/` 结构
- 内置 skill 会被 materialize 到全局 skills 目录，再挂载到 Python 运行时
- Python 执行路径通常会落在 `/mnt_skills/builtin/<skill-name>/...`
- `read_skill` 会返回 skill 正文和资源索引；需要更多内容时应继续使用 `read_skill_resource`

## 不应写死的假设

- 不要假设当前 skill 一定来自项目 `.skills/` 目录
- 不要假设可以从当前工作目录反推出 skill 根路径
- 不要把 `/mnt/<root_name>/...` 当作通用脚本路径
- 不要要求调用方自己拼接 skill 路径后再导入脚本，除非运行时明确提供了该路径

## 对这个 skill 的接入建议

- `name` 使用 EO2Weave 友好的 `cw-` 前缀
- `SKILL.md` 只保留入口流程、核心规则和 reference 导航
- 详细契约、路径布局和 Pyodide 约束放在 `references/`
- `scripts/run_workbook_tool.py` 作为首选稳定入口，不要求模型直接在 runtime 包内部自由探索

## 打包前检查

- 确认 `SKILL.md` frontmatter 兼容 EO2Weave validator
- 确认没有 `__pycache__` 一类缓存文件
- 确认没有把项目专用路径说明写进通用入口文档
- 确认 `references/` 中的说明与 `scripts/` 实际导出函数一致
- 如果要复制到 EO2Weave 内置目录，避免把仅用于本仓库本地开发的附属内容一起带入最终 builtin package