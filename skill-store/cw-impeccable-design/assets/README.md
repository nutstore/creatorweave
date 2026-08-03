# Impeccable Design — Assets

This directory contains reusable templates and references for the `cw-impeccable-design` skill.

## Files

### `PRODUCT.template.md`

Use as the starting point when running `/impeccable init` (see `references/commands/init.md`). Captures:
- Platform (web / ios / android / adaptive)
- Surface name (the specific page/feature, not the whole product)
- Users, goal, brand voice, anti-references

Schema version tracked via `<!-- impeccable:product-schema N -->` comment.

### `DESIGN.template.md`

Use as the starting point when running `/impeccable document` (see `references/commands/document.md`). Follows the official [DESIGN.md spec](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md):

- **YAML frontmatter** = machine-readable tokens (colors, typography, rounded, spacing, components)
- **Markdown body** = 8 canonical sections (Overview / Colors / Typography / Layout / Elevation & Depth / Shapes / Components / Do's and Don'ts)

Tokens are normative; prose explains how to apply them. Variants follow naming convention (`button-primary` / `button-primary-hover`).

### `anti-patterns.md`

The 59 deterministic anti-pattern rules from the original Impeccable detector, reformulated as **design principles for LLM-driven review**. Read this when running `audit`, `critique`, or any refinement command to make sure the LLM has the full anti-slop reference.

### `README.md` (this file)

You're reading it.

---

## How to use

1. **Starting a new project?** Copy `PRODUCT.template.md` to your project root, fill in the fields, then run `/impeccable init` (or let the LLM guide you).
2. **Documenting an existing codebase?** Read `references/commands/document.md`, then use `DESIGN.template.md` as the output format.
3. **Reviewing existing work?** Read `anti-patterns.md` to know what to look for, then run `/impeccable critique` or `/impeccable audit`.

---

## Source

All content derives from [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache 2.0). See `references/NOTICE.md` for full attribution.
