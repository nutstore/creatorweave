---
name: cw-skill-creator
version: "1.0.1"
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit or optimize an existing skill, run evals to test a skill, benchmark skill performance, or optimize a skill's description for better triggering accuracy.
category: general
tags: [skill, creator, create, eval, benchmark, lint, validate]
triggers:
  keywords: [创建skill, 创建技能, create skill, skill creator, 测试skill, 改进skill, 优化skill, 评估skill]
---

# Skill Creator

A skill for creating new CreatorWeave workspace skills and iteratively improving them.

## Overview

The process of creating a skill goes like this:

1. Decide what you want the skill to do and roughly how it should do it
2. Write a draft of the skill
3. Create a few test prompts and evaluate them
4. Help the user evaluate the results both qualitatively and quantitatively
5. Rewrite the skill based on feedback
6. Repeat until satisfied
7. Optionally optimize the skill's description for better triggering

Your job is to figure out where the user is in this process and jump in to help them progress. If they say "I want to make a skill for X", help narrow down what they mean, write a draft, write test cases, and iterate. If they already have a draft, go straight to the eval/iterate part. Always be flexible — if the user says "I don't need evaluations, just vibe with me", do that instead.

## Three Modes of Operation

### Mode 1: Create

Triggered when the user wants to create a new skill from scratch or from an existing workflow.

#### Step 1: Capture Intent

Understand the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., "turn this into a skill"). Extract answers from conversation history first.

Collect this information:

1. **What should this skill enable the agent to do?**
2. **When should this skill trigger?** (user phrases/contexts)
3. **What's the expected output format?**
4. **Does the skill need scripts?** (Python scripts for deterministic/repetitive tasks)
5. **Does the skill need reference docs?** (API docs, templates, examples)
6. **Should we set up test cases?** (Skills with objectively verifiable outputs benefit from tests)

#### Step 2: Interview and Research

Proactively ask about edge cases, input/output formats, example files, success criteria, and dependencies. Come prepared with context to reduce burden on the user.

#### Step 3: Write the SKILL.md

Based on the user interview, generate the skill files.

**IMPORTANT — Two storage locations:**

1. **User skills** (personal, cross-project, persistent globally) — write to `vfs://skills/user/{skill-name}/SKILL.md`. These skills are available in ALL conversations/projects. Use this when the user says "create a skill I can reuse" or wants a personal skill that's not tied to a specific project.

2. **Project skills** (scoped to the current project workspace) — write to the project's `.skills/{skill-name}/SKILL.md` directory (normal workspace path with rootName prefix). These skills are only available in the current project.

**Default choice:** If the user doesn't specify, ask them: "Should this be a personal skill (available everywhere) or a project-specific skill?" If they say "personal" or "global", use `vfs://skills/user/`. If they say "project" or the skill is clearly tied to this codebase, use project `.skills/`.

**Creating a user skill (example):**

```
write(path="vfs://skills/user/my-report-generator/SKILL.md", content="...")
write(path="vfs://skills/user/my-report-generator/scripts/analyze.py", content="...")
write(path="vfs://skills/user/my-report-generator/references/format.md", content="...")
```

The `vfs://skills/user/` path maps to OPFS `.skills/user/` — a global directory not tied to any workspace. The skill will be loaded automatically on the next conversation.

**Creating a project skill (example):**

```
write(path="{rootName}/.skills/report-generator/SKILL.md", content="...")
```

**After creating a user skill**, the LLM should inform the user that the skill will be available in the next conversation (or after skill system refresh). The skill appears in the available skills list automatically.

**CreatorWeave SKILL.md frontmatter format:**

```yaml
---
name: cw-{skill-name}
description: When to trigger and what the skill does. Be specific about contexts.
category: general
tags: [tag1, tag2, tag3]
triggers:
  keywords: [keyword1, keyword2, keyword3]
---
```

**Key frontmatter fields:**
- `name` (required): Skill identifier with `cw-` prefix, kebab-case (e.g. `cw-my-skill`). Max 64 chars.
- `description` (required): When to trigger + what it does. Max 1024 chars. Be "pushy" — include contexts where the skill should be used even if the user doesn't explicitly ask for it.
- `category` (optional): `general`, `coding`, `data`, etc.
- `tags` (optional): Array of tag strings.
- `triggers.keywords` (optional): Array of trigger keywords/phrases.

**Directory structure (generate as needed):**

```
skill-name/
├── SKILL.md              # Required — always generated
├── scripts/              # Optional — Python scripts for deterministic tasks
│   └── analyze.py
├── references/           # Optional — Docs loaded into context as needed
│   └── api-docs.md
└── assets/               # Optional — Files used in output (templates, etc.)
    └── template.html
```

Simple skills need only `SKILL.md`. Complex skills add directories as needed. Do NOT create empty directories.

#### Skill Writing Guide

**Progressive Disclosure — skills use a three-level loading system:**
1. **Metadata** (name + description) — Always in context (~100 words)
2. **SKILL.md body** — In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** — As needed (scripts can execute without loading)

**Writing patterns:**
- Keep SKILL.md under 500 lines; if approaching this limit, add hierarchy with clear pointers
- Reference files clearly from SKILL.md with guidance on when to read them
- For large reference files (>300 lines), include a table of contents
- Use imperative form in instructions
- Explain *why* things are important, don't just use MUST/ALWAYS

**Defining output formats:**
```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**Examples pattern:**
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

#### Step 4: Validate

After generating the skill, run the validation script:

```bash
python scripts/quick_validate.py <skill_directory>
```

The script checks:
- SKILL.md exists
- Valid YAML frontmatter
- Required fields (name, description) present
- Name follows kebab-case with `cw-` prefix
- Description is under 1024 characters
- No angle brackets in description

Report the validation results to the user and fix any issues.

---

### Mode 2: Lint

Triggered when the user wants to check an existing skill for quality issues.

#### Step 1: Read and Validate

Read the skill's SKILL.md and run validation:

```bash
python scripts/quick_validate.py <skill_directory>
```

#### Step 2: Quality Checks

Beyond format validation, check for these common quality issues:

**Trigger quality:**
- Are trigger keywords specific enough? (Too broad = false triggers, too narrow = under-triggering)
- Does the description clearly distinguish this skill from similar ones?
- Are edge cases covered?

**Instruction quality:**
- Is the workflow clear and unambiguous?
- Are examples provided for complex operations?
- Are edge cases and error handling addressed?
- Is the skill under 500 lines? If not, should it be split?

**Structure quality:**
- Are reference files properly linked from SKILL.md?
- Do scripts have clear input/output contracts?
- Is the progressive disclosure properly layered?

#### Step 3: Report

Present findings as a structured report:

```markdown
## Skill Quality Report: {name}

### ✅ Passed Checks
- [list]

### ⚠️ Warnings
- [list with suggestions]

### ❌ Errors
- [list with fix suggestions]

### 💡 Improvement Suggestions
- [prioritized list]
```

---

### Mode 3: Eval

Triggered when the user wants to test a skill's effectiveness.

#### Step 1: Create Test Cases

Come up with 2-3 realistic test prompts — the kind of thing a real user would actually say. Share them with the user: "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?"

Save test cases as `evals/evals.json` inside the skill directory:

```json
{
  "skill_name": "skill-name",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "assertions": []
    }
  ]
}
```

#### Step 2: Run Test Cases

For each test case, spawn a subagent to execute the task with the skill loaded. The subagent should:
1. Read the skill's SKILL.md
2. Follow the skill's instructions to accomplish the test prompt
3. Save outputs

Also spawn a baseline subagent without the skill for comparison.

**With-skill subagent prompt:**
```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
```

**Baseline subagent prompt:**
```
Execute this task (no skill provided):
- Task: <eval prompt>
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/without_skill/outputs/
```

#### Step 3: Grade Results

Spawn a grader subagent using the instructions in `agents/grader.md`. The grader evaluates each assertion against the outputs and produces a `grading.json`.

#### Step 4: Aggregate and Review

Run the benchmark aggregation:

```python
from scripts.aggregate_benchmark import generate_benchmark, generate_markdown
benchmark = generate_benchmark(Path("<workspace>/iteration-N"), skill_name="<name>")
```

Present results to the user:
- Qualitative: show the actual outputs side by side
- Quantitative: show pass rates and timing

#### Step 5: Iterate

Based on user feedback:
1. Improve the skill
2. Rerun test cases into a new `iteration-<N+1>/` directory
3. Launch review with `--previous-workspace` for comparison
4. Repeat until satisfied

---

## Description Optimization

After creating or improving a skill, offer to optimize the description for better triggering accuracy.

### Generate Trigger Eval Queries

Create 20 eval queries — a mix of should-trigger and should-not-trigger:

```json
[
  {"query": "realistic user prompt with context", "should_trigger": true},
  {"query": "adjacent but different intent", "should_trigger": false}
]
```

**Good queries are specific and realistic** — include file paths, personal context, column names. Not abstract like "Format this data".

**Should-trigger (8-10):** Different phrasings, formal/casual mix, uncommon use cases.
**Should-not-trigger (8-10):** Near-misses — share keywords but need something different.

### Review with User

Present the eval set for user review before running optimization.

### Run Optimization

Since we can't use `claude -p`, the agent performs optimization inline:

1. Evaluate current description against the eval queries (simulate by reasoning about whether the description would trigger)
2. Analyze failures — what patterns are missed?
3. Propose improved description
4. Re-evaluate
5. Iterate up to 5 times

### Apply Result

Update the skill's SKILL.md frontmatter with the best description. Show before/after and explain the changes.

---

## Packaging

When the skill is complete, offer to package it:

```python
from scripts.package_skill import package_skill
result = package_skill("<skill_path>", "<output_dir>")
```

This creates a distributable `.skill` file (zip format).

---

## Reference Files

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison between two outputs
- `agents/analyzer.md` — How to analyze why one version beat another
- `references/schemas.md` — JSON structures for evals.json, grading.json, etc.

---

## Core Loop (TL;DR)

1. Figure out what the skill is about
2. Draft or edit the skill
3. Run test cases with subagents (with-skill vs baseline)
4. Grade, aggregate, and present results to the user
5. Improve based on feedback
6. Repeat until satisfied
7. Optionally optimize description
8. Package and deliver
