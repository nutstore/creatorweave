Generate a `DESIGN.md` file at the project root that captures the current visual design system, so AI agents generating new screens stay on-brand.

DESIGN.md follows the [official DESIGN.md format spec](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md): optional YAML frontmatter carrying machine-readable design tokens, followed by up to eight markdown sections in a fixed order. **Tokens are normative; prose provides context for how to apply them.** Sections may be omitted when not relevant, but those present stay in the specified order. Use the canonical headings below so the file remains portable across DESIGN.md-aware tools.

## The frontmatter: token schema

The YAML frontmatter is the machine-readable layer. It's what Stitch's linter validates and what the live panel renders tiles from. Keep it tight; every entry should correspond to a token the project actually uses.

```yaml
---
name: <project title>
description: <one-line tagline>
colors:
  primary: "#b8422e"
  neutral-bg: "#faf7f2"
  # ...one entry per extracted color; key = descriptive slug
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "normal"
  body:
    # ...
rounded:
  sm: "4px"
  md: "8px"
spacing:
  sm: "8px"
  md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "16px 48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
---
```

Rules that matter:

- **Token refs** use `{path.to.token}` (e.g. `{colors.primary}`, `{rounded.md}`). Components may reference primitives; primitives may not reference each other.
- **Colors accept any valid CSS color string.** Hex is the recommended default for portability, but preserve an incumbent `rgb()`, `hsl()`, `oklch()`, wide-gamut, or mixed-color value when it is the project's normative source. Never split the source of truth without explicit reason.
- **Component sub-tokens** are limited to 8 props: `backgroundColor`, `textColor`, `typography`, `rounded`, `padding`, `size`, `height`, `width`. Shadows, motion, focus rings, backdrop-filter: none of those fit. Carry them in the sidecar.
- **Scale keys are open-ended.** Use whatever names the project already uses.
- **Variants are naming convention, not schema.** `button-primary` / `button-primary-hover` / `button-primary-active` as sibling keys.

## The markdown body: eight sections (canonical order)

1. `## Overview`
2. `## Colors`
3. `## Typography`
4. `## Layout`
5. `## Elevation & Depth`
6. `## Shapes`
7. `## Components`
8. `## Do's and Don'ts`

Omit irrelevant sections rather than filling them with invented rules. Put responsive layout in Layout, depth in Elevation & Depth, radius and form language in Shapes, and per-component behavior in Components.

## When to run

- New-work found a coherent incumbent visual system but no `DESIGN.md`.
- The first implementation of a new world is complete and its provisional decisions need to be carbonized.
- An existing `DESIGN.md` is stale (the design has drifted).
- Before a large redesign, to capture the current state as a reference.

If a `DESIGN.md` already exists, **do not silently overwrite it**. Show the user the existing file and ask whether to refresh, overwrite, or merge.

## Two paths

- **Scan mode** (default): the project has design tokens, components, or rendered output. Extract, then confirm descriptive language. Use when there's code to analyze.
- **Seed mode**: the project is pre-implementation. Ensure PRODUCT.md exists, then reuse new-work's visual-world workshop and write its directional DESIGN.md seed. Re-run in scan mode once there's code.

Decide by scanning first. If the scan finds no tokens, no component files, and no rendered site, offer seed mode; don't silently switch.

## Scan mode (auto-extract, then confirm descriptive language)

### Step 1: Find the design assets

Search the codebase in priority order:

1. **CSS custom properties**: grep for `--color-`, `--font-`, `--spacing-`, `--radius-`, `--shadow-`, `--ease-`, `--duration-` declarations in CSS files.
2. **Tailwind config**: if `tailwind.config.{js,ts,mjs}` exists, read the `theme.extend` block.
3. **CSS-in-JS theme files**: styled-components, emotion, vanilla-extract, stitches.
4. **Design token files**: `tokens.json`, `design-tokens.json`, Style Dictionary output.
5. **Component library**: scan main button, card, input, navigation, dialog components.
6. **Global stylesheet**: the root CSS file with base typography and color.
7. **Visible rendered output**: if browser automation tools are available, load the live site and sample computed styles.

### Step 2: Auto-extract

Build a structured draft from the discovered tokens. For each token class:

- **Colors**: Group into Primary / Secondary / Tertiary / Neutral. If the project only has one accent, express it as Primary + Neutral.
- **Typography**: Map observed sizes and weights to the Material hierarchy (display / headline / title / body / label). Note font-family stacks and the scale ratio.
- **Elevation**: Catalogue the shadow vocabulary. If the project is flat and uses tonal layering, state it explicitly.
- **Components**: For each common component, extract shape, color, hover/focus, padding.
- **Layout + spacing**: Grid, container, breakpoint, rhythm, density.

### Step 3: Ask the user for qualitative language

The following require creative input that cannot be auto-extracted. Ask in two structured rounds of no more than three questions each:

- **Creative North Star**: a single named metaphor for the whole system. Offer 2-3 options that honor PRODUCT.md's brand personality.
- **Overview voice**: mood adjectives, aesthetic philosophy, and any confirmed visual anti-reference.
- **Color character** (for auto-extracted colors): descriptive names ("Deep Muted Teal-Navy", not "blue-800").
- **Elevation philosophy**: flat/layered/lifted.
- **Component philosophy**: the feel of buttons, cards, inputs in one phrase.

Carry a line from PRODUCT.md only when it is a durable brand commitment that actually constrains the visual system.

### Step 4: Write DESIGN.md

The file opens with the YAML frontmatter staged in Step 2, then the markdown body using the canonical structure.

```markdown
---
name: [Project Title]
description: [one-line tagline]
colors:
  # ... staged frontmatter
---

# Design System: [Project Title]

## Overview
**Creative North Star: "[Named metaphor in quotes]"**
[2-3 paragraph holistic description. State confirmed visual rejections. End with **Key Characteristics:** bullet list.]

## Colors
[Describe the palette character in one sentence.]
### Primary
- **[Descriptive Name]** (#HEX): [Where and why this color is used.]
### Secondary (optional)
### Tertiary (optional)
### Neutral
[Named color roles with hex and context]

## Typography
**Display Font:** [Family] (with [fallback])
**Body Font:** [Family] (with [fallback])
**Label/Mono Font:** [Family, if distinct]
**Character:** [1-2 sentence personality description.]
### Hierarchy
- **Display** (weight, size, line-height): [Purpose.]
- **Headline** (...): [Purpose.]
- **Title** (...): [Purpose.]
- **Body** (...): [Purpose. Include max line length like 65-75ch.]
- **Label** (...): [Purpose.]

## Layout
[Grid, container, density, responsive changes, spacing rhythm.]

## Elevation & Depth
[Shadows vs tonal layering vs hybrid. If "no shadows", say so explicitly.]

## Shapes
[Corner/radius, borders, clipping, recurring geometry.]

## Components
### Buttons
[Shape, color, hover/focus, variants]
### Cards / Containers
[Corner, background, shadow, padding]
### Inputs / Fields
[Style, focus, error/disabled]
### Navigation
[Style, typography, states, mobile treatment]

## Do's and Don'ts
### Do:
### Don't:
```

### Step 4b: Write `.impeccable/design.json` sidecar

The sidecar carries what Stitch's schema can't hold: tonal ramps per color, shadow/elevation tokens, motion tokens, breakpoints, full component HTML/CSS snippets, and narrative (north star, rules, do's/don'ts).

```json
{
  "schemaVersion": 2,
  "generatedAt": "ISO-8601 string",
  "title": "Design System: [Project Title]",
  "extensions": {
    "colorMeta": { ... },
    "typographyMeta": { ... },
    "shadows": [...],
    "motion": [...],
    "breakpoints": [...]
  },
  "components": [
    {
      "name": "Primary Button",
      "kind": "button | input | nav | chip | card | custom",
      "refersTo": "button-primary",
      "description": "One-line what and when.",
      "html": "<button class=\"ds-btn-primary\">SAVE CHANGES</button>",
      "css": ".ds-btn-primary { background: #191c1d; color: #fff; padding: 16px 48px; ... }"
    }
  ],
  "narrative": {
    "northStar": "...",
    "overview": "...",
    "keyCharacteristics": [...],
    "rules": [...],
    "dos": [...],
    "donts": [...]
  }
}
```

**Component translation rules** (the panel injects these into a shadow DOM):

1. **Tailwind expansion**: translate utility classes to literal CSS properties.
2. **Token resolution**: reference CSS custom properties via `var(--token)`, or resolve to literal values at generation time.
3. **Icons**: inline SVG; do not reference icon packages.
4. **States**: include `:hover`, `:focus-visible`, `:active` rules inline.
5. **Reset bloat**: extract only the component's distinctive CSS; skip universal resets.
6. **Scoped class names**: prefix every class with `ds-` (e.g. `ds-btn-primary`).

Aim for 5-10 components that best represent the visual system: button (each variant), input/text field, navigation, chip/tag, card, plus any signature components.

For tonal ramps, generate an 8-step array: dark to light, same hue and chroma, stepped lightness from ~15% to ~95%.

### Step 5: Confirm and refine

1. Show the user the full DESIGN.md. Briefly highlight non-obvious creative choices.
2. Mention `.impeccable/design.json` was also written; the live panel will now render this project's actual primitives.
3. Offer to refine any section.

## Seed mode

For projects with no visual system to extract yet.

### Step 1: Route through new-work's workshop

PRODUCT.md is the prerequisite. If missing, complete init first.

If PRODUCT.md exists, load new-work.md and resolve visual authority. Run new-work's Create or replace the visual world flow, then Commit the world. Stop after the directional DESIGN.md seed and surface brief; do not implement.

### Step 2: Write seed DESIGN.md

Use the canonical section order. Lead the file with:

```markdown
<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->
```

Per-section guidance:

- **Overview**: the chosen design thesis, layout, material, imagery, motion.
- **Colors**: the selected palette strategy; mark values `[to be resolved during implementation]` if not established.
- **Typography**: the selected type character; mark font names `[to be resolved]` if not established.
- **Layout**: the selected spatial grammar.
- **Elevation & Depth**: the selected material and depth.
- **Shapes**: the selected form and corner language.
- **Components**: omit entirely.
- **Do's and Don'ts**: durable guardrails confirmed during the world choice.

Seed mode writes minimal frontmatter (`name`, `description` only). Skip `.impeccable/design.json` in seed mode.

### Step 3: Confirm

1. Show the seed DESIGN.md. Call out the SEED marker.
2. Tell the user: "Re-run `/impeccable document` once you have some code. That pass will extract real tokens and generate the sidecar."

## Style guidelines

- **Frontmatter first, prose second.** Tokens in YAML, prose contextualizes them.
- **Match the spec**: 8 canonical sections in order.
- **Descriptive > technical**: "Gently curved edges (8px radius)" > "rounded-lg".
- **Functional > decorative**: WHERE and WHY, not just WHAT.
- **Exact values in parens**: hex, px/rem, font weights.
- **Use Named Rules**: `**The [Name] Rule.** [short doctrine]`. 1-3 per section.
- **Be decisive where evidence is decisive.**

## Pitfalls

- Don't paste raw CSS class names. Translate to descriptive language.
- Don't extract every token. Stop at what's actually reused.
- Don't invent components that don't exist.
- Don't overwrite an existing DESIGN.md without asking.
- Don't duplicate content from PRODUCT.md. DESIGN.md is strictly visual.
- Don't rename sections even slightly. Tooling parsing depends on exact headers.
- Don't duplicate token values between frontmatter and prose. The frontmatter is normative.
- Don't invent frontmatter token groups outside Stitch's schema.
