---
title: Project Skills
order: 6
lang: en
---

# Project Skills

Project Skills are reusable knowledge units (containing instructions, examples, templates, and resource files) that can be automatically recognized and loaded by AI. By creating a `.skills/` directory in your project, you can provide AI with project-specific guidance, enabling it to follow your team's conventions and best practices when handling specific tasks.

## Why Project Skills?

| Scenario | Description |
|----------|-------------|
| Team conventions | Enforce code style, naming conventions, and architectural patterns |
| Domain expertise | Provide domain-specific terminology and background knowledge |
| Workflow templates | Standardize repetitive tasks with predefined processes |
| Resource files | Supply reference docs, executable scripts, and other auxiliary resources |

## Quick Start

### 1. Create the directory structure

Create a `.skills/` folder in your project root. Each Skill is a subfolder:

```
your-project/
├── .skills/                        ← Project Skills root directory
│   ├── code-review/
│   │   └── SKILL.md               ← Skill definition file
│   ├── api-design/
│   │   ├── SKILL.md
│   │   ├── references/            ← Reference documents
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

The core of each Skill is a `SKILL.md` file using YAML Frontmatter + Markdown format:

```markdown
---
name: "Code Review"
version: "1.0.0"
description: "Team-standard code review process"
author: "Your Team"
category: code-review
tags: [review, quality, team-standards]
triggers:
  keywords: [review, code review, PR review, inspect]
  fileExtensions: [".ts", ".tsx", ".js"]
---

# Instruction

When performing code reviews, follow this process:

## 1. Code Style Check

- Run the project ESLint config for basic checks
- Use camelCase for variables, PascalCase for components
- Use kebab-case for file names

## 2. Architectural Consistency

- New components must be placed under the appropriate `src/components/` directory
- Business logic must be extracted into custom Hooks
- API calls must use the service layer in `src/services/`

## 3. Security Review

- Check for XSS risks (dangerouslySetInnerHTML)
- Ensure user inputs are validated and sanitized
- API keys must never appear in frontend code

# Examples

## Review Feedback Format

Use the following markers:
- 🔴 **Critical**: Must fix before merge
- 🟡 **Suggestion**: Recommended improvement
- 🟢 **Nitpick**: Minor issue (optional)
```

### 3. Automatic loading

When you open a project, CreatorWeave automatically scans all `SKILL.md` files under the `.skills/` directory and loads them. AI will automatically match and use these Skills in relevant tasks.

## SKILL.md Format Reference

### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Skill name (English recommended for better AI matching) |
| `version` | ❌ | Version number, defaults to `1.0.0` |
| `description` | ❌ | Brief description — AI uses this to determine applicability |
| `author` | ❌ | Author name |
| `category` | ❌ | Category, see the list below |
| `tags` | ❌ | Tag array for auxiliary matching |
| `triggers.keywords` | ❌ | Trigger keyword array (case-insensitive) |
| `triggers.fileExtensions` | ❌ | Associated file extension array |

### Categories

| Value | Description |
|-------|-------------|
| `code-review` | Code review |
| `testing` | Testing |
| `debugging` | Debugging and troubleshooting |
| `refactoring` | Code refactoring |
| `documentation` | Documentation |
| `security` | Security audit |
| `performance` | Performance optimization |
| `architecture` | Architecture design |
| `general` | General (default) |

### Markdown body

The body supports three optional H1 sections:

- **`# Instruction`** (required) — Core instructions that AI follows after loading the Skill
- **`# Examples`** (optional) — Examples that help AI understand expected input/output formats
- **`# Templates`** (optional) — Templates that AI can use directly or reference

If the body has no H1 headings, the entire content is treated as Instruction.

## Resource Files

Each Skill directory can contain three types of resource subdirectories:

### Directory structure

```
your-skill/
├── SKILL.md                ← Skill definition (required)
├── references/             ← Reference documents
│   ├── style-guide.md
│   └── api-conventions.md
├── scripts/                ← Executable scripts (Python, etc.)
│   └── analyze.py
└── assets/                 ← Other resource files
    └── config-template.json
```

### Resource types

| Directory | Type | Purpose |
|-----------|------|---------|
| `references/` | Reference | Markdown, text docs, etc. — AI can read these as background knowledge |
| `scripts/` | Script | Python scripts, etc. — can run in AI's execution environment (Pyodide) |
| `assets/` | Asset | JSON configs, images, and other auxiliary files |

### Resource limits

| Limit | Value |
|-------|-------|
| Max single file size | 5 MB |
| Max resources per Skill | 50 files |
| Max total size per Skill | 20 MB |

## Skill Matching

AI automatically matches Skills based on the following factors:

1. **Keyword matching** — When your message contains words from `triggers.keywords`
2. **File extension matching** — When the currently open file matches `triggers.fileExtensions`
3. **Tag matching** — When the conversation topic relates to `tags`

Matched Skills are recommended to AI, which then loads the full content via the `read_skill` tool as needed.

## Complete Examples

### Example 1: API Design Guide

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
description: "RESTful API design conventions covering naming, versioning, and error handling"
category: architecture
tags: [api, rest, design, backend]
triggers:
  keywords: [api, endpoint, restful, "api design"]
  fileExtensions: [".ts", ".py", ".go"]
---

# Instruction

When designing APIs, follow these conventions:

## URL Naming

- Use plural nouns: `/api/users`, `/api/orders`
- Nest resources at most two levels deep: `/api/users/:id/orders`
- Use kebab-case: `/api/user-profiles`

## HTTP Methods

| Method | Purpose | Example |
|--------|---------|---------|
| GET | Retrieve resources | `GET /api/users` |
| POST | Create resources | `POST /api/users` |
| PUT | Full update | `PUT /api/users/123` |
| PATCH | Partial update | `PATCH /api/users/123` |
| DELETE | Delete resources | `DELETE /api/users/123` |

## Error Response Format

All error responses use a unified format:

\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": []
  }
}
\`\`\`
```

### Example 2: Data Analysis

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
  keywords: [data analysis, visualize, CSV, report, chart]
---

# Instruction

When performing data analysis, follow this workflow:

1. First use the `analyze_data` tool to examine basic statistics of the data file
2. Use Python scripts for data cleaning and transformation
3. Generate visualization charts and save to `/mnt_assets/`
4. Output an analysis summary

# Examples

When a user says "help me analyze this sales data":
1. Read the CSV file
2. Check data structure and missing values
3. Generate trend charts and distribution plots
4. Output key findings
```

## Managing Skills in CreatorWeave

You can view and manage all Skills in CreatorWeave:

1. Click the Skills icon in the sidebar, or use the keyboard shortcut to open the Skills Manager
2. Skills are grouped by source:
   - **Project Skills** — From the `.skills/` directory (read-only; edit in the file system)
   - **My Skills** — Personal Skills created in the UI
   - **Built-in Skills** — Pre-installed system Skills

3. You can enable or disable any Skill

## Best Practices

### ✅ Do

- **Clear descriptions** — Keep `description` concise and specific to help AI accurately determine applicability
- **Specific keywords** — Set trigger keywords directly related to the Skill content
- **Actionable instructions** — Instruction should contain clear steps and rules, not vague suggestions
- **Provide examples** — Examples significantly improve AI's accuracy in following conventions
- **Keep updated** — Update Skill content as the project evolves

### ❌ Don't

- **Overly long content** — Keep Instruction at a reasonable length; too much text wastes tokens
- **Overly broad keywords** — Avoid generic triggers like "code" or "file"
- **Overlapping definitions** — Avoid content duplication across different Skills
- **Large binary files** — Avoid placing large binary files in resource directories

## FAQ

### Q: What's the difference between Project Skills and user-created Skills?

| Feature | Project Skills | User Skills |
|---------|---------------|-------------|
| Storage | Project `.skills/` directory | App database (SQLite) |
| Version control | ✅ Follows project Git | ❌ Local only |
| Team sharing | ✅ Shared with team | ❌ Personal only |
| Editing | Edit in file system | UI editor |
| Resource files | ✅ Supported | ✅ Supported |

### Q: Why isn't my Skill being loaded?

Check the following:

1. The filename must be `SKILL.md` (uppercase)
2. The file must be in a subfolder under `.skills/`
3. Frontmatter format is correct (starts and ends with `---`)
4. The `name` field is not empty
5. The Skill is enabled (check in Skills Manager)

### Q: How many Skills can I have?

There is no hard limit. However, keeping it reasonable (10–20) is recommended — too many will increase AI's matching overhead.

### Q: What file formats are supported for resources?

Resources support common text formats (`.md`, `.py`, `.js`, `.ts`, `.json`, `.yaml`, `.txt`, `.sh`, etc.). Binary files are synced to the workspace but not processed as text content.

## Related Documentation

- [Getting Started](getting-started.md) — Basic usage guide
- [Workspace](workspace.md) — Project and workspace management
- [Conversation](conversation.md) — AI conversation capabilities
