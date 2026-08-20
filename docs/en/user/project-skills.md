---
title: Project Skills
order: 6
---

# Project Skills

Project Skills are reusable knowledge units (instructions, examples, templates, and resource files) that AI can automatically identify and load. By creating a `.skills/` directory in your project, you can give the AI project-specific guidance so that it follows your team's conventions and best practices when handling particular tasks.

## Why Project Skills?

| Scenario | Description |
|------|------|
| Team conventions | Make the AI follow your code style, naming rules, architecture patterns |
| Domain knowledge | Provide terminology and background for a specific business domain |
| Workflow templates | Standardize flows for repetitive tasks |
| Resource files | Give the AI reference docs, executable scripts, and other supporting resources |

## Quick Start

### 1. Create the directory structure

Create a `.skills/` folder in your project root; each Skill is a subfolder:

```
your-project/
├── .skills/                        ← Project Skills root
│   ├── code-review/
│   │   └── SKILL.md               ← Skill definition
│   ├── api-design/
│   │   ├── SKILL.md
│   │   ├── references/            ← Reference docs
│   │   │   └── api-spec.md
│   │   └── scripts/               ← Executable scripts
│   │       └── generate-api.py
│   └── testing/
│       └── SKILL.md
├── src/
├── package.json
└── ...
```

### 2. Write SKILL.md

The core of each Skill is a `SKILL.md` file using YAML frontmatter + Markdown:

```markdown
---
name: "Code Review"
version: "1.0.0"
description: "Team-standard code review workflow"
author: "Your Team"
category: code-review
tags: [review, quality, team-standards]
triggers:
  keywords: [review, code review, PR review]
  fileExtensions: [".ts", ".tsx", ".js"]
---

# Instruction

When performing code reviews, follow this workflow:

## 1. Code style checks

- Run basic checks with the project ESLint config
- Variables use camelCase; components use PascalCase
- File names use kebab-case

## 2. Architectural consistency

- New components go into the matching directory under `src/components/`
- Business logic must be extracted into custom hooks
- API calls go through the service layer in `src/services/`

## 3. Security review

- Check for XSS risks (dangerouslySetInnerHTML)
- Confirm user input is validated and escaped
- API keys must never appear in frontend code

# Examples

## Review feedback format

Use these markers:
- 🔴 **Critical**: must fix before merge
- 🟡 **Suggestion**: recommended improvement
- 🟢 **Nitpick**: minor issue (optional)
```

### 3. Automatic activation

When you open the project, CreatorWeave automatically scans all `SKILL.md` files under `.skills/` and loads them. The AI automatically matches and uses these Skills in relevant tasks.

## SKILL.md Format Reference

### Frontmatter fields

| Field | Required | Description |
|------|------|------|
| `name` | ✅ | Skill name (English recommended for AI matching) |
| `version` | ❌ | Version, defaults to `1.0.0` |
| `description` | ❌ | Short description the AI uses to judge applicability |
| `author` | ❌ | Author name |
| `category` | ❌ | Category, see list below |
| `tags` | ❌ | Tag array to assist matching |
| `triggers.keywords` | ❌ | Trigger keyword array (case-insensitive) |
| `triggers.fileExtensions` | ❌ | Related file extension array |

### Categories

| Value | Description |
|----|------|
| `code-review` | code review |
| `testing` | testing |
| `debugging` | debugging |
| `refactoring` | refactoring |
| `documentation` | documentation |
| `security` | security audit |
| `performance` | performance |
| `architecture` | architecture |
| `general` | general (default) |

### Markdown body

The body supports three optional H1 sections:

- **`# Instruction`** (required) — the core instructions the AI follows after loading the Skill
- **`# Examples`** (optional) — examples that help the AI understand expected input/output formats
- **`# Templates`** (optional) — templates the AI can use or reference directly

If the body has no H1 headings, the entire content is treated as Instruction.

## Resource Files

Each Skill directory may contain three resource subdirectories:

### Directory layout

```
your-skill/
├── SKILL.md                ← Skill definition (required)
├── references/             ← Reference docs
│   ├── style-guide.md
│   └── api-conventions.md
├── scripts/                ← Executable scripts (Python etc.)
│   └── analyze.py
└── assets/                 ← Other resources
    └── config-template.json
```

### Resource types

| Directory | Type | Purpose |
|------|------|------|
| `references/` | Reference docs | Markdown, text documents etc. the AI reads as background |
| `scripts/` | Scripts | Python scripts etc. runnable in the AI execution environment (Pyodide) |
| `assets/` | Assets | JSON configs, images, and other auxiliary files |

### Resource limits

| Limit | Value |
|------|-----|
| Max single file | 5 MB |
| Max resources per Skill | 50 |
| Max total resource size per Skill | 20 MB |

## Skill Matching

The AI automatically matches Skills based on:

1. **Keyword matching**: when your message contains a `triggers.keywords` entry
2. **File extension**: when the currently open file matches `triggers.fileExtensions`
3. **Tag matching**: when the conversation topic relates to `tags`

Matched Skills are recommended to the AI, which then loads full content via the `read_skill` tool as needed.

## Complete Examples

### Example 1: API design guide

```
.skills/
└── api-design/
    ├── SKILL.md
    └── references/
        └── openapi-spec.md
```

**SKILL.md**:

```markdown
---
name: "API Design Guide"
version: "1.0.0"
description: "RESTful API design guide: naming, versioning, and error handling standards"
category: architecture
tags: [api, rest, design, backend]
triggers:
  keywords: [api, endpoint, restful, api design]
  fileExtensions: [".ts", ".py", ".go"]
---

# Instruction

Follow these standards when designing APIs:

## URL naming

- Use plural nouns: `/api/users`, `/api/orders`
- Nest resources at most two levels: `/api/users/:id/orders`
- Use kebab-case: `/api/user-profiles`

## HTTP methods

| Method | Purpose | Example |
|------|------|------|
| GET | fetch resource | `GET /api/users` |
| POST | create resource | `POST /api/users` |
| PUT | full update | `PUT /api/users/123` |
| PATCH | partial update | `PATCH /api/users/123` |
| DELETE | delete resource | `DELETE /api/users/123` |

## Error response format

All error responses use a unified format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": []
  }
}
```
```

### Example 2: Data analysis scripts

```
.skills/
└── data-analysis/
    ├── SKILL.md
    └── scripts/
        ├── analyze-csv.py
        └── generate-report.py
```

**SKILL.md**:

```markdown
---
name: "Data Analysis"
version: "1.0.0"
description: "Data analysis and visualization workflow using pandas and matplotlib"
category: general
tags: [data, analysis, visualization, pandas]
triggers:
  keywords: [data analysis, visualization, CSV, report]
---

# Instruction

Follow this workflow for data analysis:

1. First use the `analyze_data` tool to profile the data file
2. Clean and transform data with Python scripts
3. Generate visualization charts and save them to `/mnt_assets/`
4. Output an analysis summary

# Examples

When the user says "help me analyze this sales data":
1. Read the CSV file
2. Inspect structure and missing values
3. Generate trend and distribution charts
4. Output key findings
```

## Viewing in the Skills Manager

You can view and manage all Skills in CreatorWeave:

1. Click the Skills icon in the sidebar, or use the shortcut to open the Skills Manager
2. Skills are grouped by source:
   - **Project Skills** — from the `.skills/` directory (read-only; edit on the filesystem)
   - **My Skills** — personal Skills created in the UI
   - **Built-in Skills** — Skills bundled with the system

3. Any Skill can be enabled/disabled

## Best Practices

### ✅ Recommended

- **Clear descriptions**: `description` should be concise and precise to help the AI judge applicability
- **Specific keywords**: set trigger keywords directly related to the Skill content
- **Actionable instructions**: Instruction should contain concrete steps and rules, not vague advice
- **Provide examples**: Examples greatly improve how accurately the AI follows conventions
- **Keep updated**: update Skill content as the project evolves

### ❌ Avoid

- **Overly long content**: keep Instruction at a reasonable length; too long wastes tokens
- **Overly generic keywords**: avoid trigger words like "code" or "file"
- **Duplicate definitions**: avoid overlapping content between Skills
- **Binary files**: avoid large binaries in resource directories

## FAQ

### Q: What's the difference between Project Skills and user-created Skills?

| Feature | Project Skills | User Skills |
|------|-----------|------------|
| Storage | project `.skills/` directory | app database (SQLite) |
| Version control | ✅ follows project Git | ❌ local only |
| Team sharing | ✅ shared with the team | ❌ private |
| Editing | filesystem | UI editor |
| Resource files | ✅ supported | ✅ supported |

### Q: Why isn't my Skill loaded?

Check that:

1. The file is named `SKILL.md` (uppercase)
2. It is inside a subfolder of the `.skills/` directory
3. The frontmatter is well-formed (starts and ends with `---`)
4. `name` is non-empty
5. The Skill is enabled (check the Skills Manager)

### Q: How many Skills can I have?

There is no hard limit, but keeping a reasonable count (10-20) is recommended — too many increase the AI's matching burden.

### Q: Which resource file formats are supported?

Common text formats are supported (`.md`, `.py`, `.js`, `.ts`, `.json`, `.yaml`, `.txt`, `.sh`, etc.). Binary files are synced to the workspace but not processed as text content.

## Related Docs

- [Getting Started](getting-started.md) - basic usage guide
- [Workspace](workspace.md) - project and workspace management
- [Conversations](conversation.md) - AI conversation capabilities
