---
title: Built-in Skills
order: 7
---

# Built-in Skills

Built-in Skills are global skill packages shipped with the application. They are available automatically across all projects without any manual configuration. They provide the same structural capabilities as Project Skills (instructions, reference docs, executable scripts) but are stored in a global location, fully isolated from project files.

## Built-in Skills vs Project Skills

| | Built-in Skills | Project Skills |
|---|---|---|
| **Location** | OPFS global directory `.skills/builtin/` | Project root `.skills/` |
| **Source** | Shipped with app releases | Created by users/teams |
| **Updates** | Auto-synced on app upgrade | Manual maintenance |
| **Python path** | `/mnt_skills/builtin/<skill>/` | `/mnt/<project>/.skills/<skill>/` |
| **Scope** | All projects | Current project only |

## Automatic Management

The platform manages the full lifecycle of built-in Skills — no user action required:

1. **First launch** — Built-in Skill files are synced to the OPFS global directory.
2. **App upgrade** — Only Skills with a changed version are incrementally updated.
3. **During sessions** — The Agent reads Skills via `read_skill` / `read_skill_resource`, or executes scripts directly under `/mnt_skills/`.

## Available Built-in Skills

### Socratic Brainstorm

A brainstorming mode based on Socratic dialogue. Helps diverge thinking, challenge assumptions, and converge on decisions.

- **Trigger keywords**: brainstorm, socratic, 头脑风暴, 苏格拉底, 想不清楚, 帮我想想, 探讨, 讨论
- **Usage**: Auto-matched by the Agent, or type `/brainstorm` in the editor.

> More built-in Skills will be added in future releases.

## How the Agent Uses Built-in Skills

### Reading Skill Instructions (low overhead)

```
read_skill          → Returns SKILL.md content + resource index
read_skill_resource → Returns a single resource file's content
```

### Executing Skill Scripts (requires file paths)

In the Python execution environment, built-in Skill scripts are available at the `/mnt_skills/` mount point:

```python
script = open('/mnt_skills/builtin/socratic-brainstorm/scripts/generate_questions.py').read()
exec(script)
```

### Slash Commands

Built-in Skills are automatically registered as slash commands. Type `/` in the editor to see the available command list.

## Directory Layout

```
OPFS root/
├── projects/                          ← Project files
└── .skills/                           ← Global Skills directory
    ├── manifest.json                  ← Sync manifest
    └── builtin/                       ← Built-in Skills
        └── socratic-brainstorm/
            ├── SKILL.md               ← Skill definition
            ├── references/
            │   └── questioning-patterns.md
            └── scripts/
                └── generate_questions.py
```

Pyodide mount mapping:

```
/mnt/           → Project files
/mnt_assets/    → Temporary asset files
/mnt_skills/    → Global Skills (read-only)
```

## FAQ

**Do built-in Skills take up project space?**

No. Built-in Skills are stored in the OPFS global directory, completely isolated from project files.

**Can I modify built-in Skills?**

Built-in Skills are mounted as read-only. They are only updated automatically when the application is upgraded.

**How do I create my own Skill?**

See [Project Skills](./project-skills.md) for creating custom Skills in your project's `.skills/` directory.
