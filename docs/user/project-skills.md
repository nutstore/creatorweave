---
title: 项目 Skills
order: 6
---

# 项目 Skills

项目 Skills 是一种可复用的知识单元（包含指令、示例、模板和资源文件），可以被 AI 自动识别和加载。通过在项目中创建 `.skills/` 目录，你可以为 AI 提供项目专属的指导，让它在处理特定任务时遵循你团队的规范和最佳实践。

## 为什么需要项目 Skills？

| 场景 | 说明 |
|------|------|
| 团队规范 | 让 AI 遵循你的代码风格、命名约定、架构模式 |
| 领域知识 | 为特定业务领域提供专业术语和背景知识 |
| 工作流模板 | 预设重复性任务的标准化流程 |
| 资源文件 | 为 AI 提供参考文档、执行脚本等辅助资源 |

## 快速开始

### 1. 创建目录结构

在你的项目根目录下创建 `.skills/` 文件夹，每个 Skill 是一个子文件夹：

```
your-project/
├── .skills/                        ← 项目 Skills 根目录
│   ├── code-review/
│   │   └── SKILL.md               ← Skill 定义文件
│   ├── api-design/
│   │   ├── SKILL.md
│   │   ├── references/            ← 参考文档
│   │   │   └── api-spec.md
│   │   └── scripts/               ← 可执行脚本
│   │       └── generate-api.py
│   └── testing/
│       └── SKILL.md
├── src/
├── package.json
└── ...
```

### 2. 编写 SKILL.md

每个 Skill 的核心是一个 `SKILL.md` 文件，使用 YAML Frontmatter + Markdown 格式：

```markdown
---
name: "Code Review"
version: "1.0.0"
description: "基于团队规范的代码审查流程"
author: "Your Team"
category: code-review
tags: [review, quality, team-standards]
triggers:
  keywords: [review, 审查, code review, PR review]
  fileExtensions: [".ts", ".tsx", ".js"]
---

# Instruction

当进行代码审查时，请遵循以下流程：

## 1. 代码规范检查

- 使用项目 ESLint 配置进行基础检查
- 变量命名使用 camelCase，组件使用 PascalCase
- 文件命名使用 kebab-case

## 2. 架构一致性

- 新组件必须放在 `src/components/` 对应的目录下
- 业务逻辑必须通过自定义 Hook 抽取
- API 调用统一使用 `src/services/` 中的服务层

## 3. 安全审查

- 检查是否有 XSS 风险（dangerouslySetInnerHTML）
- 确认用户输入都经过了校验和转义
- API 密钥不能出现在前端代码中

# Examples

## 审查反馈格式

使用以下标记：
- 🔴 **Critical**: 必须修复才能合并
- 🟡 **Suggestion**: 建议改进
- 🟢 **Nitpick**: 小问题（可选）
```

### 3. 自动生效

当你打开项目时，CreatorWeave 会自动扫描 `.skills/` 目录下的所有 `SKILL.md` 文件并加载。AI 会在相关任务中自动匹配和使用这些 Skills。

## SKILL.md 格式详解

### Frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | Skill 名称（建议使用英文，便于 AI 匹配） |
| `version` | ❌ | 版本号，默认 `1.0.0` |
| `description` | ❌ | 简短描述，AI 会据此判断是否适用 |
| `author` | ❌ | 作者名称 |
| `category` | ❌ | 分类，见下方分类列表 |
| `tags` | ❌ | 标签数组，用于辅助匹配 |
| `triggers.keywords` | ❌ | 触发关键词数组（不区分大小写） |
| `triggers.fileExtensions` | ❌ | 关联的文件扩展名数组 |

### 分类（category）

| 值 | 说明 |
|----|------|
| `code-review` | 代码审查 |
| `testing` | 测试相关 |
| `debugging` | 调试排错 |
| `refactoring` | 代码重构 |
| `documentation` | 文档编写 |
| `security` | 安全审计 |
| `performance` | 性能优化 |
| `architecture` | 架构设计 |
| `general` | 通用（默认） |

### Markdown 正文

正文支持三个可选的 H1 章节：

- **`# Instruction`**（必填）— 核心指令，AI 加载 Skill 后会遵循的内容
- **`# Examples`**（可选）— 示例，帮助 AI 理解预期的输入输出格式
- **`# Templates`**（可选）— 模板，AI 可以直接使用或参考的输出模板

如果正文没有 H1 标题，整个内容会被视为 Instruction。

## 资源文件

每个 Skill 目录下可以包含三类资源子目录：

### 目录结构

```
your-skill/
├── SKILL.md                ← Skill 定义（必须）
├── references/             ← 参考文档
│   ├── style-guide.md
│   └── api-conventions.md
├── scripts/                ← 可执行脚本（Python 等）
│   └── analyze.py
└── assets/                 ← 其他资源文件
    └── config-template.json
```

### 资源类型

| 目录 | 类型 | 用途 |
|------|------|------|
| `references/` | 参考文档 | Markdown、文本文档等，AI 可读取作为背景知识 |
| `scripts/` | 脚本 | Python 脚本等，可在 AI 执行环境（Pyodide）中运行 |
| `assets/` | 资源 | JSON 配置、图片等其他辅助文件 |

### 资源限制

| 限制 | 值 |
|------|-----|
| 单个文件最大 | 5 MB |
| 每个 Skill 最多资源数 | 50 个 |
| 每个 Skill 资源总大小 | 20 MB |

## Skill 匹配机制

AI 会根据以下因素自动匹配 Skill：

1. **关键词匹配**：当你的消息中包含 `triggers.keywords` 中的词时
2. **文件扩展名**：当当前打开的文件匹配 `triggers.fileExtensions` 时
3. **标签匹配**：当对话话题与 `tags` 相关时

匹配到的 Skill 会被推荐给 AI，AI 再根据需要通过 `read_skill` 工具加载完整内容。

## 完整示例

### 示例 1：API 设计规范

```
.skills/
└── api-design/
    ├── SKILL.md
    └── references/
        └── openapi-spec.md
```

**SKILL.md**：

```markdown
---
name: "API Design Guide"
version: "1.0.0"
description: "RESTful API 设计规范，包含命名、版本控制和错误处理标准"
category: architecture
tags: [api, rest, design, backend]
triggers:
  keywords: [api, 接口, endpoint, restful, API设计]
  fileExtensions: [".ts", ".py", ".go"]
---

# Instruction

设计 API 时请遵循以下规范：

## URL 命名

- 使用名词复数形式：`/api/users`、`/api/orders`
- 嵌套资源最多两层：`/api/users/:id/orders`
- 使用 kebab-case：`/api/user-profiles`

## HTTP 方法

| 方法 | 用途 | 示例 |
|------|------|------|
| GET | 获取资源 | `GET /api/users` |
| POST | 创建资源 | `POST /api/users` |
| PUT | 全量更新 | `PUT /api/users/123` |
| PATCH | 部分更新 | `PATCH /api/users/123` |
| DELETE | 删除资源 | `DELETE /api/users/123` |

## 错误响应格式

所有错误响应使用统一格式：

\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "用户可读的错误描述",
    "details": []
  }
}
\`\`\`
```

### 示例 2：数据分析脚本

```
.skills/
└── data-analysis/
    ├── SKILL.md
    └── scripts/
        ├── analyze-csv.py
        └── generate-report.py
```

**SKILL.md**：

```markdown
---
name: "Data Analysis"
version: "1.0.0"
description: "数据分析和可视化工作流，使用 pandas 和 matplotlib"
category: general
tags: [data, analysis, visualization, pandas]
triggers:
  keywords: [数据分析, data analysis, 可视化, CSV, 报表]
---

# Instruction

进行数据分析时，请遵循以下流程：

1. 先使用 `analyze_data` 工具分析数据文件的基本统计信息
2. 使用 Python 脚本进行数据清洗和转换
3. 生成可视化图表，保存到 `/mnt_assets/` 目录
4. 输出分析摘要

# Examples

当用户说"帮我分析这份销售数据"时：
1. 读取 CSV 文件
2. 查看数据结构和缺失值
3. 生成趋势图和分布图
4. 输出关键发现
```

## 在 Skills 管理器中查看

你可以在 CreatorWeave 中查看和管理所有 Skills：

1. 点击侧边栏的 Skills 图标，或使用快捷键打开 Skills 管理器
2. Skills 按来源分组显示：
   - **项目 Skills** — 来自 `.skills/` 目录（只读，需在文件系统中修改）
   - **我的 Skills** — 在 UI 中创建的个人 Skills
   - **内置 Skills** — 系统预装的 Skills

3. 可以启用/禁用任意 Skill

## 最佳实践

### ✅ 推荐

- **描述清晰**：`description` 要简洁明确，帮助 AI 准确判断适用场景
- **关键词具体**：设置与 Skill 内容直接相关的触发关键词
- **指令可操作**：Instruction 应该包含明确的步骤和规则，而不是模糊的建议
- **提供示例**：Examples 能大幅提高 AI 遵循规范的准确度
- **保持更新**：随着项目演进，及时更新 Skill 内容

### ❌ 避免

- **内容过长**：Instruction 控制在合理长度，太长会消耗过多 Token
- **关键词过泛**：避免使用 "代码"、"文件" 等过于通用的触发词
- **重复定义**：不同 Skill 之间避免内容重叠
- **二进制文件**：资源目录中避免放置大型二进制文件

## 常见问题

### Q：项目 Skills 和用户创建的 Skills 有什么区别？

| 特性 | 项目 Skills | 用户 Skills |
|------|-----------|------------|
| 存储位置 | 项目目录 `.skills/` | 应用数据库（SQLite） |
| 版本管理 | ✅ 跟随项目 Git | ❌ 仅本地 |
| 团队共享 | ✅ 团队成员共享 | ❌ 仅自己可见 |
| 编辑方式 | 文件系统编辑 | UI 编辑器编辑 |
| 资源文件 | ✅ 支持 | ✅ 支持 |

### Q：为什么我的 Skill 没有被加载？

请检查：

1. 文件名必须是 `SKILL.md`（大写）
2. 文件位置必须在 `.skills/` 目录的子文件夹中
3. Frontmatter 格式正确（以 `---` 开头和结尾）
4. `name` 字段不为空
5. Skill 处于启用状态（在 Skills 管理器中查看）

### Q：可以有多少个 Skills？

没有硬性数量限制。但建议保持在合理范围内（10-20 个），太多会增加 AI 的匹配负担。

### Q：资源文件支持哪些格式？

资源文件支持常见的文本格式（`.md`、`.py`、`.js`、`.ts`、`.json`、`.yaml`、`.txt`、`.sh` 等）。二进制文件会被同步到工作空间但不作为文本内容处理。

## 相关文档

- [快速入门](getting-started.md) - 基本使用指南
- [工作空间](workspace.md) - 项目和工作空间管理
- [对话功能](conversation.md) - AI 对话能力
